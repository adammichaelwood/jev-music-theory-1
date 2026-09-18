import { useEffect, useMemo, useRef, useState } from 'react'
import abcjs from 'abcjs'
import { audioContext } from '../audio.ts'
import { jevDecider } from '@core/decide/jev.ts'
import { describeError, makeClient } from '@core/jev/client.ts'
import { QUALITY_KEYS, ROOTS, rootKey, rootSymbol, type Chord } from '@core/piano/chords.ts'
import { DEFAULT_VIBE, type ChordRecord, type PianoStepRecord, pianoLoop, streamStats } from '@core/piano/loop.ts'

const LO = 36, HI = 84 // C2..C6 on the drawn keyboard
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12)

function playChord(v: { bass: number; upper: number[] }, ms: number) {
  audioContext()
  const pitches = [v.bass, ...v.upper].map((p, i) => ({ pitch: p, instrument: 0, duration: ms / 2000, volume: i === 0 ? 75 : 62, start: 0, gap: 0 }))
  return abcjs.synth.playEvent(pitches, undefined, 2000).catch(() => {})
}

export function PianoTab({ apiKeyVersion }: { apiKeyVersion: number }) {
  const [vibe, setVibe] = useState(DEFAULT_VIBE)
  const [hold, setHold] = useState(4)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [chords, setChords] = useState<ChordRecord[]>([])
  const [partial, setPartial] = useState<Partial<Chord>>({})
  const [stepRecs, setStepRecs] = useState<Partial<Record<'root' | 'quality' | 'bass', PianoStepRecord>>>({})
  const [deciding, setDeciding] = useState<'root' | 'quality' | 'bass' | null>(null)
  const abortRef = useRef<AbortController>(null)
  const holdRef = useRef(hold); holdRef.current = hold
  const client = useMemo(() => makeClient(), [apiKeyVersion])

  const start = async () => {
    audioContext()
    const ac = new AbortController(); abortRef.current = ac
    setRunning(true); setError(undefined); setChords([]); setPartial({}); setStepRecs({}); setDeciding('root')
    let lastPlay = 0
    try {
      const gen = pianoLoop(jevDecider(client), { vibe, signal: ac.signal })
      for (;;) {
        const { value: ev, done } = await gen.next()
        if (done || ac.signal.aborted) break
        if (ev.type === 'step') { setStepRecs(r => ({ ...(ev.rec.step === 'root' ? {} : r), [ev.rec.step]: ev.rec })); setPartial(ev.partial); setDeciding(ev.rec.step === 'root' ? 'quality' : ev.rec.step === 'quality' ? 'bass' : null) }
        else {
          const wait = Math.max(0, lastPlay + holdRef.current * 1000 - Date.now())
          if (wait) await sleep(wait, ac.signal)
          if (ac.signal.aborted) break
          lastPlay = Date.now()
          void playChord(ev.rec.voicing, holdRef.current * 1000 + 800)
          setChords(c => [...c, ev.rec]); setPartial({}); setDeciding('root')
          await sleep(Math.max(300, holdRef.current * 400), ac.signal) // let the chord breathe before deciding the next one
        }
      }
    } catch (e) { if (!ac.signal.aborted) setError(describeError(e)) }
    setRunning(false); setDeciding(null)
  }
  const stop = () => { abortRef.current?.abort(); setRunning(false); setDeciding(null) }
  useEffect(() => () => abortRef.current?.abort(), [])

  const current = chords[chords.length - 1]
  const stats = useMemo(() => streamStats(chords), [chords])
  const probs = (step: 'root' | 'quality' | 'bass') => stepRecs[step]?.decision.probabilities
  const chosen = (step: 'root' | 'quality' | 'bass') => stepRecs[step]?.decision.choice
  const lit = new Map<number, 'bass' | 'upper'>(); if (current) { lit.set(current.voicing.bass, 'bass'); current.voicing.upper.forEach(u => lit.set(u, 'upper')) }
  const whites = Array.from({ length: HI - LO + 1 }, (_, i) => LO + i).filter(m => !isBlack(m))
  const wW = 100 / whites.length

  return (
    <main className="pianotab">
      <div className="pianotop">
        <textarea value={vibe} onChange={e => setVibe(e.target.value)} rows={2} disabled={running} />
        <div className="pianoctl">
          {!running ? <button className="primary" onClick={start}>▶ play</button> : <button onClick={stop}>■ stop</button>}
          <label>hold <input type="range" min={2} max={10} step={0.5} value={hold} onChange={e => setHold(+e.target.value)} /> {hold}s</label>
          <span className="status">{running ? 'playing' : chords.length ? 'stopped' : 'idle'}{error ? ` — ${error}` : ''}{chords.length ? ` · ${chords.length} chords · $${stats.costUsd.toFixed(4)} · ${Math.round(stats.msPerChord)} ms/chord` : ''}</span>
        </div>
      </div>

      <div className="nowplaying">
        <div className="bigchord">{current ? current.symbol : '—'}</div>
        <div className="chordmeta">{current ? <>{current.transition ?? 'opening'} · key feels like <b>{current.keyEstimate}</b></> : 'press play'}</div>
        <div className="deciding">{deciding ? <>deciding <b>{deciding}</b><span className="dots" /></> : running ? 'holding…' : ''}{partial.root ? ` · ${rootSymbol(partial.root)}${partial.quality ?? ''}` : ''}</div>
      </div>

      <svg className="keyboard" viewBox="0 0 100 14" preserveAspectRatio="none">
        {whites.map((m, i) => <rect key={m} x={i * wW} y={0} width={wW - 0.15} height={14} rx={0.3} className={`wkey ${lit.get(m) ?? ''}`} />)}
        {Array.from({ length: HI - LO + 1 }, (_, i) => LO + i).filter(isBlack).map(m => {
          const idx = whites.filter(w => w < m).length
          return <rect key={m} x={idx * wW - wW * 0.3} y={0} width={wW * 0.6} height={8.5} rx={0.25} className={`bkey ${lit.get(m) ?? ''}`} />
        })}
      </svg>

      <div className="steps3">
        <StepRow title="ROOT" keys={ROOTS.map(rootKey)} labels={ROOTS.map(rootSymbol)} probs={probs('root')} chosen={chosen('root')} active={deciding === 'root'} />
        <StepRow title="QUALITY" keys={QUALITY_KEYS} probs={probs('quality')} chosen={chosen('quality')} active={deciding === 'quality'} />
        <StepRow title="BASS" keys={stepRecs.bass ? Object.keys(stepRecs.bass.options) : []} probs={probs('bass')} chosen={chosen('bass')} active={deciding === 'bass'} />
      </div>

      <div className="history">
        {chords.slice(-32).map(c => <span key={c.n} className={`hchip ${c.transition === 'repeat' ? 'rep' : ''}`} title={c.transition ?? ''}><b>{c.symbol}</b><i>{c.transition ?? ''}</i></span>)}
      </div>
      {chords.length > 1 && (
        <div className="pianostats">
          distinct {stats.distinct}/{stats.chords} · repeats {stats.repeats} · functional (ii–V, V–I, tritone sub) {stats.functional} · other fifths {stats.fifthDown - stats.functional} · chromatic {stats.chromatic} · third-relations {stats.thirdRelation} · inversions {stats.inversions} · key changes {stats.keyChanges} · qualities {Object.entries(stats.qualities).sort((a, b) => b[1] - a[1]).map(([q, n]) => `${q}×${n}`).join(' ')}
        </div>
      )}
    </main>
  )
}

function StepRow({ title, keys, labels, probs, chosen, active }: { title: string; keys: string[]; labels?: string[]; probs?: Record<string, number>; chosen?: string; active: boolean }) {
  return (
    <div className={`steprow ${active ? 'active' : ''}`}>
      <div className="steptitle">{title}{active && <span className="dots" />}</div>
      <div className="options">
        {keys.map((k, i) => <button key={k} className={`opt ${chosen === k ? 'chosen' : ''}`} disabled style={probs ? { '--p': probs[k] ?? 0 } as React.CSSProperties : undefined}>
          <span className="bar" /><span className="optkey">{labels?.[i] ?? k}</span>{probs && <span className="pct">{((probs[k] ?? 0) * 100).toFixed(0)}%</span>}
        </button>)}
      </div>
    </div>
  )
}
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>(r => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true }) })
