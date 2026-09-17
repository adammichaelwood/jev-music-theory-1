import { describe, expect, it } from 'vitest'
import { parseKey, parseScoreBlock, parseTime, serializeScoreBlock } from '@core/formats/csv.ts'
import { gaps, isComplete, placeNote } from '@core/score/model.ts'

const K = parseKey('E-flat major'), T = parseTime('4/4')

describe('format', () => {
  it('round-trips', () => {
    const src = `S, E-FLAT-5-QUARTER F-5-QUARTER G-5-HALF, A-FLAT-5-WHOLE
A, _ _ B-FLAT-4-HALF, _-EIGHTH C-5-EIGHTH _ _ _
T, ,
B, E-FLAT-3-QUARTER-5/3 _ _ _, A-FLAT-2-WHOLE-6/4`
    const s = parseScoreBlock(src, K, T)
    expect(serializeScoreBlock(s)).toBe(src)
    expect(s.locked.size).toBe(8)
    expect(gaps(s, 'T', 0)).toEqual([[0, 4]])
    expect(gaps(s, 'A', 1)).toEqual([[0, 0.5], [1, 4]])
  })
  it('unicode + align', () => {
    const src = `S, C-5-QUARTER D-SHARP-5-QUARTER E-5-HALF
A, E-4-HALF G-FLAT-4-HALF
T, G-3-WHOLE
B, C-3-QUARTER B-2-QUARTER C-3-HALF-6`
    const s = parseScoreBlock(src, K, T)
    const out = serializeScoreBlock(s, { accidentals: 'unicode', align: true })
    console.log(out)
    expect(parseScoreBlock(out, K, T).voices).toEqual(s.voices)
    const lines = out.split('\n')
    // simultaneous notes share a column: 'E-5-HALF' (beat 3) and 'G♭-4-HALF' and 'C-3-HALF-6'
    expect(lines[0].indexOf('E-5-HALF')).toBe(lines[1].indexOf('G♭-4-HALF'))
    expect(lines[0].indexOf('E-5-HALF')).toBe(lines[3].indexOf('C-3-HALF-6'))
  })
  it('placeNote overwrites unlocked, refuses locked', () => {
    const s = parseScoreBlock(`S, C-5-WHOLE\nA,\nT,\nB,`, K, T)
    placeNote(s, 'A', 0, { letter: 'E', acc: 'natural', octave: 4, dur: 'HALF', onset: 0 })
    const removed = placeNote(s, 'A', 0, { letter: 'F', acc: 'natural', octave: 4, dur: 'QUARTER', onset: 1 })
    expect(removed.map(n => n.letter)).toEqual(['E'])
    expect(serializeScoreBlock(s).split('\n')[1]).toBe('A, _ F-4-QUARTER _ _')
    expect(() => placeNote(s, 'S', 0, { letter: 'D', acc: 'natural', octave: 5, dur: 'QUARTER', onset: 0 })).toThrow()
    expect(isComplete(s)).toBe(false)
  })
})
