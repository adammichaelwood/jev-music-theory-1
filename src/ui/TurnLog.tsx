import type { TurnRecord } from '../jev/turn.ts'

export function TurnLog({ turns, onSelect }: { turns: TurnRecord[]; onSelect?: (t: TurnRecord) => void }) {
  return (
    <div className="turnlog">
      {[...turns].reverse().map(t => (
        <div key={t.n} className={`turn ${t.stopped ? 'stopped' : ''}`} onClick={() => onSelect?.(t)}>
          <b>{t.n}</b> {t.stopped ? 'STOP' : t.steps.map(s => s.choice).join(' · ')}
          {t.removed?.length ? <i> (replaced {t.removed.length})</i> : null}
          <span className="conf"> conf {t.steps.map(s => s.confidence.toFixed(2)).join(' ')}</span>
        </div>
      ))}
    </div>
  )
}
