/**
 * Display Text fill: component-type aware extraction.
 *
 * Sources of truth (in order):
 * 1. Catalog E 模版结构（行序 / 槽位）
 * 2. Catalog F 示例 + M 设计规范 → chrome 与槽位语义（UI 约定）
 * 3. content outline → 可变内容（题干/选项/目标…）；不足则 [待补]，不编造
 * 4. 组件族专属解析（选择题 / 学习目标 / 叠字…）再自检合理性
 */

import {
  getCatalogComponent,
  type CatalogComponent,
} from './catalog.js'

export type FillDisplayTextContext = {
  topic?: string
  missionName?: string
  missionGoals?: string[]
}

export type ParsedChoice = {
  badge: string
  question: string
  options: Partial<Record<'A' | 'B' | 'C' | 'D', string>>
  answer: string
  focus?: string
}

export type ComponentFamily =
  | 'none'
  | 'learning-goals'
  | 'mission-card'
  | 'single-choice'
  | 'self-assess'
  | 'video-overlay'
  | 'listen-repeat'
  | 'pattern-examples'
  | 'pattern-formula'
  | 'roleplay'
  | 'sentence-build'
  | 'vocab-card'
  | 'takeaways'
  | 'generic'

/** Labels that may repeat N times from outline (aligned with E/F). */
const EXPANDABLE = new Set([
  '【目标】',
  '【例句】',
  '【词条】',
  '【选项】',
  '【句】',
  '【词】',
  '【叠字】',
  '【参考答案】',
  '【词卡】',
])

export function resolveComponentFamily(
  cmp: string,
  techClass = '',
  template = '',
): ComponentFamily {
  const id = cmp.toUpperCase()
  const t = (template || '').trim()
  // Only treat as none when template is explicitly 无 (callers may omit template)
  if (t === '无') return 'none'
  if (id === 'CMP-32' || /learning-goals/i.test(techClass)) return 'learning-goals'
  if (id === 'CMP-04' || id === 'CMP-18') return 'mission-card'
  if (id === 'CMP-28') return 'self-assess'
  if (
    /^(CMP-02|CMP-13|CMP-25|CMP-33|CMP-37)$/.test(id) ||
    /single-choice/i.test(techClass)
  ) {
    return 'single-choice'
  }
  if (id === 'CMP-05' || /video-text|overlay/i.test(techClass)) return 'video-overlay'
  if (id === 'CMP-08' || id === 'CMP-35' || /listen|repeat|跟读|pronunciation/i.test(techClass)) {
    return 'listen-repeat'
  }
  if (id === 'CMP-07') {
    return 'pattern-formula'
  }
  if (id === 'CMP-11' || /pattern/i.test(techClass)) {
    return 'pattern-examples'
  }
  if (id === 'CMP-15' || /situational|role.?play|dialogue/i.test(techClass)) {
    return 'roleplay'
  }
  if (
    /^(CMP-12|CMP-14|CMP-17|CMP-30|CMP-34)$/.test(id) ||
    /sentence|slot-builder|construction/i.test(techClass)
  ) {
    return 'sentence-build'
  }
  if (
    /^(CMP-10|CMP-27|CMP-29)$/.test(id) ||
    /vocab|flashcard|word-card/i.test(techClass)
  ) {
    return 'vocab-card'
  }
  if (id === 'CMP-21' || id === 'CMP-26') return 'takeaways'
  if (!t) return 'generic'
  return 'generic'
}

type Analyzed = {
  family: ComponentFamily
  goals: string[]
  choice: ParsedChoice | null
  selfOptions: string[]
  overlays: Array<{ zh: string; pinyin: string }>
  examples: string[]
  sentences: string[]
  hanzi: string
  pinyin: string
  en: string
  focus: string
  blocks: string
  answerText: string
  title: string
  button: string
  topic: string
  designRule: string
  /** CMP-07 left-column example lines */
  formulaLeft: string[]
  /** CMP-07 right-column formula */
  formulaRight: string
  formulaSymbol: string
  highlight: string
  /** CMP-15 scene + dialogue turns */
  scene: string
  dialogue: Array<{ role: string; text: string }>
}

/**
 * Fill catalog E-column template using component family analysis + F example chrome.
 */
export function fillDisplayTextTemplate(
  cmp: string,
  outline: string,
  purpose: string,
  ctx: FillDisplayTextContext = {},
): string {
  const row = getCatalogComponent(cmp)
  const template = (row?.template || '').trim()
  if (!template || template === '无') return 'NA'

  const family = resolveComponentFamily(cmp, row?.techClass || '', template)
  const analyzed = analyzeOutline(family, cmp, outline, purpose, ctx, row)
  const example = (row?.example || '').trim()
  const exampleByLabel = indexExampleByLabel(example)

  // CMP-15: emit scene + dialogue turns (template NPC name is dynamic)
  if (family === 'roleplay' && analyzed.dialogue.length) {
    const lines = [
      formatLabeledLine('[场景]', analyzed.scene || 'Role play'),
      formatLabeledLine(
        '[顶标]',
        firstExample(exampleByLabel, '[顶标]') || 'Role Play',
      ),
      ...analyzed.dialogue.map((d) =>
        formatLabeledLine(`【${d.role}】`, d.text),
      ),
    ]
    return sanitizeDisplayText(cmp, family, lines.join('\n'), analyzed, row)
  }

  // CMP-07: left examples + right formula (skip bare {例句N} placeholders)
  if (family === 'pattern-formula') {
    const left =
      analyzed.formulaLeft.length > 0
        ? analyzed.formulaLeft
        : analyzed.examples.slice(0, 3)
    const lines = [
      formatLabeledLine(
        '[顶标]',
        firstExample(exampleByLabel, '[顶标]') || 'Pattern',
      ),
      formatLabeledLine(
        '【左侧】',
        left[0] || '[待补: 例句]',
      ),
      ...left.slice(1).map((ex) => ex),
      formatLabeledLine(
        '【右侧】',
        analyzed.formulaRight || '[待补: 公式]',
      ),
      formatLabeledLine(
        '【符号】',
        analyzed.formulaSymbol || '+',
      ),
      formatLabeledLine(
        '【高亮】',
        analyzed.highlight || '[待补: 高亮字]',
      ),
    ]
    return sanitizeDisplayText(cmp, family, lines.join('\n'), analyzed, row)
  }

  const templateLines = template.split(/\n/).filter((l) => l.trim().length > 0)
  const out: string[] = []
  const expandedDone = new Set<string>()

  let pendingPinyinForOverlay = false

  for (const line of templateLines) {
    const parsed = parseTemplateLine(line)
    if (!parsed) {
      out.push(line)
      continue
    }

    const { label, slot, required, prefix } = parsed

    // Bare {拼音} line under 叠字
    if (!label && /拼音/.test(slot) && pendingPinyinForOverlay) {
      const ov = analyzed.overlays[expandedDone.has('__ov_idx') ? 0 : 0]
      void ov
      pendingPinyinForOverlay = false
      // index tracked via expanded count of 叠字
      const idx =
        out.filter((l) => l.startsWith('【叠字】')).length - 1
      const pinyin = analyzed.overlays[idx]?.pinyin || 'NA'
      out.push(pinyin)
      continue
    }

    if (EXPANDABLE.has(label) && !expandedDone.has(label)) {
      const list = expandableValues(label, analyzed, exampleByLabel, required)
      if (label === '【叠字】') {
        for (const ov of analyzed.overlays.length
          ? analyzed.overlays
          : list.map((zh) => ({ zh, pinyin: 'NA' }))) {
          out.push(formatLabeledLine('【叠字】', ov.zh || '[待补: 汉字]'))
          out.push(ov.pinyin || 'NA')
        }
        expandedDone.add(label)
        pendingPinyinForOverlay = false
        continue
      }
      for (const v of list) out.push(formatLabeledLine(label, v))
      expandedDone.add(label)
      continue
    }
    if (EXPANDABLE.has(label) && expandedDone.has(label)) continue

    // Skip bare pinyin template lines when we already emitted overlay pairs
    if (!label && /拼音\d*/.test(slot) && expandedDone.has('【叠字】')) continue

    const value = resolveSlotValue({
      cmp,
      label,
      slot,
      required,
      outline,
      analyzed,
      exampleByLabel,
    })
    out.push(formatLabeledLine(prefix, value))
  }

  return sanitizeDisplayText(cmp, family, out.join('\n'), analyzed, row)
}

