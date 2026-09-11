// A semicircular speedometer-style gauge for the Dashboard's Closing Balance — the needle
// position is the fraction of funds-available-so-far (opening balance + monetary donations)
// that has already been spent (see calculations.ts's computeSpentFraction doc comment for the
// exact formula and edge cases). Pure SVG/trig, no chart library — this is one shape, not worth
// pulling in Chart.js (already lazy-loaded only for the Reports page) for.

const CENTER_X = 100
const CENTER_Y = 100
const RADIUS = 80
const STROKE_WIDTH = 18
// Semicircle: needle sweeps from 180° (far left, fraction 0) to 0° (far right, fraction 1),
// passing through 90° (straight up) at fraction 0.5 — standard speedometer orientation.
const START_ANGLE_DEG = 180
const END_ANGLE_DEG = 0

function polarToCartesian(angleDeg: number): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180
  return { x: CENTER_X + RADIUS * Math.cos(angleRad), y: CENTER_Y - RADIUS * Math.sin(angleRad) }
}

function arcPath(fromDeg: number, toDeg: number): string {
  const from = polarToCartesian(fromDeg)
  const to = polarToCartesian(toDeg)
  const largeArcFlag = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0
  // Sweeping from a higher angle to a lower one (e.g. 180 -> 120) always goes clockwise on
  // screen given the y-flip in polarToCartesian, so sweep-flag is fixed at 1 throughout.
  return `M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${to.x} ${to.y}`
}

interface GaugeZone {
  /** Where this color zone starts, as a fraction (0-1) along the full 0-1 needle range. */
  from: number
  to: number
  color: string
}

/** Three fixed zones matching the app's positive/warning/negative palette — green while less
 *  than 70% of funds-so-far are spent, amber approaching the limit, red once spending has used
 *  up (or exceeded) everything raised so far. Colors are the same fixed light-mode-independent
 *  hexes StatCard/balance-banner already key off of via CSS variables — passed as literal
 *  values here (not var(--color-*)) so the gauge PNG-exports identically regardless of the
 *  active theme, matching every other export in this app (see DEVELOPER_GUIDE.md's theme
 *  gotchas). */
const ZONES: GaugeZone[] = [
  { from: 0, to: 0.7, color: '#15803d' },
  { from: 0.7, to: 0.9, color: '#d97706' },
  { from: 0.9, to: 1, color: '#b91c1c' },
]

function fractionToAngle(fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction))
  return START_ANGLE_DEG + (END_ANGLE_DEG - START_ANGLE_DEG) * clamped
}

interface BalanceGaugeProps {
  /** 0-1 fraction of funds-available-so-far already spent — see computeSpentFraction. Values
   *  above 1 (spending exceeded what's been raised) are clamped visually to the far end of the
   *  gauge; the needle pins at maximum rather than the SVG breaking. */
  spentFraction: number
  valueLabel: string
  subLabel: string
}

export function BalanceGauge({ spentFraction, valueLabel, subLabel }: BalanceGaugeProps) {
  const needleAngle = fractionToAngle(spentFraction)
  const needleTip = polarToCartesian(needleAngle)
  const isOverspent = spentFraction >= 1

  return (
    <div className="balance-gauge">
      <svg viewBox="0 0 200 115" className="balance-gauge__svg" role="img" aria-label={`Closing balance gauge: ${valueLabel}`}>
        {ZONES.map((zone) => (
          <path
            key={zone.color}
            d={arcPath(fractionToAngle(zone.from), fractionToAngle(zone.to))}
            stroke={zone.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="butt"
            fill="none"
          />
        ))}
        <line
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={isOverspent ? '#b91c1c' : '#1c1917'}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={CENTER_X} cy={CENTER_Y} r={7} fill={isOverspent ? '#b91c1c' : '#1c1917'} />
      </svg>
      <div className="balance-gauge__readout">
        <div className={`balance-gauge__value ${isOverspent ? 'balance-gauge__value--negative' : ''}`}>{valueLabel}</div>
        <div className="balance-gauge__sub">{subLabel}</div>
      </div>
    </div>
  )
}
