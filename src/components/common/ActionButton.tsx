import { useActionDisplayMode } from '@/hooks/useYearData'

interface ActionButtonProps {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}

/** Drop-in replacement for the plain `<button className="link-button">Label</button>` row
 *  actions used throughout the app — renders icon/text/both according to the user's Settings ›
 *  Appearance choice (Settings › Appearance), defaulting to text-only so nothing changes
 *  visually until someone opts in. */
export function ActionButton({ icon, label, onClick, danger }: ActionButtonProps) {
  const mode = useActionDisplayMode()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={mode === 'icon' ? label : undefined}
      className={`link-button ${danger ? 'link-button--danger' : ''} ${mode === 'icon' ? 'link-button--icon-only' : ''}`}
    >
      {mode !== 'text' && <span aria-hidden="true">{icon}</span>}
      {mode !== 'icon' && <span>{label}</span>}
    </button>
  )
}
