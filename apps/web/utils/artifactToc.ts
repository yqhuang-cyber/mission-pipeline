import { headingAnchorId } from './headingIds'

export type TocStep = {
  id: string
  index: number
  title: string
}

export type TocPhase = {
  id: string
  phaseNum: string
  title: string
  steps: TocStep[]
}

/** Build Phase / script_step sidebar from v0.2-style markdown */
export function buildArtifactToc(md: string): TocPhase[] {
  const phases: TocPhase[] = []
  let current: TocPhase | null = null

  for (const line of md.split('\n')) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (!heading) continue
    const text = heading[2]!.trim()
    const id = headingAnchorId(text)
    if (!id) continue

    const phase = /^Phase\s+([1-4])\b\s*[—–-]?\s*(.*)$/i.exec(text)
    if (phase) {
      const phaseNum = phase[1]!
      const rest = (phase[2] || '').trim()
      current = {
        id,
        phaseNum,
        title: rest ? `Phase ${phaseNum} — ${rest}` : `Phase ${phaseNum}`,
        steps: [],
      }
      phases.push(current)
      continue
    }

    const step = /^script_step\s+(\d+)(?:\.\s*|\s+)(.+)$/i.exec(text)
    if (step) {
      const index = Number(step[1])
      const name = step[2]!.trim().replace(/\s*\(P[1-4]\)\s*$/i, '')
      if (!current) {
        current = {
          id: 'phase-other',
          phaseNum: '?',
          title: 'Other',
          steps: [],
        }
        phases.push(current)
      }
      current.steps.push({
        id,
        index,
        title: /^script_step\s+\d+\./i.test(text) ? `${index}. ${name}` : `${index} ${name}`,
      })
    }
  }

  return phases
}
