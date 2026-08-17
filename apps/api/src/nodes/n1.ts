import type { DecisionCreate } from '@mission-pipeline/shared'
import { completeMarkdown } from '../llm/client.js'
import {
  COMPONENT_NAMES,
  PHASE_ALLOWED,
  defaultComponentsForPhase,
  type PhaseId,
} from '../master/eligibility.js'
import { validateN1, type ScriptStep } from '../validators/n1.js'
import { hasFocusLemma } from './mcqFocus.js'

export type NodeEngineResult = {
  content: string
  decisions: DecisionCreate[]
  meta: Record<string, unknown>
}

const PHASE_TITLES: Record<PhaseId, string> = {
  P1: 'Mission Intro',
  P2: 'Knowledge Discovery',
  P3: 'Performance Mission',
  P4: 'Ending Summary',
}

const PHASE_FUNCS: Record<PhaseId, string> = {
  P1: '任务发布 + 故事沉浸 + 首次感知目标句',
  P2: '词汇/句型/对话的发现、连接、练习、模式识别',
  P3: '任务确认 + 故事回放 + 真实任务执行',
  P4: '收获展示 + 关键表达回顾 + 衔接下一课',
}

function guessPhase(index: number, title: string): PhaseId {
  const t = title.toLowerCase()
  if (
    /today you can|wo hui|takeaway|preview|ending|summary|收束|预告|key takeaway/.test(
      t,
    )
  ) {
    return 'P4'
  }
  if (/mission ready|performance|ai mission|开放任务|真实任务|wo hui moment/.test(t)) {
    return 'P3'
  }
  // Context Story late in script → P2 scaffolding (Mission 4 rule)
  if (/context story/.test(t) && index >= 9) return 'P2'
  if (
    /warm.?up|mission entry|opening story|mission setup|发布/.test(t) &&
    index <= 3
  ) {
    return 'P1'
  }
  if (/context story/.test(t) && index <= 3) return 'P1'
  if (index <= 3) return 'P1'
  if (index <= 14) return 'P2'
  if (index <= 16) return 'P3'
  return 'P4'
}

/**
 * Traditional MCQ (CMP-33) vs focus-lemma MCQ (CMP-13).
 * CMP-13 左侧有【焦点】放大框：只在正文要标出一个目标词/语素时建议 13。
 * 「老师在问什么」这类直接理解题没有焦点词 → CMP-33。
 */
function prefersTraditionalMcq(body: string): boolean {
  if (!body) return false
  const hasChoices =
    /student choices/i.test(body) ||
    /(?:^|\n)\s*[ABC][\).:\s]\s*\S+/m.test(body)
  if (!hasChoices) return false
  if (hasFocusLemma('', body)) return false
  return true
}

function formatSuggested(phase: PhaseId, name: string, body = ''): string {
  const ids = defaultComponentsForPhase(phase)
  // Mission entry style
  if (/mission entry|warm.?up/i.test(name)) {
    return 'CMP-01 (课前寒暄) + CMP-32 (学习目标) + CMP-04 (Mission 发布)'
  }
  if (/opening story/i.test(name)) {
    return 'CMP-03 (视频播放) + CMP-33 (选择题（传统版）, 长题干理解检测)'
  }
  if (
    /flag|国旗|\/ map/i.test(body) &&
    /[\u4e00-\u9fff]人/.test(body) &&
    PHASE_ALLOWED[phase].includes('CMP-10')
  ) {
    return 'CMP-10 (图文卡片)'
  }
  if (prefersTraditionalMcq(body) && PHASE_ALLOWED[phase].includes('CMP-33')) {
    const base = ids
      .filter((id) => id !== 'CMP-13' && id !== 'CMP-33')
      .slice(0, 1)
      .map((id) => `${id} (${COMPONENT_NAMES[id] || id})`)
    const legacy = 'CMP-33 (选择题（传统版）)'
    return base.length ? `${base.join(' + ')} + ${legacy}` : legacy
  }
  return ids
    .map((id) => `${id} (${COMPONENT_NAMES[id] || id})`)
    .join(' + ')
}

