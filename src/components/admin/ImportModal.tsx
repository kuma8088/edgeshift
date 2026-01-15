'use client';

import { useState, useEffect } from 'react';
import {
  importSubscribers,
  getContactLists,
  type ContactList,
  type ImportResult,
} from '../../utils/admin-api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewRow {
  email: string;
  name?: string;
}

export function ImportModal({ isOpen, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load contact lists when modal opens
  useEffect(() => {
    if (isOpen) {
      loadContactLists();
      // Reset state
      setFile(null);
      setPreview([]);
      setTotalRows(0);
      setSelectedListId('');
      setResult(null);
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);
    setError(null);

    // Parse CSV for preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter((line) => line.trim());

      if (lines.length === 0) {
        setError('CSVファイルが空です');
        return;
      }

      // Detect header
      const header = lines[0].toLowerCase();
      const hasHeader = header.includes('email') || header.includes('name');
      const dataStart = hasHeader ? 1 : 0;

      const rows: PreviewRow[] = [];
      for (let i = dataStart; i < Math.min(dataStart + 5, lines.length); i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols[0]) {
          rows.push({
            email: cols[0],
            name: cols[1] || undefined,
          });
        }
      }

      setPreview(rows);
      setTotalRows(lines.length - dataStart);
    };
    reader.readAsText(selectedFile);
  }

  async function handleImport() {
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const res = await importSubscribers(file, selectedListId || undefined);
      if (res.success && res.data) {
        setResult(res.data);
        if (res.data.imported > 0) {
          onSuccess();
        }
      } else {
        setError(res.error || 'インポートに失敗しました');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">CSVインポート</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        {result ? (
          // Result display
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded">
              <h3 className="font-semibold text-green-800 mb-2">インポート完了</h3>
              <ul className="text-sm text-green-700 space-y-1">
                <li>インポート成功: {result.imported}件</li>
                <li>スキップ: {result.skipped}件</li>
                {result.errors.length > 0 && (
                  <li className="text-red-600">エラー: {result.errors.length}件</li>
                )}
              </ul>
            </div>

            {result.errors.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                <h4 className="font-semibold text-yellow-800 mb-2">エラー詳細</h4>
                <ul className="text-sm text-yellow-700 space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>
                      行{err.row}: {err.email} - {err.reason}
                    </li>
                  ))}
                  {result.errors.length > 10 && (
                    <li className="text-gray-500">...他 {result.errors.length - 10}件</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : (
          // Import form
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSVファイルを選択
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                形式: email,name (1行目がヘッダーの場合は自動検出されます)
              </p>
            </div>

            {preview.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  プレビュー ({totalRows}件中、最初の{preview.length}件)
                </h3>
                <div className="border border-gray-200 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600">Email</th>
                        <th className="px-3 py-2 text-left text-gray-600">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="px-3 py-2 text-gray-900">{row.email}</td>
                          <td className="px-3 py-2 text-gray-600">{row.name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                追加先のリスト（任意）
              </label>
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              >
                <option value="">リストに追加しない</option>
                {contactLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                disabled={importing}
              >
                キャンセル
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
                disabled={!file || importing}
              >
                {importing ? 'インポート中...' : 'インポート'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
