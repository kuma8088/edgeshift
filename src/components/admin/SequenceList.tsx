'use client';

import { useState, useEffect } from 'react';
import { listSequences, deleteSequence, updateSequence } from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

interface SequenceStep {
  delay_days: number;
  subject: string;
  content: string;
}

interface Sequence {
  id: string;
  name: string;
  description?: string;
  is_active: number;
  steps: SequenceStep[];
  created_at: number;
}

export function SequenceList() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    sequenceId: string;
    sequenceName: string;
  }>({
    isOpen: false,
    sequenceId: '',
    sequenceName: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSequences = async () => {
    setLoading(true);
    const result = await listSequences();
    if (result.success && result.data) {
      const data = result.data as { sequences: Sequence[]; total: number };
      setSequences(data.sequences || []);
      setError(null);
    } else {
      setError(result.error || 'Failed to load sequences');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSequences();
  }, []);

  const handleDelete = (sequence: Sequence) => {
    setConfirmModal({
      isOpen: true,
      sequenceId: sequence.id,
      sequenceName: sequence.name,
    });
  };

  const handleToggleActive = async (sequence: Sequence) => {
    setActionLoading(true);
    const newActiveState = sequence.is_active === 1 ? 0 : 1;
    const result = await updateSequence(sequence.id, { is_active: newActiveState });

    if (result.success) {
      await fetchSequences(); // Refresh list
    } else {
      setError(result.error || 'Failed to toggle sequence status');
    }
    setActionLoading(false);
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    const result = await deleteSequence(confirmModal.sequenceId);

    if (result.success) {
      setConfirmModal({ isOpen: false, sequenceId: '', sequenceName: '' });
      await fetchSequences(); // Refresh list
    } else {
      setError(result.error || 'Delete failed');
    }
    setActionLoading(false);
  };

  const cancelDelete = () => {
    setConfirmModal({ isOpen: false, sequenceId: '', sequenceName: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchSequences}
          className="px-6 py-2 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[#525252] mb-4">シーケンスがまだありません</p>
        <a
          href="/admin/sequences/new"
          className="inline-block px-6 py-2 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors"
        >
          新規作成
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {sequences.map((sequence) => (
          <div
            key={sequence.id}
            className="bg-white rounded-lg p-6 shadow-sm border border-[#e5e5e5] hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-[#1e1e1e]">
                    {sequence.name}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      sequence.is_active === 1
                        ? 'bg-green-500 text-white'
                        : 'bg-[#a3a3a3] text-white'
                    }`}
                  >
                    {sequence.is_active === 1 ? 'アクティブ' : '非アクティブ'}
                  </span>
                </div>
                {sequence.description && (
                  <p className="text-sm text-[#525252] mb-2">
                    {sequence.description}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-[#a3a3a3]">
                  <span>ステップ数: {sequence.steps?.length || 0}</span>
                  <span>作成: {new Date(sequence.created_at * 1000).toLocaleString('ja-JP')}</span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleToggleActive(sequence)}
                  disabled={actionLoading}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    sequence.is_active === 1
                      ? 'border border-[#a3a3a3] text-[#525252] hover:bg-[#f5f5f5]'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {sequence.is_active === 1 ? '無効化' : '有効化'}
                </button>
                <a
                  href={`/admin/sequences/edit?id=${sequence.id}`}
                  className="px-3 py-1 text-sm border border-[#e5e5e5] text-[#525252] rounded-lg hover:bg-[#f5f5f5] transition-colors"
                >
                  編集
                </a>
                <button
                  onClick={() => handleDelete(sequence)}
                  className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="シーケンスを削除"
        message={`「${confirmModal.sequenceName}」を削除してもよろしいですか？この操作は取り消せません。`}
        confirmText="削除"
        cancelText="キャンセル"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        loading={actionLoading}
      />
    </>
  );
}
