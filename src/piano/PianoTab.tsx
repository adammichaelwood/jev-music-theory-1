import { useEffect, useMemo, useRef, useState } from 'react'
import abcjs from 'abcjs'
import { audioContext } from '../audio.ts'
import { jevDecider } from '@core/decide/jev.ts'
import { describeError, makeClient } from '@core/jev/client.ts'
import { QUALITIES, QUALITY_KEYS, ROOTS, rootKey, rootSymbol, type Chord, type Voicing } from '@core/piano/chords.ts'
import { DEFAULT_VIBE, type ChordRecord, type PianoStepRecord, pianoLoop, streamStats } from '@core/piano/loop.ts'

const LO = 36, HI = 84 // C2..C6 on the drawn keyboard
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12)

const INSTRUMENTS: [number, string][] = [[4, 'electric piano (Rhodes)'], [5, 'electric piano 2'], [0, 'acoustic grand'], [2, 'electric grand'], [11, 'vibraphone'], [89, 'warm pad']]

/** arpeggiate: bass, then the two left-hand tones, then the four right-hand tones, `gapMs` apart; every note sustains to the end.
 *  abcjs's playEvent starts every pitch at time 0, so build the sequence by hand with per-track start offsets. */
function playChord(v: Voicing, instrument: number, holdMs: number, gapMs: number) {
  audioContext()
  const order = [v.bass, ...v.lh, ...v.rh]
  const MS_PER_MEASURE = 2000
  const total = holdMs + gapMs * order.length + 800
  const seq = new abcjs.synth.SynthSequence() as abcjs.SynthSequenceClass & { starts: number[] }
  order.forEach((pitch, i) => {
    const track = seq.addTrack() as unknown as number // the runtime returns the track index
    seq.setInstrument(track, instrument)
    seq.starts[track] = (i * gapMs) / MS_PER_MEASURE // rest before this note
    seq.appendNote(track, pitch, (total - i * gapMs) / MS_PER_MEASURE, i === 0 ? 78 : i < 3 ? 60 : 66, 0)
  })
  const synth = new abcjs.synth.CreateSynth()
  ;(window as unknown as { __lastSynth?: unknown }).__lastSynth = synth // debug hook
  return synth.init({ sequence: seq as unknown as abcjs.AudioSequence, millisecondsPerMeasure: MS_PER_MEASURE }).then(() => synth.prime()).then(() => synth.start()).catch(() => {})
}

