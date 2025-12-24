'use client';

import { useEffect, useState } from 'react';
import { SequenceDetail } from './SequenceDetail';

export function SequenceDetailWrapper() {
  const [sequenceId, setSequenceId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      window.location.href = '/admin/sequences';
      return;
    }

    setSequenceId(id);
  }, []);

  if (!sequenceId) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-200 rounded" />
      </div>
    );
  }

  return <SequenceDetail sequenceId={sequenceId} />;
}