function extractMetaFromV01(v01: string): {
  vocab: string[]
  roles: string
} {
  const vocab: string[] = []
  const boldWords = [...v01.matchAll(/\*\*([^*（(]{1,20}?)\s*[（(]/g)]
  for (const m of boldWords.slice(0, 20)) {
    const w = m[1]!.trim()
    if (w && !/^\d/.test(w) && !vocab.includes(w)) vocab.push(w)
  }
  const roleHint = /Kai|Tom|Emma|Jayden|Anna|王老师/g.test(v01)
    ? '从原文识别到的角色（请在正式输出中写全）'
    : '待从 script 识别'
  return { vocab, roles: roleHint }
}

/** Heuristic aligned to Mission 4 baseline shape */
export function heuristicPhasedScript(
  missionName: string,
  topic: string,
  v01: string,
): string {
  const re = /\*\*(\d+)\\?\.\s*([^*]+?)\*\*/g
  const matches = [...v01.matchAll(re)]
  const chunks: Array<{ index: number; name: string; body: string }> = []

  if (matches.length === 0) {
    chunks.push({ index: 1, name: 'MISSION ENTRY', body: v01.slice(0, 4000) })
  } else {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]!
      const start = m.index! + m[0].length
      const end = i + 1 < matches.length ? matches[i + 1]!.index! : v01.length
      chunks.push({
        index: Number(m[1]),
        name: m[2]!.replace(/\\/g, '').trim(),
        body: v01.slice(start, end).trim(),
      })
    }
  }

  const { vocab } = extractMetaFromV01(v01)
  const byPhase = new Map<PhaseId, typeof chunks>()
  for (const c of chunks) {
    const phase = guessPhase(c.index, c.name)
    const list = byPhase.get(phase) || []
    list.push(c)
    byPhase.set(phase, list)
  }

  const overviewRows = (['P1', 'P2', 'P3', 'P4'] as PhaseId[]).map((p) => {
    const list = byPhase.get(p) || []
    const range =
      list.length === 0
        ? '—'
        : list.length === 1
          ? `script_step ${list[0]!.index}`
          : `script_step ${list[0]!.index}–${list[list.length - 1]!.index}`
    return `| **${p} - ${PHASE_TITLES[p]}** | ${range} | ${PHASE_FUNCS[p]} | ${list.length} |`
  })

  const lines: string[] = [
    `# ${missionName} (v0.2 Phased Script)`,
    ``,
    `> **版本**: v0.2 (叠加 Phase 框架)`,
    `> **来源**: 口语化 v0.1 script`,
    `> **变更**: 加 phase 切分 + script_step purpose + 建议 component + phase 边界标注`,
    `> **配套**: master/phase_component_eligibility + component_catalog`,
    `> **生成**: heuristic fallback`,
    ``,
    `---`,
    ``,
    `## 元信息`,
    ``,
    `- **Mission 标题**: ${missionName}`,
    `- **主题**: ${topic}`,
    `- **教学对象**: 中文初学者`,
    `- **核心词汇**: ${vocab.length ? vocab.join(' / ') : '（请从原文顶部词汇区补全）'}`,
    `- **核心句型**:`,
    `  - （请从原文提炼 2–4 条目标句）`,
    `- **角色**: （请从原文识别主持人/配角）`,
    ``,
    `---`,
    ``,
    `## Phase 框架总览`,
    ``,
    `| Phase | script_step 范围 | 教学功能 | script_step 数 |`,
    `|---|---|---|---|`,
    ...overviewRows,
    ``,
    `---`,
    ``,
    `## 词汇清单（来自原 script）`,
    ``,
    ...(vocab.length
      ? vocab.map((v) => `- **${v}**`)
      : ['- （未自动识别，请手补）']),
    ``,
    `---`,
    ``,
  ]

  let lastPhase: PhaseId | '' = ''
  for (const c of chunks) {
    const phase = guessPhase(c.index, c.name)
    if (phase !== lastPhase) {
      const list = byPhase.get(phase) || []
      lines.push(`# Phase ${phase.slice(1)} — ${PHASE_TITLES[phase]}`)
      lines.push('')
      lines.push(`> **教学功能**: ${PHASE_FUNCS[phase]}`)
      lines.push(`> **script_step 数量**: ${list.length}`)
      lines.push('')
      lines.push(`---`)
      lines.push('')
      lastPhase = phase
    }
    lines.push(`## script_step ${c.index}. ${c.name}`)
    lines.push('')
    lines.push(`> **教学目的**: 完成「${c.name}」相关教学目标`)
    lines.push(`> **建议 component**: ${formatSuggested(phase, c.name, c.body)}`)
    lines.push('')
    lines.push(c.body)
    lines.push('')
    lines.push(`---`)
    lines.push('')
  }

  return lines.join('\n')
}