export function PianoTab({ apiKeyVersion }: { apiKeyVersion: number }) {
  const [vibe, setVibe] = useState(DEFAULT_VIBE)
  const [hold, setHold] = useState(4)
  const [noRepeat, setNoRepeat] = useState(true)
  const [temp, setTemp] = useState(0.4) // 0 = always Jev's top choice
  const [instrument, setInstrument] = useState(4)
  const [roots, setRoots] = useState<Set<string>>(() => new Set(ROOTS.map(rootKey)))
  const [qualities, setQualities] = useState<Set<string>>(() => new Set(QUALITY_KEYS))
  const rootsRef = useRef(roots); rootsRef.current = roots
  const qualsRef = useRef(qualities); qualsRef.current = qualities
  const instRef = useRef(instrument); instRef.current = instrument
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) => set(prev => { const n = new Set(prev); if (n.has(k)) { if (n.size > 1) n.delete(k) } else n.add(k); return n })
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
      const gen = pianoLoop(jevDecider(client), { vibe, signal: ac.signal, noRepeat, sample: temp > 0, temperature: temp, get roots() { return [...rootsRef.current] }, get qualities() { return [...qualsRef.current] } })
      for (;;) {
        const { value: ev, done } = await gen.next()
        if (done || ac.signal.aborted) break
        if (ev.type === 'step') { setStepRecs(r => ({ ...(ev.rec.step === 'root' ? {} : r), [ev.rec.step]: ev.rec })); setPartial(ev.partial); setDeciding(ev.rec.step === 'root' ? 'quality' : ev.rec.step === 'quality' ? 'bass' : null) }
        else {
          const wait = Math.max(0, lastPlay + holdRef.current * 1000 - Date.now())
          if (wait) await sleep(wait, ac.signal)
          if (ac.signal.aborted) break
          lastPlay = Date.now()
          const gap = Math.min(520, Math.max(160, holdRef.current * 1000 / 9))
          void playChord(ev.rec.voicing, instRef.current, holdRef.current * 1000, gap)
          setChords(c => [...c, ev.rec]); setPartial({}); setDeciding('root') // the next chord's first call goes out as the bass note sounds
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
  const lit = new Map<number, 'bass' | 'lh' | 'rh'>(); if (current) { lit.set(current.voicing.bass, 'bass'); current.voicing.lh.forEach(u => lit.set(u, 'lh')); current.voicing.rh.forEach(u => lit.set(u, 'rh')) }
  const whites = Array.from({ length: HI - LO + 1 }, (_, i) => LO + i).filter(m => !isBlack(m))
  const wW = 100 / whites.length

  return (
    <main className="pianotab">
      <details className="about">
        <summary>What is this?</summary>
        <p><b>Jev improvising chords.</b> Every few seconds it makes three decisions in a row — a root, a quality (from 18 jazz chord types), and which chord tone goes in the bass — each one a multiple-choice question whose only context is the one-sentence "vibe" above and the list of chords it has played so far. Code then voices the chord (bass, two left-hand tones, four right-hand tones, each voice moving to its nearest new tone), arpeggiates it, and plays it through a Rhodes sample. The rows below show Jev's probability for every option at each step.</p>
        <p><b>Scientific value: modest at best.</b> There is no right answer to grade against, so all we can measure is the shape of what it plays: how often it moves by falling fifths, uses ii–V–I, changes key, or repeats itself. What it actually does is revealing in a small way. Left to its top choice it opens with a genuinely idiomatic ten or so chords and then finds a fixed point — the same chord forever, or two chords alternating — because a decision model with no memory beyond the chord list has no reason to leave a place it likes. Tell it in the vibe text that you like falling fifths and it will fall by fifths until it runs out of keys. So the demo runs on Jev's <i>distribution</i>, sharpened (the "adventure" slider), with a small escape hatch that raises the temperature when the last four roots look stuck. Neither is a musical hint; both are ways of hearing more of what it knows.</p>
        <p>We built it because it was fun. Turn the hold up, dim the lights, disable the qualities you don't want to hear, and let it wander.</p>
      </details>
      <div className="pianotop">
        <textarea value={vibe} onChange={e => setVibe(e.target.value)} rows={2} disabled={running} />
        <div className="pianoctl">
          {!running ? <button className="primary" onClick={start}>▶ play</button> : <button onClick={stop}>■ stop</button>}
          <label>hold <input type="range" min={2} max={10} step={0.5} value={hold} onChange={e => setHold(+e.target.value)} /> {hold}s</label>
          <label title="withhold the previous chord's quality when the same root is chosen again"><input type="checkbox" checked={noRepeat} disabled={running} onChange={e => setNoRepeat(e.target.checked)} /> no identical repeats</label>
          <label>sound <select value={instrument} onChange={e => setInstrument(+e.target.value)}>{INSTRUMENTS.map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select></label>
          <label title="0 = always Jev's top choice; higher = sample from its probability distribution, sharpened less">adventure <input type="range" min={0} max={1} step={0.1} value={temp} onChange={e => setTemp(+e.target.value)} /> {temp === 0 ? 'top choice' : `T=${temp}`}</label>
          <span className="status">{running ? 'playing' : chords.length ? 'stopped' : 'idle'}{error ? ` — ${error}` : ''}{chords.length ? ` · ${chords.length} chords · $${stats.costUsd.toFixed(4)} · ${Math.round(stats.msPerChord)} ms/chord` : ''}</span>
        </div>
      </div>

      <div className="nowplaying">
        <div className="bigchord">{current ? current.symbol : '—'}</div>
        <div className="chordmeta">{current ? <>{current.transition ?? 'opening'} · key feels like <b>{current.keyEstimate}</b>{current.escaping ? <span className="escape"> · escaping a loop (T={current.temperature.toFixed(2)})</span> : null}</> : 'press play'}</div>
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
        <StepRow title="ROOT" hint="click to enable / disable" keys={ROOTS.map(rootKey)} labels={ROOTS.map(rootSymbol)} probs={probs('root')} chosen={chosen('root')} active={deciding === 'root'} enabled={roots} onToggle={k => toggle(setRoots, k)} />
        <StepRow title="QUALITY" hint="click to enable / disable" keys={QUALITY_KEYS} titles={QUALITY_KEYS.map(k => QUALITIES[k].describe)} probs={probs('quality')} chosen={chosen('quality')} active={deciding === 'quality'} enabled={qualities} onToggle={k => toggle(setQualities, k)} />
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

function StepRow({ title, hint, keys, labels, titles, probs, chosen, active, enabled, onToggle }: { title: string; hint?: string; keys: string[]; labels?: string[]; titles?: string[]; probs?: Record<string, number>; chosen?: string; active: boolean; enabled?: Set<string>; onToggle?: (k: string) => void }) {
  return (
    <div className={`steprow ${active ? 'active' : ''}`}>
      <div className="steptitle">{title}{active && <span className="dots" />}{hint && <span className="hint"> · {hint}</span>}</div>
      <div className="options">
        {keys.map((k, i) => <button key={k} className={`opt ${chosen === k ? 'chosen' : ''} ${enabled && !enabled.has(k) ? 'off' : ''}`} disabled={!onToggle} title={titles?.[i]} onClick={() => onToggle?.(k)} style={probs && probs[k] !== undefined ? { '--p': probs[k] } as React.CSSProperties : undefined}>
          <span className="bar" /><span className="optkey">{labels?.[i] ?? k}</span>{probs && probs[k] !== undefined && <span className="pct">{(probs[k] * 100).toFixed(0)}%</span>}
        </button>)}
      </div>
    </div>
  )
}
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>(r => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r() }, { once: true }) })
