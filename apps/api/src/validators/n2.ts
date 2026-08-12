import type { DecisionCreate } from '@mission-pipeline/shared'
import {
  isAllowed,
  type PhaseId,
} from '../master/eligibility.js'
import type { ValidationIssue } from './n1.js'

export type MappedComponent = {
  id: string
  role: 'primary' | 'secondary'
  outline: string
  autoReplaced?: boolean
}

export type MappedStep = {
  phase: PhaseId
  scriptStep: number
  name: string
  purpose: string
  components: MappedComponent[]
}

/** Strip runtime HTML comment header if present */
export function stripArtifactHeader(md: string): string {
  return md.replace(/^<!--[\s\S]*?-->\s*/m, '')
}

/** Escape markdown table cell (keep outline single-line for round-trip). */
export function escapeMdTableCell(s: string): string {
  return (s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\|/g, '/')
    .replace(/\n/g, '\\n')
    .trim()
}

export function unescapeMdTableCell(s: string): string {
  return (s || '').replace(/\\n/g, '\n').trim()
}

function pipeCount(s: string): number {
  return (s.match(/\|/g) || []).length
}

function isCompleteComponentRow(buf: string): boolean {
  const t = buf.trimEnd()
  return pipeCount(t) >= 5 && /\|\s*$/.test(t)
}

function shouldStopRowAccumulate(line: string): boolean {
  return (
    /^##\s+Phase\s+/i.test(line) ||
    /^###\s+script_step\s+/i.test(line) ||
    /^\|\s*Component\s*\|/i.test(line) ||
    /^\|\s*[-:| ]+\|\s*$/.test(line) ||
    /^---\s*$/.test(line)
  )
}

function parseComponentTableRow(buf: string): MappedComponent | null {
  const m =
    /^\|\s*(CMP-\d+)\s*([^|]*)\|\s*(primary|secondary)\s*\|\s*([^|]*)\|\s*([\s\S]*?)\|\s*$/i.exec(
      buf.trim(),
    )
  if (!m) return null
  return {
    id: m[1]!.toUpperCase(),
    role: m[3]!.toLowerCase() as 'primary' | 'secondary',
    outline: unescapeMdTableCell(m[5] || ''),
  }
}

/** Parse v0.3 stepped script (table rows and/or bullet lines) */
export function parseSteppedScript(md: string): MappedStep[] {
  const clean = stripArtifactHeader(md)
  const steps: MappedStep[] = []
  let phase: PhaseId = 'P1'
  const lines = clean.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const pm = /^##\s+Phase\s+([1-4])/i.exec(line)
    if (pm) {
      phase = `P${pm[1]}` as PhaseId
      i++
      continue
    }
    const sm =
      /^###\s+script_step\s+(\d+)\.\s*(.+?)(?:\s*\((P[1-4])\))?\s*$/i.exec(line)
    if (sm) {
      const scriptStep = Number(sm[1])
      let name = sm[2]!.trim()
      name = name.replace(/\s*\(P[1-4]\)\s*$/i, '').trim()
      if (sm[3]) phase = sm[3].toUpperCase() as PhaseId
      let purpose = ''
      const components: MappedComponent[] = []
      i++
      while (i < lines.length) {
        const l = lines[i]!
        if (/^##\s+Phase\s+/i.test(l) || /^###\s+script_step\s+/i.test(l)) break
        const pur = /^>\s*\*{0,2}教学目的\*{0,2}:\s*(.*)$/i.exec(l)
        if (pur) {
          purpose = pur[1]!.trim()
          i++
          continue
        }

        // Component table row — may span multiple lines if outline had newlines
        if (/^\|\s*CMP-\d+/i.test(l)) {
          let buf = l
          while (!isCompleteComponentRow(buf) && i + 1 < lines.length) {
            const next = lines[i + 1]!
            if (shouldStopRowAccumulate(next)) break
            i++
            buf += `\n${next}`
          }
          const parsed = parseComponentTableRow(buf)
          if (parsed) components.push(parsed)
          i++
          continue
        }

        const simple =
          /^[-*]\s*(CMP-\d+)\s+(primary|secondary)\s*:?\s*(.*)$/i.exec(l)
        if (simple) {
          components.push({
            id: simple[1]!.toUpperCase(),
            role: simple[2]!.toLowerCase() as 'primary' | 'secondary',
            outline: unescapeMdTableCell(
              simple[3]!.replace(/\s*\[auto-flagged\]\s*$/i, '').trim(),
            ),
          })
        }
        i++
      }
      steps.push({ phase, scriptStep, name, purpose, components })
      continue
    }
    i++
  }
  return steps
}

