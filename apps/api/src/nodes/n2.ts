import type { DecisionCreate } from '@mission-pipeline/shared'
import { completeMarkdown } from '../llm/client.js'
import {
  COMPONENT_NAMES,
  PHASE_ALLOWED,
  isAllowed,
  type PhaseId,
} from '../master/eligibility.js'
import { loadCatalogComponents } from '../master/catalog.js'
import { keyFieldsFor } from '../master/keyFields.js'
import { WATCH_COMPONENTS } from '../master/nodeSpecs.js'
import { parsePhasedScript } from '../validators/n1.js'
import {
  validateN2,
  type MappedComponent,
  type MappedStep,
  escapeMdTableCell,
} from '../validators/n2.js'
import type { NodeEngineResult } from './n1.js'

export type { MappedComponent, MappedStep }

function parseSuggestedCmps(line: string): string[] {
  return [...line.matchAll(/CMP-\d+/gi)].map((m) => m[0]!.toUpperCase())
}

function clip(s: string, max = 200): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= max) return t
  // Prefer keeping complete ✓ goals rather than mid-goal "Talk about C…"
  if (/[✓✔]/.test(t)) {
    const prefix = t.split(/[✓✔]/)[0] || ''
    const goals = [...t.matchAll(/[✓✔]\s*[^✓✔]+/g)].map((m) => m[0]!.trim())
    let acc = prefix.trim()
    for (const g of goals) {
      const next = acc ? `${acc} ${g}` : g
      if (next.length > max) break
      acc = next
    }
    if (acc.length >= Math.min(80, max * 0.35)) return acc
  }
  let cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  if (sp > max * 0.55) cut = cut.slice(0, sp)
  return `${cut}…`
}

/** Structured choice outline: question + A/B/C(/D) + optional Student chooses X */
function extractChoiceOutline(raw: string): string {
  const text = raw.replace(/\r/g, '')
  const q =
    /((?:How many|What is the teacher|What is|Which|Where is|Who|Is she|Are you|你觉得|哪一句)[^\n?？]{0,100}[?？]?)/i.exec(
      text,
    )?.[1]?.trim() || ''
  let opts = ''
  const bulletOpts = [
    ...text.matchAll(/^\s*[-•*]?\s*([ABCD])\s*[.、:：)]\s*([^\n]+)/gim),
  ]
  if (bulletOpts.length >= 2) {
    opts = bulletOpts
      .map((m) => `${m[1]!.toUpperCase()}. ${m[2]!.trim()}`)
      .join(' ')
  } else {
    const compact =
      /(?:Student\s*choices?|Choices)\s*:?\s*([ABCD][\s\S]{0,80}?)(?=\n\s*\*\*|\n\s*Where is|\n\s*Kai:|$)/i.exec(
        text,
      )?.[1]
    if (compact) {
      const parts = [
        ...compact.matchAll(/\b([ABCD])\s*[.、:：)]?\s*(\S+)/gi),
      ]
      if (parts.length >= 2) {
        opts = parts
          .map((m) => `${m[1]!.toUpperCase()}. ${m[2]!.trim()}`)
          .join(' ')
      }
    }
  }
  const ans = /Student\s+chooses?\s*([ABCD])\b/i.exec(text)
  if (!q && !opts) return ''
  const bits = [
    q ? `【题目】${/[?？]$/.test(q) ? q : `${q}?`}` : '',
    opts ? `Student choices: ${opts}` : '',
    ans ? `Student chooses ${ans[1]!.toUpperCase()}.` : '',
  ].filter(Boolean)
  return bits.join(' ')
}

function sectionAfter(
  body: string,
  startRe: RegExp,
  endRe?: RegExp,
): string {
  const m = startRe.exec(body)
  if (!m || m.index == null) return ''
  const from = m.index
  const rest = body.slice(from)
  if (!endRe) return rest
  const end = endRe.exec(rest.slice(m[0].length))
  if (!end || end.index == null) return rest
  return rest.slice(0, m[0].length + end.index)
}

