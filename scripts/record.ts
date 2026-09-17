// Record a demo video of the lab running several experiments at top speed.
//   npx tsx scripts/record.ts [outdir]
// Produces <outdir>/video.webm, events.json (audition + playback timing) for scripts/mixaudio.py.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { parseKey, parseScoreBlock, parseTime } from '../src/score/format.ts'
import { VOICES, beatsPerBar, durBeats, midi } from '../src/score/model.ts'
import { loadExercises } from './exercises.ts'

const OUT = process.argv[2] ?? 'video'
const BASE = 'http://localhost:5173/'
const W = 1600, H = 900, ZOOM = 1.25
const BPM = 72
const PLAN: { ex: string; cond: string; label: string }[] = [
  { ex: '001', cond: 'baseline', label: 'Experiment 1 of 3 · complete a cadence in C major (soprano + bass given) · condition: baseline' },
  { ex: '002', cond: 'backward', label: 'Experiment 2 of 3 · realize a figured bass in G major · strategy: backward (cadence first)' },
  { ex: '012', cond: 'backward', label: 'Experiment 3 of 3 · harmonize a Bach chorale melody from scratch · strategy: backward' },
]
mkdirSync(OUT, { recursive: true })
const exercises = loadExercises()

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: W, height: H } } })
const t0 = Date.now() // video starts when the page is created
const page = await ctx.newPage()
await page.goto(BASE)
await page.waitForSelector('.score svg')
await page.evaluate((z) => { document.documentElement.style.zoom = String(z) }, ZOOM)
// caption bar
await page.evaluate(() => {
  const bar = document.createElement('div')
  bar.id = 'cap'
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:10px 18px;background:rgba(13,15,20,.92);border-top:1px solid #262b38;color:#e6e9f0;font:600 15px Inter,system-ui,sans-serif;display:flex;justify-content:space-between;gap:16px'
  bar.innerHTML = '<span id="capl"></span><span id="capr" style="color:#8a92a6;font-weight:500"></span>'
  document.body.appendChild(bar)
})
const caption = (l: string, r = '') => page.evaluate(([l, r]) => { document.getElementById('capl')!.textContent = l; document.getElementById('capr')!.textContent = r }, [l, r])
const setReactValue = (selector: string, value: string) => page.evaluate(([sel, v]) => {
  const el = document.querySelector(sel) as HTMLInputElement
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}, [selector, value])
const status = () => page.evaluate(() => document.querySelector('.status')?.textContent ?? '')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const playbacks: { t: number; notes: { midi: number; start: number; dur: number }[]; seconds: number }[] = []
const marks: { t: number; text: string }[] = []

await caption('Jev Chorale Lab — TypeSafe\'s Jev, a decision model that never generates text, doing SATB part-writing one choice at a time', 'no hints from code · graded afterwards')
await sleep(3500)

for (const step of PLAN) {
  const ex = exercises.find(e => e.id.startsWith(step.ex))!
  await setReactValue('header select', ex.id)
  await sleep(300)
  await setReactValue('header label:has(> select) select, header select[title], header select:nth-of-type(2)', step.cond).catch(() => {})
  await page.evaluate((c) => { const sel = [...document.querySelectorAll('header select')].find(s => [...(s as HTMLSelectElement).options].some(o => o.value === c)) as HTMLSelectElement; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!; set.call(sel, c); sel.dispatchEvent(new Event('change', { bubbles: true })) }, step.cond)
  await setReactValue('input[type=range]', '4') // slider is inverted: 4 = max speed (0 ms delay)
  await sleep(400)
  await caption(step.label, 'speed: max')
  marks.push({ t: Date.now(), text: step.label })
  await sleep(1200)
  await page.click('button.primary')
  const start = Date.now()
  let st = ''
  while (Date.now() - start < 240_000) { await sleep(300); st = await status(); if (st.startsWith('done') || st.startsWith('idle')) break }
  const stopped = st.startsWith('done') && !st.includes('—')
  const scoreText = await page.evaluate(() => (document.querySelector('details pre') as HTMLElement)?.textContent ?? '')
  const turns = await page.evaluate(() => document.querySelectorAll('.turn').length)
  const grade = await page.evaluate(() => document.querySelector('.gradehead')?.textContent ?? '')
  await caption(step.label, stopped ? `Jev chose STOP after ${turns} turns · ${grade.replace(/\s+/g, ' ')} · playing the result` : `${turns} turns · ${st.replace(/^done — /, '')}`)
  await sleep(800)
  if (stopped) {
    // press the abcjs play button (visual progress); the audio is reconstructed from the score by mixaudio.py
    const score = parseScoreBlock(scoreText, parseKey(ex.keyText), parseTime(ex.timeText))
    const notes: { midi: number; start: number; dur: number }[] = []
    const bar = beatsPerBar(score.time), spb = 60 / BPM * (4 / score.time.den) // seconds per beat (quarter-based bpm)
    for (const v of VOICES) score.voices[v].forEach((ns, m) => ns.forEach(n => { if (!n.rest) notes.push({ midi: midi(n), start: (m * bar + n.onset) * spb, dur: durBeats(n.dur, score.time) * spb }) }))
    const seconds = score.nMeasures * bar * spb
    await page.click('.abcjs-midi-start').catch(() => {})
    playbacks.push({ t: Date.now(), notes, seconds })
    await sleep(seconds * 1000 + 1500)
  } else await sleep(2500)
}
await caption('Full write-up of what Jev can and can\'t do: github.com/adammichaelwood/jev-music-theory-1', '')
await sleep(4000)
const tEnd = Date.now()
const auditions = await page.evaluate(() => (window as unknown as { __jevAudio?: { t: number; midi: number; ms: number }[] }).__jevAudio ?? [])
await ctx.close()
await browser.close()
const video = await page.video()!.path()
renameSync(video, join(OUT, 'video.webm'))
writeFileSync(join(OUT, 'events.json'), JSON.stringify({ t0, tEnd, auditions, playbacks, marks }, null, 1))
console.log(`recorded ${((tEnd - t0) / 1000).toFixed(1)}s, ${auditions.length} auditions, ${playbacks.length} playbacks → ${OUT}/`)
