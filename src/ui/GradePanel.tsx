import type { Report } from '../grader/index.ts'

export function GradePanel({ report: r }: { report: Report }) {
  return (
    <div className="grade">
      <div className="gradehead">
        <b>{r.complete ? 'complete' : 'incomplete'}</b> · <span className="err">{r.errors} errors</span> · <span className="warn">{r.warnings} warnings</span>
      </div>
      <div className="chords">{r.moments.map(m => <span key={m.abs} className={m.issues.some(i => i.severity === 'error') ? 'bad' : ''} title={`m${m.m + 1} beat ${m.beat + 1}`}>{m.chord?.numeral ?? '?'}</span>)}</div>
      <ul>{r.issues.map((i, k) => <li key={k} className={i.severity}>m{i.m + 1} b{i.beat + 1}: {i.text}</li>)}</ul>
    </div>
  )
}