function eligibilityBlock(): string {
  return (['P1', 'P2', 'P3', 'P4'] as PhaseId[])
    .map((p) => {
      const items = PHASE_ALLOWED[p]
        .map((id) => `${id}${COMPONENT_NAMES[id] ? `(${COMPONENT_NAMES[id]})` : ''}`)
        .join(', ')
      return `- ${p}: ${items}`
    })
    .join('\n')
}

/**
 * Gold format = missions/mission_4/v0.2_script_phased.md
 */
const N1_SYSTEM = `你是资深中文教学课程设计师（Content Designer）。
你的任务：把口语化 v0.1 script 改写成 **v0.2 phased script**。
输出必须对齐仓库打样文件 missions/mission_4/v0.2_script_phased.md 的结构与写法。

# 必须包含的结构（缺一不可）

1. 标题行：\`# {Mission名} (v0.2 Phased Script)\`
2. 版本说明引用块（版本/来源/变更/配套）
3. \`## 元信息\`：Mission 标题、教学对象、**核心词汇**、**核心句型**（列表）、**角色**
4. \`## Phase 框架总览\`：Markdown 表格（Phase | script_step 范围 | 教学功能 | script_step 数）
5. \`## 词汇清单\`：从原文顶部词汇区整理（中文 + 英文释义若有）
6. 四个 Phase，标题用一级标题：\`# Phase 1 — Mission Intro\` … \`# Phase 4 — Ending Summary\`
   - 每个 Phase 开头用引用块写「教学功能」「script_step 数量」
7. 每个步骤用二级标题：\`## script_step N. TITLE\`
   - 紧跟引用块两行（可加备注）：
     - \`> **教学目的**: …\`（一句话，中文）
     - \`> **建议 component**: CMP-XX (中文名) + …\`（必须有，且落在该 Phase 允许列表）
   - **然后原样保留该步口语化正文**（对话、Screen、Video 提示等）。不要把正文每行都改成 \`>\` 引用；不要翻译；不要大幅删减。

# Phase 判定规则
- P1: Warm Up / Opening Story / 首次 Context Story / Mission Setup
- P2: Connect / Discovery / Practice / Pattern / Use Before Memory；**后续 Context Story（如 step 9）归 P2 脚手架，不归 P1**
- P3: Mission Ready / Wo Hui 故事回放 / 真实任务执行
- P4: Today You Can / Wo Hui 收束 / Key Takeaways / 下集预告
- 原 script 缺号（如 14）要保留空位并注明

# 建议 component 约束（硬）
只能从下列 Phase 允许列表选择：
${eligibilityBlock()}
- P1 建议里通常应出现 CMP-04（Mission 发布）
- P4 建议里通常应出现 CMP-21 或 CMP-26
- 不要连续三个及以上“纯观看”组件（如连续 CMP-03/05/09）

# 选择题选型（硬，按正文交互信号，不要只看 step 标题 / 题干长短）
- 正文出现 \`Student choices\` / \`A B C\` 等选项时，**必须**挂选择类 component，禁止只用 CMP-03/09 观看组件
- **CMP-33**（选择题传统版）：直接理解题，题干里**没有**要单独放大的知识点。例："What is the teacher trying to find out?" / "How many countries did you hear?"
- **CMP-13**（单项选择）：左侧有【焦点】放大框。题干里有要标识的知识点（**新知或旧知**），选项对着该点的含义/功能。例：Highlight 人 / "What do you think 人 is doing here?" / "What do you think 朋友 means?" / Kai asks「你叫什么名字？」选 Name。单元意图写「发现规律」但活动已是单选，仍用 13，不要改成 CMP-11
- **CMP-07**（句型学习）：锚点已有观察结果时用。左侧挂例句，右侧挂公式（如 Country + 人 / 中国 + 人 → 中国人）。不要用只有例句槽的 CMP-11
- **CMP-11**（句型观察）：只有例句、先让学生自己发现，还没写出公式
- **CMP-10**（图文卡片）：一张图表意、汉字标出一个知识点。例：Screen shows UK flag + 「英国人」。不要只用 CMP-09（全屏大图没有汉字槽）
- **CMP-09**（全屏大图）：纯场景视觉，不承载要学的那个词
- Opening Story（视频 + 片后理解检测）标准建议：\`CMP-03 + CMP-33\`，不要写成 CMP-03 + CMP-09

# 示例（结构示意，内容请按真实 v0.1 生成）

\`\`\`markdown
# Mission X — Title (v0.2 Phased Script)

> **版本**: v0.2 (叠加 Phase 框架)
> **来源**: 口语化 v0.1 script
> **变更**: 加 phase 切分 + script_step purpose + 建议 component
> **配套**: master/phase_component_eligibility

---

## 元信息

- **Mission 标题**: …
- **教学对象**: 中文初学者
- **核心词汇**: …
- **核心句型**:
  - …
- **角色**: Kai / …

---

## Phase 框架总览

| Phase | script_step 范围 | 教学功能 | script_step 数 |
|---|---|---|---|
| **P1 - Mission Intro** | script_step 1, 2, 3 | 任务发布 + 故事沉浸 | 3 |
| **P2 - Knowledge Discovery** | script_step 4–13 | 发现/练习 | 10 |
| **P3 - Performance Mission** | script_step 15–17 | 真实任务 | 3 |
| **P4 - Ending Summary** | script_step 17 末 | 收束 | 1 |

---

# Phase 1 — Mission Intro

> **教学功能**: …
> **script_step 数量**: 3

---

## script_step 1. MISSION ENTRY — Warm Up

> **教学目的**: 建立关系、激活注意、明确任务
> **建议 component**: CMP-01 (课前寒暄) + CMP-32 (学习目标) + CMP-04 (Mission 发布)

**Kai:**
Welcome back.
…
\`\`\`

只输出最终 Markdown，不要解释。`