function expandableValues(
  label: string,
  a: Analyzed,
  exampleByLabel: Map<string, string[]>,
  required: boolean,
): string[] {
  if (label === '【目标】') {
    return a.goals.length
      ? a.goals
      : exampleByLabel.get(label)?.length
        ? [] // don't copy example goals as content
        : required
          ? ['[待补: 目标]']
          : ['NA']
  }
  if (label === '【选项】') {
    return a.selfOptions.length
      ? a.selfOptions
      : exampleByLabel.get(label) || ['[待补: 选项]']
  }
  if (label === '【例句】') {
    return a.examples.length
      ? a.examples
      : ['[待补: 例句]']
  }
  if (label === '【句】' || label === '【词】') {
    return a.sentences.length ? a.sentences : ['[待补: 条目]']
  }
  if (label === '【叠字】') {
    return a.overlays.map((o) => o.zh)
  }
  if (label === '【词条】' || label === '【词卡】' || label === '【参考答案】') {
    const fromEx = exampleByLabel.get(label) || []
    return a.sentences.length ? a.sentences : fromEx.length ? fromEx.slice(0, 1).map(() => '[待补]') : ['[待补]']
  }
  return ['[待补]']
}

function analyzeOutline(
  family: ComponentFamily,
  cmp: string,
  outline: string,
  purpose: string,
  ctx: FillDisplayTextContext,
  row?: CatalogComponent,
): Analyzed {
  const topic = resolveTopic(outline, purpose, ctx)
  const title = extractMissionTitle(outline, topic, ctx)
  const goals = mergeGoals(extractGoals(outline), ctx.missionGoals)
  const base: Analyzed = {
    family,
    goals,
    choice: null,
    selfOptions: [],
    overlays: [],
    examples: [],
    sentences: [],
    hanzi: '',
    pinyin: '',
    en: '',
    focus: '',
    blocks: '',
    answerText: '',
    title,
    button: extractStartButton(outline) || '',
    topic,
    designRule: row?.designRule || '',
    formulaLeft: [],
    formulaRight: '',
    formulaSymbol: '+',
    highlight: '',
    scene: '',
    dialogue: [],
  }

  if (family === 'single-choice') {
    base.choice = parseSingleChoice(outline, cmp)
    // CMP-13 focus word from outline / 焦点 / blank stem (他是___？ → 他)
    const focus =
      /【焦点】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      /焦点[：:]\s*([^\n]+)/.exec(outline)?.[1]?.trim() ||
      /Highlight\s*\**:?\**\s*([^\n*]+)/i.exec(outline)?.[1]?.trim() ||
      /Screen[^\n]{0,12}:\s*\**\s*([\u4e00-\u9fff])是_{2,}/i.exec(outline)?.[1]
        ?.trim() ||
      /([\u4e00-\u9fff])是_{2,}[？?]?/.exec(outline)?.[1]?.trim() ||
      ''
    if (focus) {
      // Keep lemma only (drop accidental pinyin / junk after first token)
      base.focus = focus.replace(/\*+/g, '').split(/\s+/)[0]!.trim()
      base.choice.focus = base.focus
    }
    // Badge from F for conversation choice vs quiz
    if (cmp.toUpperCase() === 'CMP-02') {
      base.choice.badge = 'Activity'
    } else if (cmp.toUpperCase() === 'CMP-13') {
      base.choice.badge = 'Meaning'
    } else {
      base.choice.badge = 'Quiz'
    }
  }

  if (family === 'self-assess') {
    base.selfOptions = extractSelfOptions(outline)
    if (!base.selfOptions.length) {
      base.selfOptions = ['Confident', 'Better', 'I need more practice']
    }
  }

  if (family === 'video-overlay') {
    base.overlays = extractOverlays(outline)
  }

  if (family === 'listen-repeat' || family === 'vocab-card') {
    const triple = extractVocabTriple(outline)
    const stu = extractStudentZhLine(outline)
    const hz =
      /【汉字】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      triple?.zh ||
      stu ||
      extractFirstZhPhrase(outline)
    const py =
      /【拼音】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      triple?.pinyin ||
      ''
    const en =
      /\[英文\]\s*([^\n]+)/.exec(outline)?.[1]?.trim() ||
      /英文[：:]\s*([^\n]+)/.exec(outline)?.[1]?.trim() ||
      triple?.en ||
      extractEnglishGloss(outline) ||
      ''
    base.hanzi = hz || ''
    base.pinyin = py && /[a-zāáǎà]/i.test(py) ? py : ''
    base.en = en
    // CMP-08 重读: first hanzi + first pinyin syllable
    if (cmp.toUpperCase() === 'CMP-08' && base.hanzi && base.pinyin) {
      const firstPy = base.pinyin.trim().split(/\s+/)[0] || ''
      const firstHz = [...base.hanzi][0] || ''
      if (firstHz && firstPy) base.focus = `${firstHz} ${firstPy}`
    }
  }

  if (family === 'pattern-formula') {
    const formula = extractPatternFormula(outline)
    base.formulaLeft = formula.left
    base.formulaRight = formula.right
    base.formulaSymbol = formula.symbol
    base.highlight = formula.highlight
    base.examples = formula.left
  }

  if (family === 'roleplay') {
    const rp = extractRoleplayBundle(outline)
    base.scene = rp.scene
    base.dialogue = rp.dialogue
  }

  if (family === 'pattern-examples') {
    base.examples = extractZhExamples(outline)
  }

  if (family === 'sentence-build') {
    base.blocks =
      /【字块】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      extractBlocks(outline)
    base.answerText =
      /【答案】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      extractSentenceBuildAnswer(outline)
    // Prompt: explicit 题目, else Kai lead-in / Screen cue, else leave for F chrome
    base.focus =
      /【题目】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      extractSentenceBuildPrompt(outline)
  }

  if (family === 'takeaways') {
    base.sentences = extractZhExamples(outline)
  }

  if (family === 'mission-card' && !base.button) {
    base.button = 'START MISSION'
  }

  return base
}

