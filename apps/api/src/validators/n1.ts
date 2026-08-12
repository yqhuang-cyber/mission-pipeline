import type { DecisionCreate } from '@mission-pipeline/shared'
import type { PhaseId } from '../master/eligibility.js'
import { WATCH_COMPONENTS } from '../master/nodeSpecs.js'

export type ScriptStep = {
  index: number
  name: string
  phase: PhaseId
  purpose: string
  suggestedComponents: string
  body: string
}

export type ValidationIssue = {
  level: 'error' | 'warning' | 'info'
  code: string
  message: string
}

/** Match Mission 4 baseline: `# Phase N` + `## script_step N.` */
export function parsePhasedScript(md: string): ScriptStep[] {
  const steps: ScriptStep[] = []
  let currentPhase: PhaseId = 'P1'
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // # Phase 1 — …  OR  ## Phase 1 — …
    const pm = /^#{1,2}\s+Phase\s+([1-4])\b/i.exec(line)
    if (pm) {
      currentPhase = `P${pm[1]}` as PhaseId
      i++
      continue
    }

    // ## script_step 1. TITLE  OR  ### script_step 1. TITLE
    const sm = /^#{2,3}\s+script_step\s+(\d+)\.\s*(.+)$/i.exec(line)
    if (sm) {
      const index = Number(sm[1])
      const name = sm[2]!.trim()
      let purpose = ''
      let suggestedComponents = ''
      const bodyLines: string[] = []
      i++
      while (i < lines.length) {
        const l = lines[i]!
        if (/^#{1,2}\s+Phase\s+/i.test(l) || /^#{2,3}\s+script_step\s+/i.test(l)) {
          break
        }
        const pur =
          /^>\s*\*{0,2}教学目的\*{0,2}:\s*(.*)$/i.exec(l) ||
          /^>\s*教学目的:\s*(.*)$/i.exec(l)
        if (pur) {
          purpose = pur[1]!.replace(/^\*+|\*+$/g, '').trim()
          i++
          continue
        }
        const sug =
          /^>\s*\*{0,2}建议\s*component\*{0,2}:\s*(.*)$/i.exec(l) ||
          /^>\s*建议 component:\s*(.*)$/i.exec(l)
        if (sug) {
          suggestedComponents = sug[1]!.replace(/^\*+|\*+$/g, '').trim()
          i++
          continue
        }
        // skip other meta quote lines (备注/说明/状态) from body start
        if (/^>\s*\*{0,2}(备注|说明|状态|处理)\*{0,2}:/i.test(l)) {
          i++
          continue
        }
        bodyLines.push(l)
        i++
      }
      steps.push({
        index,
        name,
        phase: currentPhase,
        purpose,
        suggestedComponents,
        body: bodyLines.join('\n').trim(),
      })
      continue
    }
    i++
  }

  return steps
}

