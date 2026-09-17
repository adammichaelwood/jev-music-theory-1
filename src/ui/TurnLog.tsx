import { useState } from 'react'
import type { StepRecord, TurnRecord } from '../jev/turn.ts'

const top = (r: StepRecord, n = 5) => Object.entries(r.probabilities).sort((a, b) => b[1] - a[1]).slice(0, n)

export function TurnLog({ turns }: { turns: TurnRecord[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="turnlog">
      {[...turns].reverse().map(t => (
        <div key={t.n} className={`turn ${t.stopped ? 'stopped' : ''} ${open === t.n ? 'open' : ''}`} onClick={() => setOpen(open === t.n ? null : t.n)}>
          <b>{t.n}</b> {t.stopped ? 'STOP' : t.steps.map(s => s.choice).join(' · ')}
          {t.removed?.length ? <i> (replaced {t.removed.map(n => `${n.letter}${n.acc === 'sharp' ? '♯' : n.acc === 'flat' ? '♭' : ''}${n.octave}`).join(', ')})</i> : null}
          {t.invalid ? <i> INVALID: {t.invalid}</i> : null}
          <span className="conf"> conf {t.steps.map(s => s.confidence.toFixed(2)).join(' ')}</span>
          {open === t.n && (
            <div className="turndetail" onClick={e => e.stopPropagation()}>
              {t.steps.map(s => (
                <div key={s.step}><b>{s.step}</b> ({s.ms}ms, {s.inputTokens} tok): {top(s).map(([k, p]) => `${k} ${(p * 100).toFixed(0)}%`).join(' · ')}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