function resolveSlotValue(args: {
  cmp: string
  label: string
  slot: string
  required: boolean
  outline: string
  analyzed: Analyzed
  exampleByLabel: Map<string, string[]>
}): string {
  const { label, slot, required, outline, analyzed, exampleByLabel } = args
  const a = analyzed
  const blob = `${label} ${slot}`

  // —— Family: single-choice ——
  if (a.choice) {
    if (/焦点/.test(blob)) {
      return a.focus || a.choice.focus || (required ? `[待补: 焦点词]` : 'NA')
    }
    if (/顶标|顶栏|badge/.test(blob)) {
      return (
        firstExample(exampleByLabel, label) ||
        a.choice.badge ||
        'Quiz'
      )
    }
    if (/题目|题干|question/i.test(blob)) {
      return a.choice.question || (required ? `[待补: 题干]` : 'NA')
    }
    const optLetter =
      /^【\s*([ABCD])\s*】$/i.exec(label)?.[1] ||
      /^选项\s*([ABCD])$/i.exec(slot)?.[1] ||
      /^([ABCD])$/i.exec(slot)?.[1]
    if (optLetter) {
      const L = optLetter.toUpperCase() as 'A' | 'B' | 'C' | 'D'
      const val = a.choice.options[L]
      // Reasonableness: option should be short content, not narrative dump
      if (val && isReasonableOption(val)) return val
      return 'NA'
    }
    if (
      /答案/.test(label) ||
      /答案|answer/i.test(slot) ||
      /^A\s*\|\s*B\s*\|\s*C/i.test(slot)
    ) {
      if (a.choice.answer && /^[ABCD]$/.test(a.choice.answer)) {
        return a.choice.answer
      }
      return required ? `[待补: A|B|C|D]` : 'NA'
    }
  }

  // —— Chrome from F / product UI conventions ——
  if (/页眉/.test(blob)) {
    return (
      firstExample(exampleByLabel, label) ||
      'Welcome to your Chinese lesson!'
    )
  }
  if (/卡片标题/.test(blob)) {
    const ex = firstExample(exampleByLabel, label)
    if (ex && /goals/i.test(ex)) return 'Mission goals'
    return 'Mission goals'
  }
  if (/副标题/.test(blob)) {
    return `Today's topic: ${a.topic}`
  }
  if (/开始按钮|按钮文案/.test(blob)) {
    return (
      firstExample(exampleByLabel, label) ||
      a.button ||
      "Let's go"
    )
  }
  if (/顶标|顶栏|badge/.test(blob)) {
    if (a.family === 'pattern-examples' || a.family === 'pattern-formula') {
      return 'Pattern'
    }
    if (a.family === 'listen-repeat' && /CMP-35/i.test(args.cmp)) {
      return firstExample(exampleByLabel, label) || 'Pronunciation practice'
    }
    if (a.family === 'roleplay') return 'Role Play'
    if (a.choice?.badge) return a.choice.badge
    return firstExample(exampleByLabel, label) || 'Quiz'
  }

  if (/场景/.test(blob) && a.scene) return a.scene

  if (/左侧|例句/.test(blob) && a.family === 'pattern-formula') {
    return a.formulaLeft[0] || a.examples[0] || (required ? '[待补: 例句]' : 'NA')
  }
  if (/右侧|公式/.test(blob) && a.family === 'pattern-formula') {
    return a.formulaRight || (required ? '[待补: 公式]' : 'NA')
  }
  if (/符号/.test(blob) && a.family === 'pattern-formula') {
    return a.formulaSymbol || '+'
  }
  if (/高亮/.test(blob)) {
    return (
      a.highlight ||
      a.focus ||
      (required ? '[待补: 高亮字]' : 'NA')
    )
  }
  if (/重读/.test(blob) && a.focus) return a.focus

  if (/任务标题/.test(blob) || (/标题/.test(slot) && a.family === 'mission-card')) {
    return a.title || (required ? `[待补: 标题]` : 'NA')
  }
  if (/^\[标题\]|标题/.test(label) && a.family === 'takeaways') {
    return firstExample(exampleByLabel, label) || 'Key Takeaways'
  }

  if (/汉字/.test(blob) && a.hanzi) return a.hanzi
  if (/拼音/.test(blob) && a.pinyin) return a.pinyin
  if (/英文|english/i.test(blob) && a.en) return a.en
  if (/字块/.test(blob) && a.blocks) return a.blocks
  if (/答案/.test(label) && a.answerText && !/A\|B\|C/i.test(slot)) {
    return a.answerText
  }
  if (/题目|题干/.test(blob) && a.family === 'sentence-build') {
    return (
      a.focus ||
      firstExample(exampleByLabel, label) ||
      (required ? `[待补: 题干]` : 'NA')
    )
  }
  if (/题目|题干|自评/.test(blob) && a.family === 'self-assess') {
    return (
      /【题目】\s*([^\n【]+)/.exec(outline)?.[1]?.trim() ||
      firstExample(exampleByLabel, label) ||
      'How do you feel?'
    )
  }

  const fromOutline = extractSlotFromHint(outline, slot, label)
  if (fromOutline && !looksLikeMetaDump(fromOutline)) return fromOutline

  const exVal = firstExample(exampleByLabel, label)
  if (exVal && isChromeSlot(slot, label)) return exVal
  // Do NOT copy F example content into required pedagogical slots (would be fabricating)
  if (required) return `[待补: ${slot || label.replace(/[【】\[\]]/g, '')}]`
  if (exVal && !required) return exVal
  return 'NA'
}

