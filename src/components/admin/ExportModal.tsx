'use client';

import { useState, useEffect } from 'react';
import { getContactLists, getExportUrl, getApiKey, type ContactList } from '../../utils/admin-api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type StatusFilter = 'active' | 'all';

export function ExportModal({ isOpen, onClose }: Props) {
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load contact lists when modal opens
  useEffect(() => {
    if (isOpen) {
      loadContactLists();
      // Reset state
      setSelectedListId('');
      setStatusFilter('active');
      setError(null);
    }
  }, [isOpen]);

  async function loadContactLists() {
    try {
      const res = await getContactLists();
      if (res.success && res.data) {
        setContactLists(res.data.lists);
      }
    } catch (err) {
      console.error('Failed to load contact lists:', err);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      const url = getExportUrl({
        contactListId: selectedListId || undefined,
        status: statusFilter === 'all' ? 'all' : 'active',
      });

      const apiKey = getApiKey();
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Export failed: ${response.status}`);
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'subscribers.csv';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Create blob and trigger download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エクスポートに失敗しました');
    } finally {
      setExporting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">CSVエクスポート</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              エクスポート対象
            </label>
            <select
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
            >
              <option value="">全購読者</option>
              {contactLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ステータス</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="statusFilter"
                  value="active"
                  checked={statusFilter === 'active'}
                  onChange={() => setStatusFilter('active')}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">アクティブのみ</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="statusFilter"
                  value="all"
                  checked={statusFilter === 'all'}
                  onChange={() => setStatusFilter('all')}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">全ステータス</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              disabled={exporting}
            >
              キャンセル
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
              disabled={exporting}
            >
              {exporting ? 'エクスポート中...' : 'エクスポート'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
