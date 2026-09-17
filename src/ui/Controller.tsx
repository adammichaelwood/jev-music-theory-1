import { type Option, type Step, STEPS } from '../controller/options.ts'
import type { StepRecord } from '../jev/turn.ts'
import type { Acc, Letter } from '../score/model.ts'

interface Props {
  step: Step | null
  options: Option[]
  partialText: Record<string, string>
  last?: StepRecord
  history: StepRecord[]
  humanMode: boolean
  thinking: boolean
  onPick?: (o: Option) => void
}

const STEP_TITLE: Record<Step, string> = { voice: 'VOICE', measure: 'MEASURE', beat: 'BEAT', pitch: 'PITCH', octave: 'OCTAVE', duration: 'DURATION' }

export function Controller({ step, options, partialText, last, history, humanMode, thinking, onPick }: Props) {
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
              <div className="stepval">{partialText[s] ?? (h ? h.choice : '·')}</div>
            </div>
          )
        })}
      </div>
      <div className="ctlstatus">
        <span className="ctlstep">{shownStep ? STEP_TITLE[shownStep] : '—'}</span>
        {showLast && <span className="ctlanswer"> → <b>{last.choice}</b> <span className="dim">conf {last.confidence.toFixed(2)} · {last.ms} ms</span></span>}
        {thinking && !humanMode && <span className="thinking">{step ? `deciding ${STEP_TITLE[step].toLowerCase()}` : 'applying'}<span className="dots" /></span>}
        {humanMode && <span className="dim"> · your move</span>}
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
    <button className={`opt ${chosen ? 'chosen' : ''} ${className}`} title={o.description ?? undefined} disabled={!humanMode} onClick={() => onPick?.(o)}
      style={p !== undefined ? { '--p': p } as React.CSSProperties : undefined}>
      <span className="bar" />
      <span className="optkey">{o.key}</span>
      {p !== undefined && <span className="pct">{(p * 100).toFixed(0)}%</span>}
    </button>
  )
}

const WHITE: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const BLACK: [Letter, Letter][] = [['C', 'D'], ['D', 'E'], ['F', 'G'], ['G', 'A'], ['A', 'B']]
const ODD: [Letter, Acc, Letter][] = [['B', 'sharp', 'C'], ['F', 'flat', 'E'], ['E', 'sharp', 'F'], ['C', 'flat', 'B']]
const glyph = (l: Letter, a: Acc) => l + (a === 'sharp' ? '♯' : a === 'flat' ? '♭' : '')

/** a piano octave: white keys, black keys split into sharp (left) and flat (right) spellings, odd spellings underneath */
function Piano({ options, last, humanMode, onPick }: { options: Option[]; last?: StepRecord; humanMode: boolean; onPick?: (o: Option) => void }) {
  const find = (letter: Letter, acc: Acc) => options.find(o => o.patch.pitch?.letter === letter && o.patch.pitch?.acc === acc)!
  const Key = ({ letter, acc, cls }: { letter: Letter; acc: Acc; cls: string }) => {
    const o = find(letter, acc), p = last?.probabilities[o.key], chosen = last?.choice === o.key
    return (
      <button className={`key ${cls} ${chosen ? 'chosen' : ''}`} disabled={!humanMode} onClick={() => onPick?.(o)} title={o.key}
        style={p !== undefined ? { '--p': p } as React.CSSProperties : undefined}>
        <span className="fill" />
        <span className="name">{glyph(letter, acc)}</span>
        {p !== undefined && <span className="pct">{(p * 100).toFixed(0)}</span>}
      </button>
    )
  }
  return (
    <div className="pianowrap">
      <div className="piano">
        {WHITE.map(l => <Key key={l} letter={l} acc="natural" cls="white" />)}
        {BLACK.map(([lo, hi], i) => (
          <div key={lo} className="blackpair" style={{ left: `calc(${(WHITE.indexOf(lo) + 1) * (100 / 7)}% - 7.5%)`, animationDelay: `${i * 40}ms` }}>
            <Key letter={lo} acc="sharp" cls="black" />
            <Key letter={hi} acc="flat" cls="black" />
          </div>
        ))}
      </div>
      <div className="oddrow">
        {ODD.map(([l, a, under]) => (
          <div key={l + a} style={{ gridColumn: WHITE.indexOf(under) + 1 }}><Key letter={l} acc={a} cls="odd" /></div>
        ))}
      </div>
    </div>
  )
}