/** Post-fill checks against family / F / design rules. */
function sanitizeDisplayText(
  cmp: string,
  family: ComponentFamily,
  text: string,
  a: Analyzed,
  row?: CatalogComponent,
): string {
  let lines = text.split('\n')

  // Strip option lines that still look like narrative dumps
  lines = lines.map((line) => {
    const m = /^(【[ABCD]】)\s*(.*)$/.exec(line)
    if (m && m[2] && !isReasonableOption(m[2])) {
      return `${m[1]} NA`
    }
    // Question must not contain Student choices blob
    if (/^【题目】/.test(line) && /Student choices/i.test(line)) {
      const q = a.choice?.question
      return q ? `【题目】 ${q}` : line.replace(/\s*Student choices.*/i, '').trim()
    }
    return line
  })

  // Single-choice: answer must be one letter if present
  if (family === 'single-choice') {
    lines = lines.map((line) => {
      if (!/^【答案】/.test(line)) return line
      const letter = /【答案】\s*([ABCD])\b/i.exec(line)?.[1]
      if (letter) return `【答案】 ${letter.toUpperCase()}`
      if (a.choice?.answer) return `【答案】 ${a.choice.answer}`
      return '【答案】 [待补: A|B|C|D]'
    })
  }

  // CMP-33 may have D in template but only A–C in source — keep NA (structure)
  void cmp
  void row
  void a.designRule

  return lines.join('\n').trim()
}

function isReasonableOption(val: string): boolean {
  const t = val.trim()
  if (!t || t === 'NA') return false
  if (/Student\s+(choices?|chooses?|selects?)|Keep the story|\*\*Kai/i.test(t)) {
    return false
  }
  if (t.length > 60) return false
  // Reject mid-word slices like "ny countries…"
  if (/^[a-z]{1,3}\s/.test(t) && t.length > 15) return false
  return true
}

function looksLikeMetaDump(s: string): boolean {
  return /Student choices|视频播放|课前寒暄|学习目标:|选择题（/i.test(s) && s.length > 40
}

function cleanChoiceOption(val: string): string {
  return (val || '')
    .replace(/\s+/g, ' ')
    .replace(
      /\s*(Student\s+(?:chooses?|selects?).*|Where is Tom.*|Kai:.*|Exactly\b.*)$/i,
      '',
    )
    .trim()
    .slice(0, 80)
}

export function parseSingleChoice(outline: string, cmp = ''): ParsedChoice {
  const raw = (outline || '').replace(/\r/g, ' ').replace(/\*\*/g, '')
  const text = raw.replace(/\s+/g, ' ').trim()
  const options: ParsedChoice['options'] = {}

  const stopAhead =
    '(?:\\s*(?:[-•*]?\\s*)[ABCD]\\s*[.、:：)]|\\n\\n|Kai:|Where is|Student\\s+(?:chooses?|selects?)|Exactly|【|$)'

  const structured = [
    ...raw.matchAll(
      new RegExp(
        `(?:^|[\\n\\s])(?:[-•*]?\\s*)([ABCD])\\s*[.、:：)]\\s*([^\\n|]+?)(?=${stopAhead})`,
        'gi',
      ),
    ),
  ]
  for (const m of structured) {
    const letter = m[1]!.toUpperCase() as 'A' | 'B' | 'C' | 'D'
    const val = cleanChoiceOption(m[2] || '')
    if (val && isReasonableOption(val) && !options[letter]) options[letter] = val
  }

  {
    const inline = [
      ...text.matchAll(
        /\b([ABCD])\s*[.、:：)]\s*([^|]+?)(?=\s+[ABCD]\s*[.、:：)]|\s+Student\s+(?:chooses?|selects?)|$)/gi,
      ),
    ]
    for (const m of inline) {
      const letter = m[1]!.toUpperCase() as 'A' | 'B' | 'C' | 'D'
      const val = cleanChoiceOption(m[2] || '')
      if (val && isReasonableOption(val) && !options[letter]) options[letter] = val
    }
  }

  if (Object.keys(options).length < 2) {
    const compactZone =
      /(?:Student\s*choices?|Choices)\s*:?\s*([\s\S]{0,200}?)(?=Where is|Kai:|Keep the|We'll come|Student\s+(?:chooses?|selects?)|$)/i.exec(
        raw,
      )?.[1] || ''
    const zone = compactZone || text
    const compact = [
      ...zone.matchAll(/\b([ABCD])\s*[.、:：)]?\s+(\S+?)(?=\s+[ABCD]\b|\s*$)/gi),
    ]
    for (const m of compact) {
      const letter = m[1]!.toUpperCase() as 'A' | 'B' | 'C' | 'D'
      const val = cleanChoiceOption(m[2] || '')
      if (
        val &&
        !options[letter] &&
        !/^(Student|choices|Where|Kai|Keep)$/i.test(val) &&
        isReasonableOption(val)
      ) {
        options[letter] = val
      }
    }
  }

  let question = ''
  const qMarked = /【题目】\s*([^\n【]+)/.exec(raw)
  if (qMarked) question = qMarked[1]!.replace(/\s+/g, ' ').trim()

  // Prefer fill-in Screen prompts like 他是___？ (closer to the choice)
  if (!question) {
    const screens = [
      ...raw.matchAll(/Screen\s*:?\s*([^\n*]{1,40})/gi),
    ].map((m) => m[1]!.replace(/\*+/g, '').trim())
    const blank = [...screens].reverse().find((s) => /_{2,}|…|\?\s*$|？\s*$/.test(s))
    if (blank) question = blank.replace(/\s+/g, ' ').trim()
  }

  // Explicit English interrogative from Kai (short) — prefer over Screen dumps
  if (!question) {
    const kaiQ =
      /Kai\s*:\s*((?:What|How|Which|Where|Who|Why|But what)[^?？]{3,80}[?？])/i.exec(
        text,
      )
    if (kaiQ?.[1]) question = kaiQ[1].replace(/\s+/g, ' ').trim()
  }

  // Also: "What do you think X is doing?" may follow "Something changed." without Kai: on same segment
  if (!question) {
    const thinkQ =
      /((?:What|How) do you think[^?？]{2,60}[?？])/i.exec(text)
    if (thinkQ?.[1]) question = thinkQ[1].replace(/\s+/g, ' ').trim()
  }

  if (!question) {
    // Avoid matching 他 inside activity titles like 迁移：用他/她问国籍: …
    const stripped = text
      .replace(/^[^:]{1,40}[：:]\s*/, '')
      .replace(/^Screen\s*:?\s*/i, '')
    const qAsk =
      /((?:How many|What is|Which|Where|Who|Is |Are |Do |Does |你是|她是|他是|这)[^?？]{1,80}[?？])/i.exec(
        stripped,
      )
    if (qAsk?.[1]) question = qAsk[1].replace(/\s+/g, ' ').trim()
  }

  if (!question) {
    const before =
      /^(?:选择题[^:]*:\s*)?(.+?)(?:\s*(?:Student\s*choices?|Choices)\s*:|\s+\bA\s*[.、:：)]\s*\S)/i.exec(
        text,
      )
    if (before?.[1]) {
      question = before[1]
        .replace(/^[^:]{1,40}[：:]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100)
    }
  }

  question = question
    .replace(/\s*(?:Student\s*choices?|Choices)\s*:.*$/i, '')
    .replace(/\s+A\s+\d+\s+B\s+.*$/i, '')
    .replace(/^Screen\s*:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    question &&
    !/[?？]$/.test(question) &&
    !/_{2,}/.test(question) &&
    /^(How|What|Which|Where|Who|Is|Are|Do|Does|你|她|他)/i.test(question)
  ) {
    question = `${question}?`
  }

  let answer = ''
  const ans =
    /Student\s+chooses?\s*([ABCD])\b/i.exec(raw) ||
    /Student\s+selects?\s*([ABCD])\b/i.exec(raw) ||
    /【答案】\s*([ABCD])\b/i.exec(raw) ||
    /答(?:案)?\s*[：:=]?\s*([ABCD])\b/i.exec(raw) ||
    /正确答案\s*[：:=]?\s*([ABCD])\b/i.exec(raw) ||
    /answer\s*[：:=]?\s*([ABCD])\b/i.exec(raw) ||
    /correct\s*(?:option|answer)?\s*[：:=]?\s*([ABCD])\b/i.exec(raw)
  if (ans?.[1]) answer = ans[1]!.toUpperCase()

  // "Student selects: 他是哪国人？" → map text to option letter
  if (!answer) {
    const selectedText =
      /Student\s+selects?\s*:?\s*([^\n*]+?)(?=\s+\*\*?\s*Kai|\s+Kai\s*:|\s+Exactly|$)/i.exec(
        raw,
      )?.[1]
        ?.replace(/\*+/g, '')
        .trim()
    if (selectedText) {
      const norm = selectedText.replace(/[。.\s]/g, '')
      for (const L of ['A', 'B', 'C', 'D'] as const) {
        const opt = options[L]?.replace(/[。.\s]/g, '') || ''
        if (opt && (opt === norm || norm.includes(opt) || opt.includes(norm))) {
          answer = L
          break
        }
      }
    }
  }

  void cmp
  return { badge: 'Quiz', question, options, answer }
}

