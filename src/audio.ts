import abcjs from 'abcjs'

let ac: AudioContext | undefined
export function audioContext() {
  if (!ac) { ac = new AudioContext(); abcjs.synth.registerAudioContext(ac) }
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

/** audition one pitch (MIDI number) with the piano soundfont */
export function playMidi(midi: number, ms = 600) {
  audioContext()
  ;((window as unknown as { __jevAudio?: unknown[] }).__jevAudio ??= []).push({ t: Date.now(), midi, ms }) // timing log (used by scripts/record.ts)
  return abcjs.synth.playEvent(
    [{ pitch: midi, instrument: 0, duration: ms / 2000, volume: 90, start: 0, gap: 0 }],
    undefined, 2000,
  ).catch(() => {})
}

/** full-score playback widget bound to a container element */
export function makePlayer(el: HTMLElement) {
  const ctl = new abcjs.synth.SynthController()
  ctl.load(el, null, { displayPlay: true, displayProgress: true, displayRestart: true, displayWarp: true })
  return {
    setTune: (tune: abcjs.TuneObject) => { audioContext(); return ctl.setTune(tune, false) },
  }
}
