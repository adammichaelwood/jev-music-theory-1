import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audioContext, makePlayer, playMidi } from './audio.ts'
import { type Option, type Turn, describeTurn, optionsFor, turnToNote } from '@core/controller/options.ts'
import { EXERCISES } from './exercises/index.ts'
import type { Exercise } from '@core/exercises/load.ts'
import { grade } from '@core/grader/index.ts'
import { describeError, makeClient, setUserApiKey, userApiKey } from '@core/jev/client.ts'
import { jevDecider } from '@core/decide/jev.ts'
import { BASELINE, type Condition, PRESETS } from '@core/loop/conditions.ts'
import { type StepRecord, type TurnRecord, runLoop } from '@core/loop/turn.ts'
import { type Highlight, ScoreView } from './render/ScoreView.tsx'
import { serializeScoreBlock } from '@core/formats/csv.ts'
import { type Score, type VoiceName, cloneScore, midi, noteAt, placeNote } from '@core/score/model.ts'
import { Controller } from './ui/Controller.tsx'
import { GradePanel } from './ui/GradePanel.tsx'
import { Markdown } from './ui/Markdown.tsx'
import { TurnLog } from './ui/TurnLog.tsx'
import { PianoTab } from './piano/PianoTab.tsx'
import findingsMd from '../_plan/findings.md?raw'
import findings2Md from '../_plan/findings-2.md?raw'
import findingsPianoMd from '../_plan/findings-piano.md?raw'
import quizMd from '../_plan/quiz-results.md?raw'
import type abcjs from 'abcjs'

type RunState = 'idle' | 'running' | 'paused' | 'done'
const SPEEDS = [0, 250, 600, 1200, 2500] // ms between sub-steps; 0 = flat out