export function extractMissionGoalsFromPhased(phasedMd: string): string[] {
  if (!phasedMd) return []
  const goals: string[] = []
  const seen = new Set<string>()
  const block =
    /By the end of this mission,\s*you can:\s*([\s\S]*?)(?:\n\s*\*\*Kai|\n\s*START MISSION|\n##\s|$)/i.exec(
      phasedMd,
    )?.[1] || phasedMd
  for (const m of block.matchAll(/[✓✔]\s*([^\n✓✔]+)/g)) {
    const t = (m[1] || '').replace(/\s+/g, ' ').trim()
    if (!t || t.length < 3 || seen.has(t)) continue
    seen.add(t)
    goals.push(t)
    if (goals.length >= 8) break
  }
  return goals
}

// —— helpers ——

function formatLabeledLine(label: string, value: string): string {
  if (!label) return value
  return `${label} ${value}`.replace(/\s+$/u, '')
}

function parseTemplateLine(
  line: string,
): { label: string; slot: string; required: boolean; prefix: string } | null {
  const m =
    /^(【[^】]+】|\[[^\]]+\])\s*\{([^}]+)\}\s*$/.exec(line.trim()) ||
    /^(【[^】]+】|\[[^\]]+\])\s*(.*)$/.exec(line.trim())
  if (!m) {
    const bare = /^\{([^}]+)\}$/.exec(line.trim())
    if (bare) {
      return { label: '', slot: bare[1]!.trim(), required: false, prefix: '' }
    }
    return null
  }
  const label = m[1]!
  const rest = (m[2] || '').trim()
  const slotM = /^\{([^}]+)\}$/.exec(rest)
  const slot = slotM
    ? slotM[1]!.trim()
    : rest.replace(/^\{|\}$/g, '').trim() || label
  return {
    label,
    slot,
    required: label.startsWith('【'),
    prefix: label,
  }
}

function indexExampleByLabel(example: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!example || example === '无') return map
  for (const line of example.split(/\n/)) {
    const m = /^(【[^】]+】|\[[^\]]+\])\s*(.*)$/.exec(line.trim())
    if (!m) continue
    const label = m[1]!
    const val = (m[2] || '').trim()
    if (!map.has(label)) map.set(label, [])
    if (val) map.get(label)!.push(val)
  }
  return map
}

function extractGoals(outline: string): string[] {
  const goals: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    let t = s.replace(/\s+/g, ' ').trim()
    t = t.replace(/[…]+$/u, '').replace(/\.\.\.$/, '').trim()
    if (!t || t.length < 3 || seen.has(t)) return
    if (/\b[A-Z]$/.test(t) && t.length < 28) return
    seen.add(t)
    goals.push(t)
  }
  for (const m of outline.matchAll(/[✓✔]\s*([^\n✓✔|]+)/g)) push(m[1]!)
  const can = /you can:\s*([\s\S]+?)(?:\*\*|---|CMP-|$)/i.exec(outline)
  if (can && goals.length === 0) {
    for (const part of can[1]!.split(/[✓✔\n]/).map((x) => x.trim())) {
      if (part.length > 3 && part.length < 120) push(part)
    }
  }
  return goals.slice(0, 8)
}

function mergeGoals(fromOutline: string[], fromMission?: string[]): string[] {
  const bank = (fromMission || [])
    .map((g) => g.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!bank.length) return fromOutline

  const looksTruncated =
    fromOutline.length === 0 ||
    fromOutline.some((g) => /…|\.\.\.$/.test(g)) ||
    (fromOutline.length > 0 &&
      fromOutline.length < bank.length &&
      fromOutline.every((g) =>
        bank.some((b) => b.startsWith(g) || g.startsWith(b.slice(0, 12))),
      ))

  if (looksTruncated && bank.length >= fromOutline.length) {
    if (
      fromOutline.some((g) => /…|\.\.\.$/.test(g)) ||
      fromOutline.length < bank.length
    ) {
      return bank.slice(0, 8)
    }
  }

  return fromOutline.map((g) => {
    const clean = g.replace(/[…]+$/u, '').replace(/\.\.\.$/, '').trim()
    const hit = bank.find(
      (b) =>
        b.toLowerCase() === clean.toLowerCase() ||
        b.toLowerCase().startsWith(clean.toLowerCase()),
    )
    return hit || clean
  })
}

function extractMissionTitle(
  outline: string,
  topic: string,
  ctx: FillDisplayTextContext,
): string {
  const m =
    /YOUR MISSION\s*[-—:]?\s*([^\n]+?)(?:\s+By the end|$)/i.exec(outline) ||
    /Meeting Friends[^\n.]*/i.exec(outline)
  if (m) return (m[1] || m[0]!).replace(/\s+/g, ' ').trim()
  if (topic && !/^this mission$/i.test(topic)) return topic
  if (ctx.missionName && !/^Mission\s*[\d-]+$/i.test(ctx.missionName)) {
    return ctx.missionName
  }
  return topic || ''
}