export async function runN1(input: {
  missionName: string
  topic: string
  scriptMd: string
}): Promise<NodeEngineResult> {
  let content: string
  let provider: string = 'heuristic'
  let fallbackReason: string | undefined

  try {
    const llm = await completeMarkdown({
      system: N1_SYSTEM,
      user: [
        `# Mission`,
        `名称: ${input.missionName}`,
        `主题: ${input.topic}`,
        ``,
        `# 打样参考说明`,
        `请严格模仿 missions/mission_4/v0.2_script_phased.md 的信息密度与字段：元信息、Phase 总览表、每步教学目的+建议 component、原文保留。`,
        ``,
        `# v0.1 口语化原文`,
        input.scriptMd,
      ].join('\n'),
      temperature: 0.3,
    })
    content = llm.text
    provider = llm.provider
  } catch (err) {
    fallbackReason = err instanceof Error ? err.message : String(err)
    content = heuristicPhasedScript(
      input.missionName,
      input.topic,
      input.scriptMd,
    )
    provider = 'heuristic'
  }

  const validated = validateN1(content)
  if (fallbackReason) {
    validated.decisions.push({
      node: 'N1',
      targetType: 'mission',
      type: 'warning_ack',
      severity: 'info',
      question: `LLM 调用失败，已用 heuristic（已尽量对齐基线结构）。原因：${fallbackReason.slice(0, 240)}`,
      options: [{ id: 'ack', label: '已知悉', recommended: true }],
      aiRationale: '降级保证流水线可继续',
    })
  }

  return {
    content,
    decisions: validated.decisions,
    meta: {
      provider,
      issues: validated.issues,
      fallbackReason,
      stepCount: validated.steps.length,
    },
  }
}
