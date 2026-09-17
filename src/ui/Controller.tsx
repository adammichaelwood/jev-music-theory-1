import { type Option, type Step, STEPS } from '../controller/options.ts'
import type { StepRecord } from '../jev/turn.ts'
import type { Acc, Letter } from '../score/model.ts'

interface Props {
  step: Step | null // step to be decided next
  options: Option[]
  partialText: Record<string, string>
  last?: StepRecord // most recent answer this turn (shown with probability bars while Jev "thinks" about the next step)
  history: StepRecord[]
  humanMode: boolean
  thinking: boolean
  onPick?: (o: Option) => void
}

const STEP_TITLE: Record<Step, string> = { voice: 'WHICH VOICE', measure: 'WHICH MEASURE', beat: 'WHICH BEAT', pitch: 'WHAT PITCH', octave: 'WHICH OCTAVE', duration: 'WHAT DURATION' }

export function Controller({ step, options, partialText, last, history, humanMode, thinking, onPick }: Props) {
  // In Jev mode show the answered step (with its distribution); in human mode show the live step.
  const showLast = !humanMode && last
  const shownStep = showLast ? last.step : step
  const shownOptions = showLast ? last.options : options
  return (
    <div className="controller">
      <div className="steps">
        {STEPS.map(s => {
          const h = history.find(r => r.step === s)
          return (
            <div key={s} className={`stepchip ${s === step ? 'active' : ''} ${h ? 'done' : ''}`}>
              <div className="steptitle">{STEP_TITLE[s]}</div>
              <div className="stepval">{partialText[s] ?? (h ? h.choice : '—')}</div>
            </div>
          )
        })}
      </div>
      <div className="ctlstatus">
        {shownStep ? <b>{STEP_TITLE[shownStep]}</b> : <b>—</b>}
        {showLast && <span> → {last.choice} · confidence {last.confidence.toFixed(2)} · {last.ms}ms</span>}
        {thinking && !humanMode && <span className="thinking"> · deciding {step ? STEP_TITLE[step].toLowerCase() : ''}…</span>}
      </div>
      {shownStep === 'pitch' && shownOptions.length === 21
        ? <Piano options={shownOptions} last={showLast ? last : undefined} humanMode={humanMode} onPick={onPick} />
        : shownStep && (
          <div className="options">
            {shownOptions.map(o => <OptButton key={o.key} o={o} last={showLast ? last : undefined} humanMode={humanMode} onPick={onPick} />)}
          </div>
        )}
    </div>
  )
}

function OptButton({ o, last, humanMode, onPick, className = '' }: { o: Option; last?: StepRecord; humanMode: boolean; onPick?: (o: Option) => void; className?: string }) {
  const p = last?.probabilities[o.key]
  const chosen = last?.choice === o.key
  return (
    <button className={`opt ${chosen ? 'chosen' : ''} ${className}`} title={o.description ?? undefined} disabled={!humanMode} onClick={() => onPick?.(o)}>
      <span className="optkey">{o.key}</span>
      {p !== undefined && <span className="bar" style={{ width: `${Math.round(p * 100)}%` }} />}
      {p !== undefined && <span className="pct">{(p * 100).toFixed(0)}%</span>}
    </button>
  )
}

// piano: black keys (sharp over flat) above, white keys, then the odd spellings (B#, Cb, E#, Fb) under the key they sound as
const WHITE: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const BLACK: [Letter, Letter][] = [['C', 'D'], ['D', 'E'], ['F', 'G'], ['G', 'A'], ['A', 'B']]
const ODD: Record<string, Letter> = { 'B:sharp': 'C', 'C:flat': 'B', 'E:sharp': 'F', 'F:flat': 'E' }
function Piano({ options, last, humanMode, onPick }: { options: Option[]; last?: StepRecord; humanMode: boolean; onPick?: (o: Option) => void }) {
  const find = (letter: Letter, acc: Acc) => options.find(o => o.patch.pitch?.letter === letter && o.patch.pitch?.acc === acc)!
  const col = (l: Letter) => WHITE.indexOf(l) * 2 + 1
  return (
    <div className="piano">
      {BLACK.map(([lo, hi]) => (
        <div key={lo} className="blackpair" style={{ gridColumn: `${col(lo) + 1} / span 2`, gridRow: 1 }}>
          <OptButton o={find(lo, 'sharp')} last={last} humanMode={humanMode} onPick={onPick} className="black" />
          <OptButton o={find(hi, 'flat')} last={last} humanMode={humanMode} onPick={onPick} className="black" />
        </div>
      ))}
      {WHITE.map(l => <div key={l} style={{ gridColumn: `${col(l)} / span 2`, gridRow: 2 }}><OptButton o={find(l, 'natural')} last={last} humanMode={humanMode} onPick={onPick} className="white" /></div>)}
      {Object.entries(ODD).map(([k, under]) => {
        const [letter, acc] = k.split(':') as [Letter, Acc]
        return <div key={k} style={{ gridColumn: `${col(under)} / span 2`, gridRow: 3 }}><OptButton o={find(letter, acc)} last={last} humanMode={humanMode} onPick={onPick} className="odd" /></div>
      })}
    </div>
  )
}