function resolveTopic(
  outline: string,
  purpose: string,
  ctx: FillDisplayTextContext,
): string {
  const m2 =
    /YOUR MISSION\s*[-—:]?\s*([^\n]+?)(?:\s+By the end|$)/i.exec(outline)
  if (m2) return m2[1]!.replace(/\s+/g, ' ').trim()
  const m3 = /Meeting Friends[^\n.]*/i.exec(outline)
  if (m3) return m3[0]!.trim()
  const m = /Today'?s topic:\s*([^\n.]+)/i.exec(outline)
  if (m && !/^Mission\s*[\d-]+$/i.test(m[1]!.trim())) return m[1]!.trim()
  const hint = ctx.topic?.trim() || ''
  if (hint && !/^Mission\s*[\d-]+$/i.test(hint) && hint !== ctx.missionName) {
    return hint
  }
  const m4 = /Today,?\s+you'?ll\s+([^.]+)/i.exec(outline)
  if (m4) return m4[1]!.trim()
  if (purpose?.trim() && !/建立关系|教学|沉浸|明确任务/.test(purpose)) {
    return purpose.trim().slice(0, 80)
  }
  return hint || 'this mission'
}

function firstExample(
  map: Map<string, string[]>,
  label: string,
): string | null {
  return map.get(label)?.[0]?.trim() || null
}

function isChromeSlot(slot: string, label: string): boolean {
  return /页眉|副标题|卡片标题|顶标|按钮|badge|header|title|下集/i.test(
    `${slot} ${label}`,
  )
}

function extractStartButton(outline: string): string | null {
  const m =
    /\[?\s*START[^\]]*\]?|START MISSION|Let's go|Start!/i.exec(outline)
  if (!m) return null
  return m[0]!.replace(/[\[\]]/g, '').trim().slice(0, 40)
}

function extractSelfOptions(outline: string): string[] {
  const opts: string[] = []
  for (const m of outline.matchAll(/【选项】\s*([^\n【]+)/g)) {
    opts.push(m[1]!.trim())
  }
  if (opts.length) return opts
  for (const m of outline.matchAll(
    /\b(Confident|Better|OK|I need more practice|Need more)\b/gi,
  )) {
    opts.push(m[1]!)
  }
  return [...new Set(opts)].slice(0, 5)
}