/** Pull the slice of script body this CMP should carry (split when N>1). */
export function outlineFromBody(
  body: string,
  cmp: string,
  allCmps: string[] = [cmp],
): string {
  const name = COMPONENT_NAMES[cmp] || cmp
  const raw = (body || '').replace(/\r/g, '')
  const multi = allCmps.length > 1
  let piece = ''

  switch (cmp) {
    case 'CMP-01': {
      // Opening Kai talk before mission card / goals screen
      piece =
        sectionAfter(
          raw,
          /\*\*Kai:\*\*[\s\S]{0,400}?(?=YOUR MISSION|学习目标|Screen:|START MISSION|\*\*Video|\*\*Screen)/i,
        ) ||
        sectionAfter(raw, /\*\*Kai:\*\*[\s\S]{0,280}/i) ||
        raw
      break
    }
    case 'CMP-32': {
      piece =
        sectionAfter(
          raw,
          /(?:学习目标|goals?|Today,? you(?:'ll| will)|Screen:[\s\S]{0,40}YOUR MISSION)/i,
          /START MISSION|\*\*Video/i,
        ) || '学习目标 / goals 列表（从本步 Screen·goals 提取）'
      break
    }
    case 'CMP-04':
    case 'CMP-18': {
      piece =
        sectionAfter(
          raw,
          /YOUR MISSION|Mission Setup|START MISSION|AI Mission/i,
        ) || 'YOUR MISSION + goals + START 按钮'
      break
    }
    case 'CMP-03': {
      piece =
        sectionAfter(
          raw,
          /(?:First,\s*watch|\*\*Video\s*plays|\bVideo\s*plays\b)/i,
          /Student choices|How many countries|\*\*Kai:\*\*[\s\S]{0,40}Hmm/i,
        ) ||
        sectionAfter(raw, /\*\*Video/i) ||
        '完整视频播放段（独立 objectKey）'
      break
    }
    case 'CMP-05': {
      piece =
        sectionAfter(
          raw,
          /(?:Replay\.|\*\*Freeze|\bFreeze\b|视频文字|叠字)/i,
        ) ||
        sectionAfter(raw, /\*\*Video/i) ||
        '视频片段 + 文字叠字 / Freeze'
      break
    }
    case 'CMP-09':
    case 'CMP-10':
    case 'CMP-16':
    case 'CMP-23': {
      piece =
        sectionAfter(raw, /Screen|国旗|图|image|Visual/i) ||
        '视觉/图卡内容（从本步 Screen 提取）'
      break
    }
    case 'CMP-13':
    case 'CMP-33':
    case 'CMP-02':
    case 'CMP-37':
    case 'CMP-28': {
      piece =
        extractChoiceOutline(raw) ||
        sectionAfter(
          raw,
          /(?:Student choices|How many|What is the teacher|Choices:|【题目】|\bA\s*[.、:：)]\s*\S)/i,
        ) ||
        sectionAfter(raw, /\?\s*\n[\s\S]{0,80}?\bA[\).:\s]/i) ||
        '选择题干 + 选项 A/B/C（从本步问答提取）'
      break
    }
    case 'CMP-08':
    case 'CMP-35': {
      piece =
        sectionAfter(
          raw,
          /(?:\*\*Audio|\bAudio:|Listen(?:\s+and\s+repeat)?|跟读|nǐ\s|pinyin)/i,
        ) || '听音跟读目标句（audio + 汉字/拼音）'
      break
    }
    case 'CMP-11':
    case 'CMP-07': {
      piece =
        sectionAfter(
          raw,
          /(?:Pattern|句型|Look carefully|Screen:[\s\S]{0,120}？)/i,
        ) || '句型观察/公式例句'
      break
    }
    case 'CMP-12':
    case 'CMP-14':
    case 'CMP-17':
    case 'CMP-30':
    case 'CMP-34': {
      piece =
        sectionAfter(
          raw,
          /(?:Student builds|拖|字块|填空|Drop|构建)/i,
        ) || '组句/拖拽/填空练习内容'
      break
    }
    case 'CMP-15':
    case 'CMP-19':
    case 'CMP-24': {
      piece =
        sectionAfter(
          raw,
          /(?:Kai asks|对话|Student answers|NPC|role-?play|开放任务)/i,
        ) || '对话轮次 / 口语任务提示'
      break
    }
    case 'CMP-29':
    case 'CMP-27':
    case 'CMP-26':
    case 'CMP-21': {
      piece =
        sectionAfter(raw, /(?:词汇|word|Listen\.|\*\*[^*]{1,12}\*\*\s*\()/i) ||
        '词汇/关键表达条目'
      break
    }
    case 'CMP-20':
    case 'CMP-22':
    case 'CMP-36': {
      piece =
        sectionAfter(raw, /(?:总结|预告|Next|庆祝|CTA|complete)/i) ||
        '过渡/总结页文案'
      break
    }
    default: {
      if (multi) {
        // Avoid dumping the full step body onto every leftover CMP
        const kai = sectionAfter(raw, /\*\*Kai:\*\*[\s\S]{0,160}/i)
        piece = kai || raw.slice(0, 160)
      } else {
        piece = raw
      }
    }
  }

  const out = clip(
    piece,
    ['CMP-32', 'CMP-04', 'CMP-18'].includes(cmp)
      ? 900
      : multi
        ? 320
        : 360,
  )
  if (!out) {
    return `${name}: （从本步原文按组件职责提炼 outline）`
  }
  // Prefix with name only if not already starting with it
  if (out.toLowerCase().startsWith(name.toLowerCase())) return out
  return `${name}: ${out}`
}

/** Build v0.3 from v0.2 suggested components (gold = mission_4 map) */
export function mapFromPhased(missionName: string, phasedMd: string): {
  content: string
  steps: MappedStep[]
} {
  const scriptSteps = parsePhasedScript(phasedMd)
  const mapped: MappedStep[] = scriptSteps.map((s) => {
    let ids = parseSuggestedCmps(s.suggestedComponents)
    if (ids.length === 0) {
      // fallback defaults by phase
      ids =
        s.phase === 'P1'
          ? ['CMP-01', 'CMP-04']
          : s.phase === 'P4'
            ? ['CMP-21', 'CMP-22']
            : s.phase === 'P3'
              ? ['CMP-18', 'CMP-19']
              : ['CMP-13']
    }
    // filter allowed
    ids = ids.filter((id) => isAllowed(s.phase, id))
    if (ids.length === 0) ids = [PHASE_ALLOWED[s.phase][0]!]

    const components: MappedComponent[] = ids.map((id, i) => ({
      id,
      role: i === 0 ? 'primary' : 'secondary',
      outline: outlineFromBody(s.body, id, ids),
    }))

    return {
      phase: s.phase,
      scriptStep: s.index,
      name: s.name,
      purpose: s.purpose,
      components,
    }
  })

  // Ensure P1 has CMP-04 somewhere
  if (
    mapped.some((m) => m.phase === 'P1') &&
    !mapped.some((m) => m.components.some((c) => c.id === 'CMP-04'))
  ) {
    const firstP1 = mapped.find((m) => m.phase === 'P1')!
    firstP1.components.push({
      id: 'CMP-04',
      role: 'primary',
      outline: 'Mission 发布（enforcement 自动补挂）',
    })
  }

  return { content: renderV03(missionName, mapped), steps: mapped }
}

export function renderV03(missionName: string, steps: MappedStep[]): string {
  const lines: string[] = [
    `# ${missionName} — script_step → Component 映射 (v0.3)`,
    ``,
    `> **版本**: v0.3`,
    `> **输入**: v0.2 phased script + phase_component_eligibility`,
    `> **产出**: 每 script_step 定稿 component + 角色 + 关键字段 + content outline`,
    `> **约定**: 1 component = 1 mission step`,
    ``,
    `---`,
    ``,
    `## 总览`,
    ``,
    `| Phase | script_step | Component(s) | mission_step 数 | 关键决策点 |`,
    `|---|---|---|---|---|`,
  ]

  for (const s of steps) {
    const cmps = s.components.map((c) => c.id).join(' + ') || '（无）'
    lines.push(
      `| ${s.phase} | ${s.scriptStep} | ${cmps} | ${s.components.length} | — |`,
    )
  }

  lines.push('', '---', '')

  const catalogNames = new Map(
    loadCatalogComponents().map((x) => [x.id, x.nameZh]),
  )
  let phase: PhaseId | null = null
  for (const s of steps) {
    if (s.phase !== phase) {
      phase = s.phase
      lines.push(`## Phase ${phase.slice(1)}`)
      lines.push('')
    }
    lines.push(
      `### script_step ${s.scriptStep}. ${s.name} (${s.phase})`,
    )
    lines.push('')
    if (s.purpose) lines.push(`> **教学目的**: ${s.purpose}`)
    lines.push('')
    lines.push(`| Component | 角色 | 关键字段 | Content outline |`)
    lines.push(`|---|---|---|---|`)
    for (const c of s.components) {
      const name = catalogNames.get(c.id) || COMPONENT_NAMES[c.id] || ''
      lines.push(
        `| ${c.id} ${name} | ${c.role} | ${escapeMdTableCell(keyFieldsFor(c.id))} | ${escapeMdTableCell(c.outline)} |`,
      )
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

function detectWatchStreak(steps: MappedStep[]): DecisionCreate[] {
  const decisions: DecisionCreate[] = []
  // flatten mission steps in order
  const flat: Array<{ step: number; cmp: string }> = []
  for (const s of steps) {
    for (const c of s.components) {
      flat.push({ step: s.scriptStep, cmp: c.id })
    }
  }
  let streak = 0
  let streakStart = 0
  for (let i = 0; i < flat.length; i++) {
    if (WATCH_COMPONENTS.has(flat[i]!.cmp)) {
      if (streak === 0) streakStart = i
      streak++
      if (streak >= 3) {
        decisions.push({
          node: 'N2',
          targetType: 'script_step',
          targetId: String(flat[streakStart]!.step),
          type: 'choice',
          severity: 'blocking',
          question: `检测到连续 ≥3 个「观看」类 component（${flat
            .slice(streakStart, i + 1)
            .map((x) => x.cmp)
            .join(' → ')}）。如何处理？`,
          options: [
            { id: 'insert_interact', label: '插入互动组件打断连续观看', recommended: true },
            { id: 'accept', label: '例外接受（需说明）' },
          ],
          aiRationale: 'pipeline_design N1/N2：禁止连续三个及以上观看型 component',
        })
        streak = 0
      }
    } else {
      streak = 0
    }
  }
  return decisions
}

const N2_SYSTEM = `你是中文课程 Tech/Content Designer。根据 v0.2 phased script（已含建议 component），产出 v0.3 定稿映射。
要求：
1. 以建议 component 为起点，可微调但必须落在 phase 允许列表
2. 每个 script_step 用 Markdown 表格：Component | 角色 | 关键字段 | Content outline
3. 总览表在前；1 component = 1 mission step
4. 遵守 enforcement：P1 含 CMP-04；P4 含 CMP-21/26；P3 有 CMP-19 必有 CMP-18；CMP-15 仅 P2；CMP-22 仅 P4；CMP-02 不入 P1
5. 不要连续 ≥3 观看组件（CMP-03/05/09/23）
6. **Content outline 切分（硬）**：同一 script_step 挂 N>1 个 component 时，必须把该步正文按组件职责切分到各行 outline：
   - 禁止把整段 script 原样复制给每一个 component
   - 每行只写该 component 要承载的内容（视频段 / 选择题干与选项 / 跟读句 / Mission 卡等）
   - 允许少量衔接语冗余，但主体内容不得雷同
   - 例：Opening Story → CMP-03=视频故事；CMP-33=「听到几个国家？」+ A/B/C
只输出 Markdown。`

export async function runN2(input: {
  missionName: string
  phasedMd: string
}): Promise<NodeEngineResult> {
  let content: string
  let provider = 'deterministic'
  let steps: MappedStep[]
  let fallbackReason: string | undefined

  // Prefer deterministic map-from-v0.2 (stable, gold-aligned). LLM optional polish.
  const base = mapFromPhased(input.missionName, input.phasedMd)
  content = base.content
  steps = base.steps

  if (process.env.N2_USE_LLM === '1') {
    try {
      const llm = await completeMarkdown({
        system: N2_SYSTEM,
        user: `# Mission\n${input.missionName}\n\n# v0.2\n${input.phasedMd}`,
      })
      content = llm.text
      provider = llm.provider
      // if LLM unusable structure, keep deterministic
      const { parseSteppedScript } = await import('../validators/n2.js')
      const parsed = parseSteppedScript(content)
      if (parsed.length === 0) {
        content = base.content
        steps = base.steps
        fallbackReason = 'LLM v0.3 无法解析，保留从 v0.2 建议组件生成的映射'
        provider = 'deterministic'
      } else {
        steps = parsed
      }
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : String(err)
    }
  }

  const validated = validateN2(steps)
  content = renderV03(input.missionName, validated.steps)

  const decisions: DecisionCreate[] = [
    ...validated.decisions,
    ...detectWatchStreak(validated.steps),
  ]

  // Checkpoint Decision: ask CD to confirm mapping (info)
  decisions.push({
    node: 'N2',
    targetType: 'mission',
    type: 'confirm',
    severity: 'info',
    question:
      'Checkpoint：请确认每个 script_step 的 component 定稿、多挂是否合理，再 Approve。',
    options: [{ id: 'ack', label: '已核对映射', recommended: true }],
    aiRationale: 'pipeline_design N2 Checkpoint',
  })

  if (fallbackReason) {
    decisions.push({
      node: 'N2',
      targetType: 'mission',
      type: 'warning_ack',
      severity: 'info',
      question: `N2 备注：${fallbackReason.slice(0, 240)}`,
      options: [{ id: 'ack', label: '已知悉', recommended: true }],
      aiRationale: 'LLM/解析降级',
    })
  }

  return {
    content,
    decisions,
    meta: {
      provider,
      issues: validated.issues,
      missionStepCount: validated.steps.reduce(
        (n, s) => n + s.components.length,
        0,
      ),
    },
  }
}
