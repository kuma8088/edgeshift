interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  color?: 'default' | 'success' | 'warning' | 'danger';
}

const colorClasses = {
  default: 'border-[var(--color-border)]',
  success: 'border-l-4 border-l-green-500',
  warning: 'border-l-4 border-l-yellow-500',
  danger: 'border-l-4 border-l-red-500',
};

export function KPICard({ title, value, subtitle, color = 'default' }: KPICardProps) {
  return (
    <div className={`bg-white rounded-lg p-6 shadow-sm border ${colorClasses[color]}`}>
      <p className="text-sm text-[var(--color-text-secondary)] mb-1">{title}</p>
      <p className="text-3xl font-bold text-[var(--color-text)]">{value}</p>
      {subtitle && (
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}
