export type V04Component = {
  id: string // mission_step id e.g. 1.1
  cmp: string // CMP-01
  name: string
  displayText: string
  fields: Record<string, string>
}

export type V04ScriptStep = {
  id: string // step-1
  index: number
  name: string
  phase: string // P1
  purpose: string
  components: V04Component[]
}

export type V04Phase = {
  id: string // phase-1
  phase: string // P1
  title: string
  steps: V04ScriptStep[]
}

/** Align with master/mission_spec_schema.csv + mission_phase_step_meta_model */
export const V04_SCHEMA_FIELDS = [
  'Phase',
  'Script Step',
  'Step',
  'Component',
  'Display Text',
  'Display Image',
  'Video Play',
  'Kai Script 1',
  'Kai Script 2',
  'Kai Feedback Script - Correct',
  'Kai Feedback Script - Wrong',
  'Transition Script',
  'Knowledge point',
] as const

export type V04SchemaField = (typeof V04_SCHEMA_FIELDS)[number]

function stripHeader(md: string): string {
  return md.replace(/^<!--[\s\S]*?-->\s*/m, '')
}

function unescapeCell(s: string): string {
  return s.replace(/\\n/g, '\n').trim()
}

/** Parse N3 bundle / phase file into Phase → script_step → components */
export function parseV04Content(md: string): V04Phase[] {
  const clean = stripHeader(md || '')
  const phases = new Map<string, V04Phase>()
  let currentPhase = 'P1'
  let currentStep: V04ScriptStep | null = null
  let currentComp: V04Component | null = null
  let mode: 'none' | 'display' | 'fields' = 'none'
  let displayBuf: string[] = []

  const ensurePhase = (p: string) => {
    const num = p.replace(/^P/i, '')
    const id = `phase-${num}`
    if (!phases.has(p)) {
      phases.set(p, {
        id,
        phase: p,
        title: `Phase ${num}`,
        steps: [],
      })
    }
    return phases.get(p)!
  }

  const flushDisplay = () => {
    if (currentComp && mode === 'display') {
      currentComp.displayText = displayBuf.join('\n').trim()
      displayBuf = []
    }
  }

  const lines = clean.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    const phaseBanner =
      /^#\s*=====?\s*(P[1-4])\b/i.exec(line) ||
      /^#\s+.+\(v0\.4\)\s*—\s*(P[1-4])\s*$/i.exec(line)
    if (phaseBanner) {
      flushDisplay()
      mode = 'none'
      currentPhase = phaseBanner[1]!.toUpperCase()
      ensurePhase(currentPhase)
      currentStep = null
      currentComp = null
      continue
    }

    const stepHead = /^#\s+script_step\s+(\d+)\s*[:·.]\s*(.+)$/i.exec(line)
    if (stepHead) {
      flushDisplay()
      mode = 'none'
      currentComp = null
      const index = Number(stepHead[1])
      const name = stepHead[2]!.trim()
      const ph = ensurePhase(currentPhase)
      currentStep = {
        id: `step-${index}`,
        index,
        name,
        phase: currentPhase,
        purpose: '',
        components: [],
      }
      ph.steps.push(currentStep)
      continue
    }

    if (currentStep) {
      const pur =
        /^>\s*\*{0,2}Phase\*{0,2}:\s*(P[1-4])\s*[·•]\s*\*{0,2}教学目的\*{0,2}:\s*(.+)$/i.exec(
          line,
        )
      if (pur) {
        currentStep.phase = pur[1]!.toUpperCase()
        currentStep.purpose = pur[2]!.trim()
        currentPhase = currentStep.phase
        continue
      }
    }

    const ms =
      /^##\s+mission_step\s+([\d.]+)\s*:\s*(CMP-\d+)\s*(.*)$/i.exec(line)
    if (ms && currentStep) {
      flushDisplay()
      mode = 'none'
      currentComp = {
        id: ms[1]!,
        cmp: ms[2]!.toUpperCase(),
        name: (ms[3] || '').trim(),
        displayText: '',
        fields: {},
      }
      currentStep.components.push(currentComp)
      continue
    }

    if (/^###\s+Display Text/i.test(line)) {
      flushDisplay()
      mode = 'display'
      displayBuf = []
      continue
    }

    if (/^###\s+其他/i.test(line) || /^###\s+Fields/i.test(line) || /^###\s+字段/i.test(line)) {
      flushDisplay()
      mode = 'fields'
      continue
    }

    if (mode === 'display' && currentComp) {
      if (/^```/.test(line)) {
        // skip fence lines; content between fences collected
        if (displayBuf.length && displayBuf.some((l) => l.trim())) {
          // closing fence
          flushDisplay()
          mode = 'none'
        }
        continue
      }
      if (/^---/.test(line) || /^##\s+/.test(line) || /^#\s+/.test(line)) {
        flushDisplay()
        mode = 'none'
        i--
        continue
      }
      displayBuf.push(line)
      continue
    }

    if (mode === 'fields' && currentComp) {
      const row = /^\|\s*\*{0,2}([^|*]+)\*{0,2}\s*\|\s*(.*?)\s*\|\s*$/.exec(line)
      if (row) {
        const key = row[1]!.trim()
        if (key === '字段' || /^-+$/.test(key)) continue
        currentComp.fields[key] = unescapeCell(row[2] || '')
      }
      if (/^---/.test(line) || /^##\s+/.test(line) || /^#\s+/.test(line)) {
        mode = 'none'
        i--
      }
    }
  }
  flushDisplay()

  // stable order P1–P4
  return (['P1', 'P2', 'P3', 'P4'] as const)
    .map((p) => phases.get(p))
    .filter((p): p is V04Phase => !!p && p.steps.length > 0)
}

export function isV04Content(md: string): boolean {
  return (
    /v0\.4|component content|mission_step\s+[\d.]+/i.test(md) &&
    /script_step\s+\d+/i.test(md)
  )
}
