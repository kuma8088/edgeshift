interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  color?: 'default' | 'success' | 'warning' | 'danger';
}

const colorClasses = {
  default: 'border-[#e5e5e5]',
  success: 'border-l-4 border-l-green-500',
  warning: 'border-l-4 border-l-yellow-500',
  danger: 'border-l-4 border-l-red-500',
};

export function KPICard({ title, value, subtitle, color = 'default' }: KPICardProps) {
  return (
    <div className={`bg-white rounded-lg p-6 shadow-sm border ${colorClasses[color]}`}>
      <p className="text-sm text-[#525252] mb-1">{title}</p>
      <p className="text-3xl font-bold text-[#1e1e1e]">{value}</p>
      {subtitle && (
        <p className="text-xs text-[#a3a3a3] mt-1">{subtitle}</p>
      )}
    </div>
  );
}