export function validateN2(steps: MappedStep[]): {
  issues: ValidationIssue[]
  decisions: DecisionCreate[]
  steps: MappedStep[]
} {
  const issues: ValidationIssue[] = []
  const decisions: DecisionCreate[] = []
  const fixed = steps.map((s) => ({
    ...s,
    components: s.components.map((c) => ({ ...c })),
  }))

  for (const step of fixed) {
    for (const c of step.components) {
      if (!isAllowed(step.phase, c.id)) {
        issues.push({
          level: 'error',
          code: 'N2_NOT_ALLOWED',
          message: `${step.phase} script_step ${step.scriptStep} 不可用 ${c.id}`,
        })
        c.autoReplaced = true
        decisions.push({
          node: 'N2',
          targetType: 'script_step',
          targetId: String(step.scriptStep),
          type: 'choice',
          severity: 'blocking',
          question: `${step.phase} 的 script_step ${step.scriptStep} 选用了不允许的 ${c.id}。如何处理？`,
          options: [
            { id: 'remove', label: `移除 ${c.id}`, recommended: true },
            { id: 'keep', label: '例外保留（需 TD 知悉）' },
          ],
          aiRationale: 'phase_component_eligibility 硬约束',
        })
      }
    }
    if (step.components.length > 10) {
      issues.push({
        level: 'warning',
        code: 'N2_TOO_MANY_CMP',
        message: `script_step ${step.scriptStep} 挂了 ${step.components.length} 个 component（上限 ≤10）`,
      })
    }
  }

  const hasP1 = fixed.some((s) => s.phase === 'P1')
  if (
    hasP1 &&
    !fixed.some((s) => s.components.some((c) => c.id === 'CMP-04'))
  ) {
    issues.push({
      level: 'error',
      code: 'N2_P1_NEED_CMP04',
      message: 'P1 缺少 CMP-04（Mission 发布）',
    })
    decisions.push({
      node: 'N2',
      targetType: 'mission',
      type: 'choice',
      severity: 'blocking',
      question: 'P1 缺少 CMP-04（Mission 发布）。如何处理？',
      options: [
        { id: 'add', label: '在首个 P1 step 补挂 CMP-04', recommended: true },
        { id: 'ack', label: '已知悉仍继续（不推荐）' },
      ],
      aiRationale: 'enforcement: P1 ⊇ CMP-04',
    })
  }

  const hasP4 = fixed.some((s) => s.phase === 'P4')
  if (
    hasP4 &&
    !fixed.some((s) =>
      s.components.some((c) => c.id === 'CMP-21' || c.id === 'CMP-26'),
    )
  ) {
    issues.push({
      level: 'error',
      code: 'N2_P4_NEED_TAKEAWAY',
      message: 'P4 缺少 CMP-21 或 CMP-26（关键表达回顾）',
    })
  }

  const has19 = fixed.some((s) => s.components.some((c) => c.id === 'CMP-19'))
  const has18 = fixed.some((s) => s.components.some((c) => c.id === 'CMP-18'))
  if (has19 && !has18) {
    issues.push({
      level: 'error',
      code: 'N2_P3_NEED_SETUP',
      message: '使用 CMP-19 时必须有 CMP-18（AI Mission Setup）',
    })
  }

  return { issues, decisions, steps: fixed }
}
