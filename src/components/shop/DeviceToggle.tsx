'use client';

import type React from 'react';

type Device = 'desktop' | 'tablet' | 'mobile';

interface DeviceToggleProps {
  device: Device;
  onChange: (device: Device) => void;
}

const devices: { key: Device; label: string; width: string; icon: React.ReactNode }[] = [
  {
    key: 'desktop',
    label: 'Desktop',
    width: '1024px',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'tablet',
    label: 'Tablet',
    width: '768px',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'mobile',
    label: 'Mobile',
    width: '375px',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export default function DeviceToggle({ device, onChange }: DeviceToggleProps) {
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-full p-1 gap-1">
      {devices.map((d) => (
        <button
          key={d.key}
          onClick={() => onChange(d.key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
            device === d.key
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
          }`}
          title={`${d.label} (${d.width})`}
        >
          {d.icon}
          <span className="hidden sm:inline">{d.label}</span>
        </button>
      ))}
    </div>
  );
}