export default function App() {
  const [ex, setEx] = useState<Exercise>(EXERCISES[0])
  const [score, setScore] = useState<Score>(ex.score)
  const [cond, setCond] = useState<Condition>(BASELINE)
  const [humanMode, setHumanMode] = useState(false)
  const [run, setRun] = useState<RunState>('idle')
  const [speedIdx, setSpeedIdx] = useState(2)
  const [maxTurns, setMaxTurns] = useState(60)
  const [turns, setTurns] = useState<TurnRecord[]>([])
  const [partial, setPartial] = useState<Turn>({})
  const [stepHistory, setStepHistory] = useState<StepRecord[]>([])
  const [lastStep, setLastStep] = useState<StepRecord | undefined>()
  const [live, setLive] = useState<Highlight[]>([])
  const [error, setError] = useState<string>()
  const [tab, setTab] = useState<'lab' | 'piano' | 'findings'>('lab')
  const [advanced, setAdvanced] = useState(false)
  const [doc, setDoc] = useState<'round2' | 'round1' | 'quiz' | 'piano'>('round1')
  const [stats, setStats] = useState({ requests: 0, tokens: 0, ms: 0, cost: 0 })
  const [apiKey, setApiKey] = useState<string | null>(userApiKey())
  const [keyOpen, setKeyOpen] = useState(false)

  const speedRef = useRef(speedIdx); speedRef.current = speedIdx
  const runRef = useRef(run); runRef.current = run
  const abortRef = useRef<AbortController>(null)
  const playerRef = useRef<ReturnType<typeof makePlayer>>(null)
  const playerEl = useRef<HTMLDivElement>(null)

  const client = useMemo(() => makeClient(), [apiKey])
  const opts = useMemo(() => optionsFor(score, partial, cond), [score, partial, cond])
  const report = useMemo(() => grade(score), [score])
  // violations colored on the score whenever Jev isn't mid-turn
  const highlights = useMemo<Highlight[]>(() => {
    if (run === 'running' || run === 'paused') return live
    const hs: Highlight[] = []
    for (const i of report.issues) if (i.severity === 'error' && i.voices) for (const v of i.voices) {
      const n = noteAt(score, v, i.m, i.beat); if (n) hs.push({ v, m: i.m, onset: n.onset, cls: 'violation' })
    }
    return hs
  }, [run, live, report, score])

  const loadExercise = (e: Exercise) => {
    abortRef.current?.abort()
    setEx(e); setScore(e.score); setTurns([]); setPartial({}); setStepHistory([]); setLastStep(undefined); setLive([]); setRun('idle'); setError(undefined)
    setStats({ requests: 0, tokens: 0, ms: 0, cost: 0 })
  }

  const onTune = useCallback((tune: abcjs.TuneObject) => {
    if (!playerRef.current && playerEl.current) playerRef.current = makePlayer(playerEl.current)
    void playerRef.current?.setTune(tune)
  }, [])

  // ---- Jev run ----
  const start = async () => {
    audioContext()
    const ac = new AbortController(); abortRef.current = ac
    setRun('running'); setError(undefined); setTurns([]); setStats({ requests: 0, tokens: 0, ms: 0, cost: 0 })
    try {
      for await (const ev of runLoop(jevDecider(client), ex, score, { client, condition: cond, maxTurns, signal: ac.signal })) {
        if (ac.signal.aborted) break
        if (ev.type === 'step') {
          setLastStep(ev.rec); setStepHistory(h => [...h, ev.rec]); setPartial(ev.partial)
          setStats(s => ({ requests: s.requests + 1, tokens: s.tokens + ev.rec.inputTokens, ms: s.ms + ev.rec.ms, cost: s.cost + ev.rec.costUsd }))
          if (ev.partial.voice && ev.partial.voice !== 'STOP' && ev.partial.measure !== undefined)
            setLive([{ v: ev.partial.voice, m: ev.partial.measure, onset: ev.partial.beat, cls: 'target' }])
          if (ev.partial.octave !== undefined && ev.partial.pitch && (ev.rec.step === 'octave' || ev.rec.step === 'pitch')) void playMidi(midi({ ...ev.partial.pitch, octave: ev.partial.octave }))
        } else if (ev.type === 'move') {
          setScore(ev.score); setTurns(t => [...t, ev.rec]); setPartial({}); setStepHistory([]); setLastStep(undefined)
          setLive([{ v: ev.rec.turn.voice as VoiceName, m: ev.rec.turn.measure!, onset: ev.rec.note!.onset, cls: 'just-placed' }])
        } else if (ev.type === 'invalid') {
          setTurns(t => [...t, ev.rec]); setPartial({}); setStepHistory([]); setLastStep(undefined)
        } else if (ev.type === 'stalled') {
          setError('stalled — the same score state came up three times'); setRun('done'); return
        } else if (ev.type === 'stop') {
          setTurns(t => [...t, ev.rec]); setPartial({}); setStepHistory([]); setRun('done'); return
        } else { setError('hit max turns without STOP'); setRun('done'); return }
        const wait = SPEEDS[speedRef.current]
        if (wait) await sleep(wait, ac.signal)
        while (runRef.current === 'paused' && !ac.signal.aborted) await sleep(100)
      }
    } catch (e) {
      if (!ac.signal.aborted) { setError(describeError(e)); setRun('done') }
    }
    if (ac.signal.aborted) setRun('idle')
  }
  const stop = () => { abortRef.current?.abort(); setRun('idle'); setPartial({}); setStepHistory([]); setLastStep(undefined) }

  // ---- human mode ----
  const humanPick = (o: Option) => {
    if (!opts) return
    const next: Turn = { ...partial, ...o.patch }
    if (next.pitch && next.octave !== undefined && (opts.step === 'octave' || opts.step === 'pitch')) void playMidi(midi({ ...next.pitch, octave: next.octave }))
    if (next.voice === 'STOP') { setPartial({}); return }
    if (optionsFor(score, next, cond) === null) {
      const s = cloneScore(score)
      placeNote(s, next.voice as VoiceName, next.measure!, turnToNote(next))
      setScore(s); setPartial({})
    } else setPartial(next)
  }

  useEffect(() => { document.title = `Jev · ${ex.title}` }, [ex])
  const busy = run === 'running' || run === 'paused'
  const setC = (patch: Partial<Condition>) => setCond(c => ({ ...c, ...patch, name: 'custom' }))

  return (
    <div className="app">
      <header>
        <h1>Jev Chorale Lab</h1>
        <nav><button className={tab === 'lab' ? 'on' : ''} onClick={() => setTab('lab')}>lab</button><button className={tab === 'findings' ? 'on' : ''} onClick={() => setTab('findings')}>findings</button><span className="navsep" /><button className={tab === 'piano' ? 'on' : ''} onClick={() => setTab('piano')}>piano</button></nav>
        {tab === 'piano' && <span className="tagline">Jev improvises: root → quality → bass, three decisions per chord, voiced and played by code</span>}
        <a className="repolink" href="https://github.com/adammichaelwood/jev-music-theory-1" target="_blank" rel="noreferrer" title="source, plan, write-ups — entirely vibecoded">github ↗</a>
        {tab === 'lab' && <>
          <select value={ex.id} onChange={e => loadExercise(EXERCISES.find(x => x.id === e.target.value)!)}>
            {EXERCISES.map(e => <option key={e.id} value={e.id}>{e.id.slice(0, 3)} · {e.title} (level {e.difficulty})</option>)}
          </select>
          <button onClick={() => loadExercise(EXERCISES[Math.floor(Math.random() * EXERCISES.length)])}>random</button>
          <button onClick={() => loadExercise(ex)}>reset</button>
          <span className="sep" />
          {!busy ? <button className="primary" disabled={humanMode} onClick={start}>▶ start Jev</button> : null}
          {run === 'running' && <button onClick={() => setRun('paused')}>⏸ pause</button>}
          {run === 'paused' && <button onClick={() => setRun('running')}>▶ resume</button>}
          {busy && <button onClick={stop}>■ stop</button>}
          <label title="delay between Jev's sub-decisions">speed <input type="range" min={0} max={SPEEDS.length - 1} value={SPEEDS.length - 1 - speedIdx} onChange={e => setSpeedIdx(SPEEDS.length - 1 - +e.target.value)} /> {SPEEDS[speedIdx] ? `${SPEEDS[speedIdx]}ms` : 'max'}</label>
          <label><input type="checkbox" checked={humanMode} disabled={busy} onChange={e => setHumanMode(e.target.checked)} /> human mode</label>
          <span className="sep" />
          <label>condition <select value={cond.name} onChange={e => setCond(PRESETS.find(p => p.name === e.target.value)!)}>
            {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            {!PRESETS.some(p => p.name === cond.name) && <option value={cond.name}>{cond.name}</option>}
          </select></label>
          <button className="link" onClick={() => setAdvanced(a => !a)}>{advanced ? 'hide' : 'show'} experiment settings</button>
          <button className="link" onClick={() => setKeyOpen(k => !k)} title="Optional. Without a key the demo uses a shared key with a daily limit.">{apiKey ? 'using your API key' : 'API key'}</button>
          <span className={`status ${run}`}>
            {run}{error ? ` — ${error}` : ''}{stats.requests ? ` · ${stats.requests} requests · ${stats.tokens.toLocaleString()} tokens · $${stats.cost.toFixed(4)} · ${(stats.ms / 1000).toFixed(1)}s model time` : ''}
          </span>
        </>}
      </header>
      {tab === 'lab' && keyOpen && (
        <div className="advanced keybar">
          <span>Optional: your own <b>TypeSafe API key</b>. Without one the demo uses a shared key with a daily limit. The key is kept in this browser's localStorage and sent only through the app's proxy to api.typesafe.ai.</span>
          <input type="password" placeholder="ts-…" defaultValue={apiKey ?? ''} onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); setUserApiKey(v || null); setApiKey(v || null); setKeyOpen(false) } }} />
          <button onClick={e => { const v = ((e.currentTarget.previousSibling as HTMLInputElement).value).trim(); setUserApiKey(v || null); setApiKey(v || null); setKeyOpen(false) }}>save</button>
          {apiKey && <button onClick={() => { setUserApiKey(null); setApiKey(null); setKeyOpen(false) }}>forget</button>}
        </div>
      )}
      {tab === 'lab' && advanced && (
        <div className="advanced">
          <label>score format <select value={cond.format} onChange={e => setC({ format: e.target.value as Condition['format'] })}>{['csv', 'abc', 'lilypond'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label><input type="checkbox" checked={cond.accidentals === 'unicode'} onChange={e => setC({ accidentals: e.target.checked ? 'unicode' : 'words' })} /> ♯♭ unicode accidentals</label>
          <label><input type="checkbox" checked={cond.align} onChange={e => setC({ align: e.target.checked })} /> align columns</label>
          <label><input type="checkbox" checked={cond.emptyCell === 'underscores'} onChange={e => setC({ emptyCell: e.target.checked ? 'underscores' : 'blank' })} /> empty bars as _ _ _</label>
          <label>format guide <select value={cond.formatGuide} onChange={e => setC({ formatGuide: e.target.value as Condition['formatGuide'] })}>{['none', 'brief', 'full'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>theory text <select value={cond.theory} onChange={e => setC({ theory: e.target.value as Condition['theory'] })}>{['none', 'exercise', 'primer', 'detailed'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>question wording <select value={cond.stepWording} onChange={e => setC({ stepWording: e.target.value as Condition['stepWording'] })}>{['plain', 'contextual'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>strategy <select value={cond.strategy} onChange={e => setC({ strategy: e.target.value as Condition['strategy'] })}>{['free', 'forward', 'backward', 'line'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label><input type="checkbox" checked={cond.feedback} onChange={e => setC({ feedback: e.target.checked })} /> grader feedback in state</label>
          <label><input type="checkbox" checked={cond.pitchOctave === 'merged'} onChange={e => setC({ pitchOctave: e.target.checked ? 'merged' : 'split' })} /> pitch+octave as one choice</label>
          <label><input type="checkbox" checked={cond.context === 'window'} onChange={e => setC({ context: e.target.checked ? 'window' : 'full' })} /> windowed score (measure ±1)</label>
          <label><input type="checkbox" checked={cond.requests === 'fanout'} onChange={e => setC({ requests: e.target.checked ? 'fanout' : 'sequential' })} /> fan-out (one request per turn)</label>
          <label>recent moves in state <input type="number" min={0} max={20} value={cond.history} style={{ width: 44 }} onChange={e => setC({ history: +e.target.value })} /></label>
          <label>max turns <input type="number" value={maxTurns} min={1} onChange={e => setMaxTurns(+e.target.value)} style={{ width: 50 }} /></label>
        </div>
      )}

      {tab === 'piano' ? <PianoTab apiKeyVersion={apiKey ? 1 : 0} /> : tab === 'findings' ? (
        <main className="findings">
          <div className="docnav">
            <button className={doc === 'round1' ? 'on' : ''} onClick={() => setDoc('round1')}>Round 1 — the controller lab</button>
            <button className={doc === 'round2' ? 'on' : ''} onClick={() => setDoc('round2')}>Round 2 — formats, theory quiz, Claude vs Jev, framings</button>
            <button className={doc === 'quiz' ? 'on' : ''} onClick={() => setDoc('quiz')}>Quiz results (tables)</button>
            <button className={doc === 'piano' ? 'on' : ''} onClick={() => setDoc('piano')}>Piano notes</button>
          </div>
          <Markdown text={doc === 'round2' ? findings2Md : doc === 'round1' ? findingsMd : doc === 'quiz' ? quizMd : findingsPianoMd} />
        </main>
      ) : (
        <main>
          <section className="left">
            <details className="about">
              <summary>What is this?</summary>
              <p><b>The question:</b> how much music theory does <b>Jev</b> actually know? Jev is TypeSafe's System One model — it answers typed multiple-choice questions with calibrated probabilities and never generates text. Music theory is a good probe because the rules are explicit and a grader can check the work: if Jev has absorbed common-practice harmony from its training, it should be able to do an undergraduate part-writing exercise one decision at a time.</p>
              <p>So it gets a <b>controller</b>, not a hint: each turn it picks a voice, a measure, a beat, a pitch, an octave and a duration, seeing the whole score as plain text. Code never filters its options for musical reasons; a rule-based grader scores the result afterwards, and a harness varies the score format and the order of work to see what draws the knowledge out.</p>
              <p>Blue notes are Jev's; orange is the note it just wrote; red notes are involved in a grader error. The controller on the right shows every option with Jev's probability for it. Turn on <b>human mode</b> to enter notes yourself, then hand the score to Jev. The <b>findings</b> tab has the results.</p>
            </details>
            <div className="instructions"><b>{ex.title}</b> · {ex.keyText} · {ex.timeText}<p>{ex.instructions}</p></div>
            <ScoreView score={score} highlights={highlights} onTune={onTune} />
            <div ref={playerEl} className="player" />
            <details>
              <summary>score text (what Jev reads)</summary>
              <pre>{serializeScoreBlock(score, cond)}</pre>
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
            <Controller step={opts?.step ?? null} options={opts?.options ?? []} partialText={describeTurn(partial, cond)}
              last={lastStep} history={stepHistory} humanMode={humanMode} thinking={run === 'running'} onPick={humanPick} />
            <h3>grade</h3>
            <GradePanel report={report} />
            <h3>turns ({turns.length})</h3>
            <TurnLog turns={turns} />
          </section>
        </main>
      )}
    </div>
  )
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>(r => {
  const t = setTimeout(r, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true })
})
