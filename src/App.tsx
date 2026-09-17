import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audioContext, makePlayer, playMidi } from './audio.ts'
import { type Option, type Turn, describeTurn, optionsFor, turnToNote } from './controller/options.ts'
import { EXERCISES } from './exercises/index.ts'
import type { Exercise } from './exercises/load.ts'
import { makeClient } from './jev/client.ts'
import { type StepRecord, type TurnRecord, runLoop } from './jev/turn.ts'
import { type Highlight, ScoreView } from './render/ScoreView.tsx'
import { type FormatVariant, serializeScoreBlock } from './score/format.ts'
import { type Score, type VoiceName, cloneScore, midi, placeNote } from './score/model.ts'
import { Controller } from './ui/Controller.tsx'
import { TurnLog } from './ui/TurnLog.tsx'
import type abcjs from 'abcjs'

type RunState = 'idle' | 'running' | 'paused' | 'done'
const SPEEDS = [0, 250, 600, 1200, 2500] // ms between sub-steps; 0 = flat out

export default function App() {
  const [ex, setEx] = useState<Exercise>(EXERCISES[0])
  const [score, setScore] = useState<Score>(ex.score)
  const [variant, setVariant] = useState<FormatVariant>({ accidentals: 'words', align: false })
  const [humanMode, setHumanMode] = useState(false)
  const [run, setRun] = useState<RunState>('idle')
  const [speedIdx, setSpeedIdx] = useState(2)
  const [maxTurns, setMaxTurns] = useState(60)
  const [turns, setTurns] = useState<TurnRecord[]>([])
  const [partial, setPartial] = useState<Turn>({})
  const [stepHistory, setStepHistory] = useState<StepRecord[]>([])
  const [lastStep, setLastStep] = useState<StepRecord | undefined>()
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [error, setError] = useState<string>()
  const [showState, setShowState] = useState(false)

  const speedRef = useRef(speedIdx); speedRef.current = speedIdx
  const runRef = useRef(run); runRef.current = run
  const abortRef = useRef<AbortController>(null)
  const playerRef = useRef<ReturnType<typeof makePlayer>>(null)
  const playerEl = useRef<HTMLDivElement>(null)

  const client = useMemo(() => makeClient(), [])
  const opts = useMemo(() => optionsFor(score, partial, variant), [score, partial, variant])

  const loadExercise = (e: Exercise) => {
    abortRef.current?.abort()
    setEx(e); setScore(e.score); setTurns([]); setPartial({}); setStepHistory([]); setLastStep(undefined); setHighlights([]); setRun('idle'); setError(undefined)
  }

  const onTune = useCallback((tune: abcjs.TuneObject) => {
    if (!playerRef.current && playerEl.current) playerRef.current = makePlayer(playerEl.current)
    void playerRef.current?.setTune(tune)
  }, [])

  // ---- Jev run ----
  const start = async () => {
    audioContext()
    const ac = new AbortController(); abortRef.current = ac
    setRun('running'); setError(undefined); setTurns([])
    try {
      for await (const ev of runLoop(client, ex, score, { variant, maxTurns, signal: ac.signal })) {
        if (ac.signal.aborted) break
        if (ev.type === 'step') {
          setLastStep(ev.rec); setStepHistory(h => [...h, ev.rec]); setPartial(ev.partial)
          if (ev.partial.voice && ev.partial.voice !== 'STOP' && ev.partial.measure !== undefined)
            setHighlights([{ v: ev.partial.voice, m: ev.partial.measure, onset: ev.partial.beat, cls: 'target' }])
          if (ev.rec.step === 'octave') void playMidi(midi({ ...ev.partial.pitch!, octave: ev.partial.octave! }))
        } else if (ev.type === 'move') {
          setScore(ev.score); setTurns(t => [...t, ev.rec]); setPartial({}); setStepHistory([]); setLastStep(undefined)
          setHighlights([{ v: ev.rec.turn.voice as VoiceName, m: ev.rec.turn.measure!, onset: ev.rec.note!.onset, cls: 'just-placed' }])
        } else if (ev.type === 'stop') {
          setTurns(t => [...t, ev.rec]); setPartial({}); setStepHistory([]); setRun('done'); return
        } else { setError('hit max turns without STOP'); setRun('done'); return }
        // pacing + pause
        const wait = SPEEDS[speedRef.current]
        if (wait) await sleep(wait, ac.signal)
        while (runRef.current === 'paused' && !ac.signal.aborted) await sleep(100)
      }
    } catch (e) {
      if (!ac.signal.aborted) { setError(String(e)); setRun('done') }
    }
    if (ac.signal.aborted) setRun('idle')
  }
  const stop = () => { abortRef.current?.abort(); setRun('idle'); setPartial({}); setStepHistory([]); setLastStep(undefined) }

  // ---- human mode ----
  const humanPick = (o: Option) => {
    if (!opts) return
    const next: Turn = { ...partial, [opts.step]: o.value }
    if (opts.step === 'octave') void playMidi(midi({ ...next.pitch!, octave: next.octave! }))
    if (next.voice === 'STOP') { setPartial({}); return }
    if (optionsFor(score, next, variant) === null) {
      const s = cloneScore(score)
      placeNote(s, next.voice as VoiceName, next.measure!, turnToNote(next))
      setScore(s); setPartial({})
      setHighlights([{ v: next.voice as VoiceName, m: next.measure!, onset: next.beat!, cls: 'just-placed' }])
    } else setPartial(next)
  }

  useEffect(() => { document.title = `Jev · ${ex.title}` }, [ex])

  return (
    <div className="app">
      <header>
        <h1>Jev Chorale Lab</h1>
        <select value={ex.id} onChange={e => loadExercise(EXERCISES.find(x => x.id === e.target.value)!)}>
          {EXERCISES.map(e => <option key={e.id} value={e.id}>{e.id} · {e.title} (level {e.difficulty})</option>)}
        </select>
        <button onClick={() => loadExercise(EXERCISES[Math.floor(Math.random() * EXERCISES.length)])}>random</button>
        <button onClick={() => loadExercise(ex)}>reset</button>
        <span className="sep" />
        <label><input type="checkbox" checked={humanMode} disabled={run === 'running' || run === 'paused'} onChange={e => setHumanMode(e.target.checked)} /> human mode</label>
        <span className="sep" />
        {run === 'idle' || run === 'done' ? <button className="primary" disabled={humanMode} onClick={start}>▶ start Jev</button> : null}
        {run === 'running' && <button onClick={() => setRun('paused')}>⏸ pause</button>}
        {run === 'paused' && <button onClick={() => setRun('running')}>▶ resume</button>}
        {(run === 'running' || run === 'paused') && <button onClick={stop}>■ stop</button>}
        <label>speed <input type="range" min={0} max={SPEEDS.length - 1} value={SPEEDS.length - 1 - speedIdx} onChange={e => setSpeedIdx(SPEEDS.length - 1 - +e.target.value)} /> {SPEEDS[speedIdx] ? `${SPEEDS[speedIdx]}ms` : 'max'}</label>
        <label>max turns <input type="number" value={maxTurns} min={1} onChange={e => setMaxTurns(+e.target.value)} style={{ width: 50 }} /></label>
        <span className="sep" />
        <label><input type="checkbox" checked={variant.accidentals === 'unicode'} onChange={e => setVariant(v => ({ ...v, accidentals: e.target.checked ? 'unicode' : 'words' }))} /> ♯♭</label>
        <label><input type="checkbox" checked={variant.align} onChange={e => setVariant(v => ({ ...v, align: e.target.checked }))} /> align columns</label>
        <span className={`status ${run}`}>{run}{error ? ` — ${error}` : ''}</span>
      </header>

      <main>
        <section className="left">
          <div className="instructions"><b>{ex.title}</b> · {ex.keyText} · {ex.timeText}<p>{ex.instructions}</p></div>
          <ScoreView score={score} highlights={highlights} onTune={onTune} />
          <div ref={playerEl} className="player" />
          <details open={showState} onToggle={e => setShowState((e.target as HTMLDetailsElement).open)}>
            <summary>score text (what Jev reads)</summary>
            <pre>{serializeScoreBlock(score, variant)}</pre>
          </details>
          {lastStep && (
            <details>
              <summary>last request: {lastStep.step} · {lastStep.ms}ms · {lastStep.inputTokens} tokens · {lastStep.model}</summary>
              <pre>{lastStep.instructions}</pre>
              <pre>{JSON.stringify(lastStep.state, null, 1)}</pre>
            </details>
          )}
        </section>
        <section className="right">
          <Controller step={opts?.step ?? null} options={opts?.options ?? []} partialText={describeTurn(partial, variant)}
            last={lastStep} history={stepHistory} humanMode={humanMode} thinking={run === 'running'} onPick={humanPick} />
          <h3>turns ({turns.length})</h3>
          <TurnLog turns={turns} />
        </section>
      </main>
    </div>
  )
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>(r => {
  const t = setTimeout(r, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true })
})
