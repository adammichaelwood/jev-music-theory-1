// Record the piano demo: npx tsx scripts/record-piano.ts [outdir] [seconds]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'video-piano', SECONDS = +(process.argv[3] ?? 66)
const W = 1600, H = 900, ZOOM = 1.12
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: W, height: H } } })
const t0 = Date.now()
const page = await ctx.newPage()
await page.goto('http://localhost:5173/')
await page.waitForSelector('nav button')
await page.evaluate((z) => { document.documentElement.style.zoom = String(z) }, ZOOM)
await page.click('nav button:has-text("piano")')
await page.waitForSelector('.pianotab')
await page.evaluate(() => { document.querySelector('.pianotab .about')?.remove() })
await page.evaluate(() => {
  const bar = document.createElement('div')
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:10px 18px;background:rgba(13,15,20,.92);border-top:1px solid #262b38;color:#e6e9f0;font:600 15px Inter,system-ui,sans-serif;display:flex;justify-content:space-between;gap:16px'
  bar.innerHTML = '<span id="capl">Jev plays piano — TypeSafe\'s Jev, a decision model that never generates text, improvising: root → quality → bass, three decisions per chord</span><span id="capr" style="color:#8a92a6;font-weight:500">voiced, arpeggiated and played by code · sampled from Jev\'s own distribution</span>'
  document.body.appendChild(bar)
})
await page.waitForTimeout(2500)
await page.click('.pianoctl button.primary')
await page.waitForTimeout(SECONDS * 1000)
await page.evaluate(() => { document.getElementById('capl')!.textContent = 'github.com/adammichaelwood/jev-music-theory-1 · adammichaelwood.com/jev-music-theory-1' })
await page.waitForTimeout(3500)
const events = await page.evaluate(() => (window as unknown as { __jevPiano?: unknown[] }).__jevPiano ?? [])
const chords = await page.evaluate(() => [...document.querySelectorAll('.hchip b')].map(b => b.textContent))
const tEnd = Date.now()
await ctx.close(); await browser.close()
renameSync(await page.video()!.path(), join(OUT, 'video.webm'))
writeFileSync(join(OUT, 'events.json'), JSON.stringify({ t0, tEnd, events, chords }, null, 1))
console.log(`recorded ${((tEnd - t0) / 1000).toFixed(1)}s, ${events.length} chords: ${chords.join(' ')}`)
