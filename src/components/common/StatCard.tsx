interface StatCardProps {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'negative' | 'muted'
  hint?: string
}

export function StatCard({ label, value, tone = 'default', hint }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {hint && <div className="stat-card__hint">{hint}</div>}
    </div>
  )
}
