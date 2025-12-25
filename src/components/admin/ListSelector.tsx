'use client';

import { useState, useEffect } from 'react';
import { getContactLists, type ContactList } from '../../utils/admin-api';

interface Props {
  value: string | null;
  onChange: (listId: string | null) => void;
  label?: string;
  allowNull?: boolean;
}

export function ListSelector({ value, onChange, label = 'Contact List', allowNull = true }: Props) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLists();
  }, []);

  async function loadLists() {
    setLoading(true);
    try {
      const result = await getContactLists();
      if (result.success && result.data) {
        setLists(result.data.lists);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading lists...</div>;
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent"
      >
        {allowNull && <option value="">全員配信（リスト未選択）</option>}
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
    </div>
  );
}