function extractOverlays(
  outline: string,
): Array<{ zh: string; pinyin: string }> {
  const out: Array<{ zh: string; pinyin: string }> = []
  for (const m of outline.matchAll(
    /【叠字】\s*([^\n【]+)(?:\n\s*([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+))?/gi,
  )) {
    out.push({ zh: m[1]!.trim(), pinyin: (m[2] || '').trim() || 'NA' })
  }
  if (out.length) return out.slice(0, 4)
  // Fallback: quoted target sentences in freeze/replay
  for (const m of outline.matchAll(/[「“"]([\u4e00-\u9fff]{2,12})[」”"]/g)) {
    out.push({ zh: m[1]!, pinyin: 'NA' })
  }
  const zh = extractFirstZhPhrase(outline)
  if (!out.length && zh) out.push({ zh, pinyin: 'NA' })
  return out.slice(0, 4)
}

function extractZhExamples(outline: string): string[] {
  const list: string[] = []
  for (const m of outline.matchAll(/【例句】\s*([^\n【]+)/g)) {
    list.push(m[1]!.trim())
  }
  for (const m of outline.matchAll(/[「“"]([\u4e00-\u9fffA-Za-z]{2,20})[」”"]/g)) {
    list.push(m[1]!)
  }
  // Pattern discovery: 我 → 我的 (skip title junk like 她 → 的)
  for (const m of outline.matchAll(
    /([\u4e00-\u9fff]{1,6})\s*→\s*([\u4e00-\u9fff？?]{1,8})/g,
  )) {
    const left = m[1]!
    const right = m[2]!
    const idx = m.index ?? 0
    const prev = outline.slice(Math.max(0, idx - 1), idx)
    if (/[：:]/.test(prev)) continue
    if (right === '的' && left.length <= 1) continue
    list.push(`${left} → ${right}`)
  }
  return [...new Set(list)].slice(0, 6)
}

/** `朋友 — péng you — friend` */
export function extractVocabTriple(
  outline: string,
): { zh: string; pinyin: string; en: string } | null {
  const m =
    /([\u4e00-\u9fff]{1,8})\s*[—–\-]\s*([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+?)\s*[—–\-]\s*([A-Za-z][A-Za-z\s/'’-]*)/i.exec(
      outline || '',
    )
  if (!m) return null
  return { zh: m[1]!, pinyin: m[2]!.trim(), en: m[3]!.trim() }
}

/** Student: 她是我的朋友。 */
export function extractStudentZhLine(outline: string): string {
  const raw = (outline || '').replace(/\r/g, '')
  const patterns = [
    /\*\*Student:\*\*\s*([\u4e00-\u9fffA-Za-z0-9，。？?！!\s、]{2,40})/i,
    /Student\s*[：:]\s*([\u4e00-\u9fff，。？?！!\s、]{2,40})/i,
    /学生[：:]\s*([\u4e00-\u9fff，。？?！!\s、]{2,40})/,
  ]
  for (const re of patterns) {
    const m = re.exec(raw)
    if (m?.[1]) {
      const zh = m[1].replace(/\*+/g, '').trim()
      if (/[\u4e00-\u9fff]{2,}/.test(zh)) return zh.replace(/\s+/g, '')
    }
  }
  return ''
}

function extractEnglishGloss(outline: string): string {
  // Kai: Emma is my friend. / She is my friend.
  const kai =
    /\*\*Kai:\*\*\s*([A-Z][^.!?\n]{3,60}(?:friend|Friend)[.!]?)|Kai\s*[：:]\s*([A-Z][^.!?\n]{3,60}(?:friend|Friend)[.!]?)/i.exec(
      outline || '',
    )
  if (kai) return (kai[1] || kai[2] || '').trim().replace(/\.$/, '')
  // Generic EN after em dash already handled by triple
  const sheHe =
    /\b((?:She|He|It|They|Tom|Emma|Jayden)[^.\n]{0,40}\bfriend)\b/i.exec(
      outline || '',
    )
  if (sheHe) return sheHe[1]!.trim()
  if (/bú?\s*shì|不是.*朋友|not my friend/i.test(outline || '')) {
    return 'No. He is not my friend.'
  }
  return ''
}

/** CMP-07: Screen sentence + [PERSON] + 是 + … formula */
export function extractPatternFormula(outline: string): {
  left: string[]
  right: string
  symbol: string
  highlight: string
} {
  const raw = (outline || '').replace(/\r/g, '')
  const left: string[] = []
  for (const m of raw.matchAll(
    /Screen\s*[：:]\s*\*?\s*([\u4e00-\u9fff，。？?！!\sA-Za-z]{2,30})/gi,
  )) {
    const t = m[1]!.replace(/\*+/g, '').trim()
    if (/[\u4e00-\u9fff]{2,}/.test(t) && !/PERSON|MY\/YOUR/i.test(t)) {
      left.push(t.replace(/\s+/g, '').replace(/。?$/, '。'))
    }
  }
  if (!left.length) {
    const stu = extractStudentZhLine(raw)
    if (stu) left.push(stu.replace(/。?$/, '。'))
  }
  if (!left.length) {
    const hz = extractFirstZhPhrase(raw)
    if (hz && hz.length >= 4) left.push(hz.replace(/。?$/, '。'))
  }

  const formulaM =
    /\[PERSON\][^\n]{0,80}|PERSON\s*\+\s*[^\n]{0,60}/i.exec(raw)
  let right = ''
  if (formulaM) {
    right = formulaM[0]!
      .replace(/\*+/g, '')
      .replace(/^Screen\s*[：:]\s*/i, '')
      .trim()
  }
  if (!right && /是\s*\+\s*.*朋友/.test(raw)) {
    right = '[PERSON] + 是 + [MY/YOUR/HIS/HER] + 朋友'
  }
  if (!right && left.some((l) => /是.*朋友/.test(l))) {
    right = '[PERSON] + 是 + [MY/YOUR/HIS/HER] + 朋友'
  }

  const highlight =
    /【高亮】\s*([^\n【]+)/.exec(raw)?.[1]?.trim() ||
    (/是/.test(right) || left.some((l) => /是/.test(l)) ? '是' : '')

  return {
    left: [...new Set(left)].slice(0, 3),
    right,
    symbol: '+',
    highlight,
  }
}

/** CMP-15 Emma welcome / situational dialogue */
export function extractRoleplayBundle(outline: string): {
  scene: string
  dialogue: Array<{ role: string; text: string }>
} {
  const raw = (outline || '').replace(/\r/g, '').replace(/\*\*/g, '')
  let scene = ''
  if (/International Chinese School|new friends|welcome them/i.test(raw)) {
    scene =
      'International Chinese School. New students just arrived — help welcome them. First one together.'
  } else if (/classroom/i.test(raw)) {
    scene = 'In a classroom.'
  } else {
    scene = 'Role play'
  }

  const dialogue: Array<{ role: string; text: string }> = []
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean)

  // Pass 1: collect turns as (speaker, zh) where speaker headers precede CN lines
  let expect: string | null = null
  for (const line of lines) {
    if (/^CMP-\d+/i.test(line) || /^Kai$/i.test(line) || /^Kai\s*[：:]/i.test(line)) {
      expect = null
      continue
    }
    if (/^(On\s*Screen)$/i.test(line)) {
      expect = '__skip_screen__'
      continue
    }
    const header = /^(Emma|Tom|Jayden|Anna|Kaia|Student|user)\s*[：:]?\s*$/i.exec(
      line,
    )
    if (header) {
      const who = header[1]!.toLowerCase()
      expect =
        who === 'student' || who === 'user'
          ? 'user'
          : /emma/i.test(who)
            ? 'Emma'
            : header[1]!
      continue
    }
    const inline =
      /^(Emma|Tom|Jayden|Anna|Kaia|Student|user)\s*[：:]\s*(.+)$/i.exec(line)
    if (inline) {
      const who = inline[1]!.toLowerCase()
      const text = inline[2]!.trim()
      if (/[\u4e00-\u9fff]{2,}/.test(text)) {
        dialogue.push({
          role:
            who === 'student' || who === 'user'
              ? 'user'
              : /emma/i.test(who)
                ? 'Emma'
                : inline[1]!,
          text,
        })
      }
      expect = null
      continue
    }
    if (expect === '__skip_screen__') {
      expect = null
      continue
    }
    if (expect && /[\u4e00-\u9fff]{2,}/.test(line) && !/^[A-Za-z]/.test(line)) {
      dialogue.push({ role: expect, text: line })
      expect = null
    }
  }

  // Dedup consecutive identical turns
  const out: typeof dialogue = []
  for (const d of dialogue) {
    const prev = out[out.length - 1]
    if (prev && prev.role === d.role && prev.text === d.text) continue
    out.push(d)
  }

  return { scene, dialogue: out.slice(0, 12) }
}

function extractFirstZhPhrase(outline: string): string {
  const labeled = /【汉字】\s*([^\n【]+)/.exec(outline)
  if (labeled) return labeled[1]!.trim()
  const triple = extractVocabTriple(outline)
  if (triple) return triple.zh
  const stu = extractStudentZhLine(outline)
  if (stu) return stu
  // Drop activity title / CMP label chrome before first phrase hunt
  let t = (outline || '')
    .replace(/^[^:\n]{0,48}:\s*/, '')
    .replace(/CMP-\d+[^\n]*/gi, ' ')
    .replace(/\*\*/g, '')
  // Prefer Replay/Freeze dialogue: Tom：她是我的朋友。
  const said =
    /(?:Tom|Emma|Jayden|老师|王老师)\s*[：:]\s*([\u4e00-\u9fff，。？?！!]{2,30})/.exec(
      t,
    )
  if (said) return said[1]!.trim()
  const m = /([\u4e00-\u9fff]{2,16}[？?]?)/.exec(t)
  const hit = m?.[1]?.trim() || ''
  // Reject activity-title junk
  if (/^(听音跟读|指人说|聚焦|情境|探索|理解|掌握)/.test(hit)) return ''
  return hit
}

function extractBlocks(outline: string): string {
  const labeled = /字块[：:]\s*([^\n]+)|blocks?[：:]\s*([^\n]+)/i.exec(outline)
  if (labeled) return (labeled[1] || labeled[2] || '').trim()

  // "Student builds: 中国 + 人" OR "Student builds:** 她是哪国人？"
  const builds =
    /Student\s+builds?\s*:?\s*\**\s*([^*\n]+?)(?=\s*\**\s*Kai\s*:|\s+Student\s+says|\s*$)/i.exec(
      outline,
    )
  if (builds?.[1]) {
    const raw = builds[1].replace(/[*_]/g, '').trim()
    if (/\+/.test(raw)) {
      const parts = raw
        .split(/\s*\+\s*/)
        .map((p) => p.trim())
        .filter((p) => /[\u4e00-\u9fffA-Za-z0-9]/.test(p))
      if (parts.length >= 2) return parts.join('，')
    }
    // Space-separated builds: 他的 她的
    const spaced = raw
      .split(/[\s,，、]+/)
      .map((p) => p.trim())
      .filter((p) => /^[\u4e00-\u9fff]{1,8}$/.test(p))
    if (spaced.length >= 2) {
      // Possessive series 他的 她的 → chunks 他，她，的
      if (spaced.every((p) => p.endsWith('的') && p.length >= 2)) {
        const stems = spaced.map((p) => p.slice(0, -1))
        return [...stems, '的'].join('，')
      }
      return spaced.join('，')
    }
    // Full phrase build → pedagogical chunks (她是哪国人？ → 她，是，哪国人)
    const fromPhrase = blocksFromZhPhrase(raw)
    if (fromPhrase) return fromPhrase
  }

  // Formula lines: 中国 + 人 → 中国人
  const formula =
    /([\u4e00-\u9fffA-Za-z0-9]+(?:\s*\+\s*[\u4e00-\u9fffA-Za-z0-9]+)+)\s*→/.exec(
      outline,
    )
  if (formula?.[1]) {
    return formula[1]
      .split(/\s*\+\s*/)
      .map((p) => p.trim())
      .join('，')
  }
  return ''
}

/** 她是哪国人？ / 我是中国人 → 她，是，哪国人 */
function blocksFromZhPhrase(phrase: string): string {
  const t = phrase.replace(/[？?。！!\s]/g, '').trim()
  if (!t || !/[\u4e00-\u9fff]/.test(t)) return ''
  const m = /^(他|她|我|你)(是)(.+)$/.exec(t)
  if (m) return `${m[1]}，${m[2]}，${m[3]}`
  // 中国 + 人 already covered; 中国人 → 中国，人 when ends with 人 and len>=3
  const nation = /^([\u4e00-\u9fff]{2,})(人)$/.exec(t)
  if (nation) return `${nation[1]}，${nation[2]}`
  return ''
}

/** Answer for CMP-12-like: Student builds/says / 「…」 / formula RHS — never bare 构建 */
function extractSentenceBuildAnswer(outline: string): string {
  const builds =
    /Student\s+builds?\s*:?\s*\**\s*([^*\n]+?)(?=\s*\**\s*Kai\s*:|\s+Student\s+says|\s*$)/i.exec(
      outline,
    )?.[1]
  if (builds) {
    const cleaned = builds.replace(/[*_]/g, '').trim()
    // Plus-form: answer is usually Student says, else join without +
    if (!/\+/.test(cleaned)) {
      const spaced = cleaned
        .split(/[\s,，、]+/)
        .map((p) => p.trim())
        .filter((p) => /^[\u4e00-\u9fff]{1,8}$/.test(p))
      if (spaced.length >= 2) return spaced.join('，')
      const zh = /([\u4e00-\u9fff]{2,20}[？?]?)/.exec(cleaned)?.[1]
      if (zh && !/^(构建|练习|词块)/.test(zh)) return zh
    }
  }

  const says =
    /Student\s+says?\s*:?\s*\**\s*([^*\n]+?)(?=\s*\**\s*Kai\s*:|$)/i.exec(
      outline,
    )?.[1]
  if (says) {
    const zh = /([\u4e00-\u9fff]{2,20}[？?]?)/.exec(says.replace(/[*_]/g, ''))?.[1]
    if (zh) return zh
  }
  const quoted =
    /构建[「“"]([\u4e00-\u9fff？?]{2,16})[」”"]|[「“"]([\u4e00-\u9fff？?]{2,16})[」”"]/.exec(
      outline,
    )
  if (quoted) return (quoted[1] || quoted[2] || '').trim()

  const arrow = /→\s*([\u4e00-\u9fff]{2,20}[？?]?)/.exec(outline)?.[1]
  if (arrow) return arrow.trim()

  const kaiBits = [...outline.matchAll(/Kai\s*:\s*\**\s*([^\n*]+)/gi)].map((m) =>
    m[1]!.trim(),
  )
  for (let i = kaiBits.length - 1; i >= 0; i--) {
    const zh = /^(?:[*_]*)([\u4e00-\u9fff]{2,16})[。.!？?]?\s*$/.exec(
      kaiBits[i]!,
    )?.[1]
    if (zh && !/构建|练习|发现|词块/.test(zh)) return zh
  }
  return ''
}

function extractSentenceBuildPrompt(outline: string): string {
  // Lead-in Kai before Screen/Student builds — not the final answer echo
  const lead =
    /Kai\s*:\s*([^\n]{3,80}?)\s*(?=Screen\s+shows|Student\s+builds)/i.exec(
      outline,
    )
  if (lead?.[1] && !/构建[「"]/.test(lead[1])) {
    const t = lead[1].replace(/\*+/g, '').trim()
    if (t.length >= 3 && !/^[\u4e00-\u9fff。.!？?\s]{2,12}$/.test(t)) {
      if (/^let'?s try\.?$/i.test(t)) return "Let's try to build"
      return t
    }
  }
  const screen = /Screen\s+shows?\s+([^.。\n]+)/i.exec(outline)?.[1]?.trim()
  if (screen) return `Build the word for ${screen.trim()}.`

  const answer = extractSentenceBuildAnswer(outline)
  if (answer && /[？?]/.test(answer)) return `Build: ${answer}`
  if (answer) return `Build: ${answer}`
  return ''
}

function extractSlotFromHint(
  hint: string,
  slotName: string,
  label = '',
): string | null {
  if (!hint) return null
  const n = `${slotName} ${label}`.toLowerCase()
  const opt = /^选项\s*([ABCD])$|^([ABCD])$/i.exec(slotName)
  if (opt) {
    const letter = (opt[1] || opt[2] || '').toUpperCase()
    const m = new RegExp(
      `(?:^|[\\s|])${letter}\\s*[.、:：)]\\s*([^|\\n]{1,60}?)(?=(?:\\s+[ABCD]\\s*[.、:：)])|\\s*$|\\|)`,
      'i',
    ).exec(hint)
    if (m?.[1]) return m[1].trim()
    return null
  }
  if (/答案|answer/i.test(n) || /^a\s*\|\s*b\s*\|\s*c/i.test(slotName)) {
    const m =
      /Student\s+chooses?\s*([ABCD])\b|答\s*([ABCD])\b|answer\s*[:=]?\s*([ABCD])\b|【答案】\s*([ABCD])\b/i.exec(
        hint,
      )
    if (m) return (m[1] || m[2] || m[3] || m[4] || '').toUpperCase()
  }
  if (/题目|题干|question/i.test(n)) {
    const q =
      /[“"]([^”"]{4,120})[”"]/.exec(hint) ||
      /(How many[^?？]*[?？])/.exec(hint) ||
      /(What[^?？]*[?？])/.exec(hint)
    if (q?.[1] || q?.[0]) return (q[1] || q[0]!).trim()
  }
  return null
}
