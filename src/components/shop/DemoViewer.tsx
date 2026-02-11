'use client';

import { useState } from 'react';
import DeviceToggle from './DeviceToggle';

type Device = 'desktop' | 'tablet' | 'mobile';

interface DemoViewerProps {
  demoUrl: string;
}

const deviceWidths: Record<Device, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

export default function DemoViewer({ demoUrl }: DemoViewerProps) {
  const [device, setDevice] = useState<Device>('desktop');

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <DeviceToggle device={device} onChange={setDevice} />
        <a
          href={demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          新しいタブで開く
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>

      {/* iframe container */}
      <div
        className="flex justify-center bg-gray-50 rounded-xl p-4 min-h-[600px]"
      >
        <div
          className="transition-all duration-300 ease-in-out w-full"
          style={{
            maxWidth: deviceWidths[device],
          }}
        >
          <iframe
            src={demoUrl}
            title="Live Demo"
            className="w-full h-[600px] bg-white border border-gray-200 rounded-lg shadow-md"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>
    </div>
  );
}
