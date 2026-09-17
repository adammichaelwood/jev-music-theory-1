import abcjs from 'abcjs'
import { useEffect, useRef } from 'react'
import type { Score, VoiceName } from '../score/model.ts'
import { lockKey } from '../score/model.ts'
import { type NoteRef, scoreToAbc } from './abc.ts'

export interface Highlight { v: VoiceName; m: number; onset?: number; cls: string }

interface Props {
  score: Score
  title?: string
  highlights?: Highlight[]
  onTune?: (tune: abcjs.TuneObject) => void
}

/** Renders the score with abcjs; tags each note's SVG with classes: given|placed, plus any highlights. */
export function ScoreView({ score, title, highlights = [], onTune }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const { abc, refs } = scoreToAbc(score, title)
    const [tune] = abcjs.renderAbc(ref.current, abc, { add_classes: true, responsive: 'resize', staffwidth: 900 })
    // walk rendered elements, map back to our notes via startChar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const line of (tune as any).lines ?? []) for (const staff of line.staff ?? []) for (const voice of staff.voices ?? []) for (const el of voice) {
      if (el.el_type !== 'note' || el.rest || !el.abselem?.elemset) continue
      let r: NoteRef | undefined
      for (let c = el.startChar; c < el.endChar && !r; c++) r = refs.get(c) // abcjs startChar may include leading space
      if (!r) continue
      const classes = [score.locked.has(lockKey(r.v, r.m, r.onset)) ? 'given' : 'placed']
      for (const h of highlights) if (h.v === r.v && h.m === r.m && (h.onset === undefined || h.onset === r.onset)) classes.push(h.cls)
      for (const svg of el.abselem.elemset as SVGElement[]) svg.classList.add(...classes)
    }
    onTune?.(tune)
  }, [score, title, highlights, onTune])
  return <div ref={ref} className="score" />
}