export function validateN1(md: string): {
  issues: ValidationIssue[]
  decisions: DecisionCreate[]
  steps: ScriptStep[]
} {
  const steps = parsePhasedScript(md)
  const issues: ValidationIssue[] = []
  const decisions: DecisionCreate[] = []

  if (!/^##\s+元信息/m.test(md)) {
    issues.push({
      level: 'warning',
      code: 'N1_MISSING_META',
      message: '缺少「## 元信息」段（基线必需）',
    })
    decisions.push({
      node: 'N1',
      targetType: 'mission',
      type: 'confirm',
      severity: 'blocking',
      question:
        '输出缺少「## 元信息」（核心词汇/句型/角色等）。是否 Reject 后 Rerun，还是接受并手补？',
      options: [
        { id: 'rerun', label: 'Reject 后 Rerun（推荐）', recommended: true },
        { id: 'accept', label: '接受并稍后手补' },
      ],
      aiRationale: '对齐 missions/mission_4/v0.2_script_phased.md 打样',
    })
  }

  if (!/Phase\s*框架总览/.test(md)) {
    issues.push({
      level: 'warning',
      code: 'N1_MISSING_OVERVIEW',
      message: '缺少「Phase 框架总览」表',
    })
  }

  if (steps.length === 0) {
    issues.push({
      level: 'error',
      code: 'N1_NO_STEPS',
      message: '未解析到任何 script_step',
    })
    decisions.push({
      node: 'N1',
      targetType: 'mission',
      type: 'edit_required',
      severity: 'blocking',
      question: 'v0.2 未解析到 script_step，是否接受并手工编辑？',
      options: [
        { id: 'accept_edit', label: '接受并稍后手工编辑', recommended: true },
        { id: 'rerun', label: 'Reject 再 Rerun' },
      ],
      aiRationale: '期望格式：## script_step N. TITLE',
    })
    return { issues, decisions, steps }
  }

  const phaseOrder = ['P1', 'P2', 'P3', 'P4']
  let lastIdx = -1
  for (const p of steps.map((s) => s.phase)) {
    const idx = phaseOrder.indexOf(p)
    if (idx < lastIdx) {
      issues.push({
        level: 'error',
        code: 'N1_PHASE_ORDER',
        message: `Phase 顺序异常：回退到 ${p}`,
      })
      break
    }
    lastIdx = Math.max(lastIdx, idx)
  }

  for (const step of steps) {
    if (!step.purpose || step.purpose === 'TBD' || step.purpose === '—') {
      issues.push({
        level: 'error',
        code: 'N1_PURPOSE_TBD',
        message: `script_step ${step.index} 教学目的为空`,
      })
      decisions.push({
        node: 'N1',
        targetType: 'script_step',
        targetId: String(step.index),
        type: 'edit_required',
        severity: 'blocking',
        question: `script_step ${step.index}「${step.name}」缺教学目的，如何处理？`,
        options: [
          {
            id: 'use_default',
            label: `默认：完成「${step.name}」相关教学目标`,
            recommended: true,
          },
          { id: 'manual', label: '稍后手写' },
        ],
        aiRationale: '基线每步必须有教学目的',
      })
    }
    if (!step.suggestedComponents) {
      issues.push({
        level: 'error',
        code: 'N1_NO_SUGGESTED_CMP',
        message: `script_step ${step.index} 缺少「建议 component」`,
      })
      decisions.push({
        node: 'N1',
        targetType: 'script_step',
        targetId: String(step.index),
        type: 'edit_required',
        severity: 'blocking',
        question: `script_step ${step.index}「${step.name}」缺少建议 component。如何处理？`,
        options: [
          { id: 'accept', label: '接受，到 N2 再选', recommended: false },
          { id: 'rerun', label: 'Reject 后让模型重生成', recommended: true },
        ],
        aiRationale: '基线每步都有「建议 component」行',
      })
    }
  }

  // consecutive watch components across suggested lists (flattened order)
  const flatCmps: Array<{ step: number; cmp: string }> = []
  for (const step of steps) {
    for (const m of step.suggestedComponents.matchAll(/CMP-\d+/gi)) {
      flatCmps.push({ step: step.index, cmp: m[0]!.toUpperCase() })
    }
  }
  let streak = 0
  let start = 0
  for (let i = 0; i < flatCmps.length; i++) {
    if (WATCH_COMPONENTS.has(flatCmps[i]!.cmp)) {
      if (streak === 0) start = i
      streak++
      if (streak >= 3) {
        decisions.push({
          node: 'N1',
          targetType: 'script_step',
          targetId: String(flatCmps[start]!.step),
          type: 'choice',
          severity: 'blocking',
          question: `建议 component 出现连续 ≥3 观看类（${flatCmps
            .slice(start, i + 1)
            .map((x) => x.cmp)
            .join('→')}）。如何处理？`,
          options: [
            { id: 'fix', label: '调整建议，插入互动组件', recommended: true },
            { id: 'accept', label: '例外接受' },
          ],
          aiRationale: 'pipeline_design N1：禁止连续三个及以上观看型 component',
        })
        streak = 0
      }
    } else {
      streak = 0
    }
  }

  // Checkpoint reminder
  decisions.push({
    node: 'N1',
    targetType: 'mission',
    type: 'confirm',
    severity: 'info',
    question:
      'Checkpoint：请确认 phase 切分、教学目的、建议 component，以及 Context Story 边界（如 step9→P2）后再 Approve。',
    options: [{ id: 'ack', label: '已核对', recommended: true }],
    aiRationale: 'pipeline_design N1 Checkpoint',
  })

  return { issues, decisions, steps }
}
