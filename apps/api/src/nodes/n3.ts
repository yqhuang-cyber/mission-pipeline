import type { DecisionCreate } from '@mission-pipeline/shared'
import {
  fillDisplayTextTemplate,
  extractMissionGoalsFromPhased,
  getCatalogComponent,
  loadCatalogComponents,
} from '../master/catalog.js'
import {
  extractVocabTriple,
  extractStudentZhLine,
  extractPatternFormula,
} from '../master/displayTextFill.js'
import { COMPONENT_NAMES } from '../master/eligibility.js'
import {
  completeMarkdown,
  LlmUnavailableError,
} from '../llm/client.js'
import { parseSteppedScript, type MappedStep } from '../validators/n2.js'
import type { NodeEngineResult } from './n1.js'

/**
 * Kai 口播禁「— / –」：模板曾用它当英文停顿或词条分隔，TTS 会读坏或卡顿。
 * 并清掉舞台说明 / 说话人标签（Kai shows…、Kai:、Student:），只留老师要念的话。
 */
export function sanitizeKaiSpeech(text: string): string {
  if (!text) return text
  let t = text
  // Stage business — never voiced
  t = t.replace(
    /\b(?:Then\s+)?Kai\s+(?:shows|points(?:\s+to)?|looks\s+at|gestures\s+(?:to|at)|holds\s+up|presents)\s+[^.?!。？\n]{1,40}[.?!。？]?\s*/gi,
    '',
  )
  t = t.replace(
    /\b(?:Emma|Tom|Anna|Jayden|Friend\s*\d+)\s+walks?\s+over\.?\s*/gi,
    '',
  )
  t = t.replace(
    /\bStudent\s+(?:taps?|chooses?|selects?|builds?|answers?|repeats?|says)\b[^.?!。？\n]{0,60}[.?!。？]?\s*/gi,
    '',
  )
  t = t.replace(
    /\b(?:Then\s+)?(?:show|shows)\s+(?:Tom|Emma|Anna|Jayden|unknown\s+student)\b[^.?!。？\n]{0,20}[.?!。？]?\s*/gi,
    '',
  )
  // Speaker / prompt labels (keep the uttered words after the colon)
  t = t.replace(/\bKai\s+asks?(?:\s+student)?\s*[:：]\s*/gi, '')
  t = t.replace(/\bKai\s*[:：]\s*/gi, '')
  t = t.replace(/\bStudent\s*[:：]\s*[^\n.?!。？]{0,40}[.?!。？]?\s*/gi, '')
  t = t.replace(/\b(?:On\s*)?Screen\s*[:：]\s*/gi, '')
  t = t.replace(/\bHighlight\s*[:：]\s*/gi, '')
  // Em dashes → period pause
  t = t
    .replace(/\s*[—–]+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\.\s*/, '')
    .replace(/\s+([.?!。？])/g, '$1')
    .trim()
  return t
}

function withKaiSpeechSanitized(row: N3Row): N3Row {
  return {
    ...row,
    'Kai Script 1': sanitizeKaiSpeech(row['Kai Script 1']),
    'Kai Script 2': sanitizeKaiSpeech(row['Kai Script 2']),
    'Kai Feedback Script - Correct': sanitizeKaiSpeech(
      row['Kai Feedback Script - Correct'],
    ),
    'Kai Feedback Script - Wrong': sanitizeKaiSpeech(
      row['Kai Feedback Script - Wrong'],
    ),
    'Transition Script': sanitizeKaiSpeech(row['Transition Script']),
  }
}

/** Schema / meta-model aligned row (13 fields) */
export type N3Row = {
  Phase: string
  'Script Step': string
  Step: string
  Component: string
  DisplayText: string
  'Display Image': string
  'Video Play': string
  'Kai Script 1': string
  'Kai Script 2': string
  'Kai Feedback Script - Correct': string
  'Kai Feedback Script - Wrong': string
  'Transition Script': string
  'Knowledge point': string
}

/** Object keys; markdown/xlsx label for DisplayText is schema name "Display Text". */
export const N3_FIELD_ORDER: (keyof N3Row)[] = [
  'Phase',
  'Script Step',
  'Step',
  'Component',
  'DisplayText',
  'Display Image',
  'Video Play',
  'Kai Script 1',
  'Kai Script 2',
  'Kai Feedback Script - Correct',
  'Kai Feedback Script - Wrong',
  'Transition Script',
  'Knowledge point',
]

function fieldLabel(key: keyof N3Row): string {
  return key === 'DisplayText' ? 'Display Text' : key
}

const PHASE_FULL: Record<string, string> = {
  P1: 'Phase 1 - Mission Intro',
  P2: 'Phase 2 - Knowledge Discovery',
  P3: 'Phase 3 - Performance Mission',
  P4: 'Phase 4 - Ending Summary',
}

function cmpName(id: string): string {
  return getCatalogComponent(id)?.nameZh || COMPONENT_NAMES[id] || ''
}

function componentLabel(id: string): string {
  const name = cmpName(id)
  return name ? `${id} · ${name}` : id
}

function mediaDefault(
  cmpOrLabel: string,
  key: 'displayImage' | 'videoPlay',
): string {
  const id = /CMP-\d+/i.exec(cmpOrLabel)?.[0]?.toUpperCase() || cmpOrLabel
  const v = getCatalogComponent(id)?.[key]
  return v && v.trim() ? v : 'NA'
}

function phaseFull(phase: string): string {
  const p = phase.toUpperCase()
  return PHASE_FULL[p] || phase
}

/** catalog K/L — whether Script 2 + Feedback apply (student response) */
export function hasStudentInteraction(cmpId: string): boolean {
  const c = getCatalogComponent(cmpId)
  if (!c) return false
  const id = (cmpId || '').toUpperCase()
  // Curated N3 overrides (watch / tip / image ≠ answer turn)
  if (/^(CMP-03|CMP-05|CMP-07|CMP-09)$/.test(id)) return false
  if (/^(CMP-08|CMP-15|CMP-35)$/.test(id)) return true

  const blob = `${c.interaction} ${c.userInput} ${c.category} ${c.techClass}`
  // 自主 / 无用户输入 / 纯观看 — 无 Script2/Feedback
  if (
    /^(无|无用户输入)$/i.test((c.userInput || '').trim()) ||
    /^(自主|观看)$/i.test((c.interaction || '').trim()) ||
    /^(观看|播放\/?继续|继续)$/i.test((c.userInput || '').trim()) ||
    (/观看|仅观看|纯展示|无互动|无可点|无用户输入|自主/.test(blob) &&
      !/选择|跟读|输入|拖拽|匹配|答题|作答/.test(blob))
  ) {
    return false
  }
  // "继续/点击" alone on observe components is not an answer turn
  if (
    /继续\/?点击|点击提示\/?继续|播放\/?继续/.test(c.userInput || '') &&
    /观察|观看|提示/.test(c.interaction || '') &&
    !/选择|跟读|输入|拖拽|匹配|答题|作答|录音/.test(blob)
  ) {
    return false
  }
  if (
    /选择|跟读|输入|点击|拖拽|匹配|任务|练习|语音|开放|产出|作答|答题|录音/.test(
      blob,
    )
  ) {
    return true
  }
  if (/练习/.test(c.category || '')) return true
  if ((c.template || '').trim() === '无' && /过渡/.test(c.category || '')) {
    return /语音|轻互动/.test(blob) && !/自主/.test(blob)
  }
  return false
}

function shortSnippet(text: string, max = 140): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function firstSentence(text: string, max = 120): string {
  const t = shortSnippet(text, 400)
  if (!t) return ''
  const m = /^(.+?[。.!？?])\s*/.exec(t)
  return (m?.[1] || t).slice(0, max)
}

/**
 * Prefer v0.3.1 activity.title embedded as `Title: anchor…` in content outline
 * (see outlineFromActivityAnchor).
 */
export function activityTitleFromOutline(outline: string): string {
  const m = /^(.{2,48}?):\s+/.exec((outline || '').replace(/\s+/g, ' ').trim())
  if (!m) return ''
  const title = m[1]!.trim()
  if (
    /^(Kai|Audio|Screen|Video|Choices|Student|Freeze|Replay|CMP-\d+)/i.test(
      title,
    )
  ) {
    return ''
  }
  return title.slice(0, 48)
}

/** Step short label: prefer v0.3.1 activity title, else outline / script scene */
export function buildStepLabel(
  scriptName: string,
  cmpId: string,
  outline: string,
  indexInStep: number,
  totalInStep: number,
  activityTitle?: string,
): string {
  const name = cmpName(cmpId)
  const fromActivity =
    (activityTitle || '').trim() || activityTitleFromOutline(outline)
  const outlineBit = shortSnippet(stripOutlineChrome(outline), 40)
  let base =
    fromActivity ||
    outlineBit ||
    `${shortSnippet(scriptName, 28)}${name ? ` — ${name}` : ` — ${cmpId}`}`
  base = base.replace(/\|/g, '/').trim() || cmpId
  if (totalInStep > 1 && !fromActivity) {
    // same CMP reused without distinct activity titles: make unique
    base = `${base} (${indexInStep}/${totalInStep})`
  }
  return base.slice(0, 80)
}

export type KnowledgeItem = { zh: string; gloss: string }

export type MissionKnowledge = {
  words: KnowledgeItem[]
  grammar: KnowledgeItem[]
  phrases: KnowledgeItem[]
  patterns: KnowledgeItem[]
  socialExpressions: KnowledgeItem[]
  pinyin: KnowledgeItem[]
}

const EMPTY_KNOWLEDGE = (): MissionKnowledge => ({
  words: [],
  grammar: [],
  phrases: [],
  patterns: [],
  socialExpressions: [],
  pinyin: [],
})

function pushItem(target: KnowledgeItem[], zh: string, gloss = '') {
  const z = zh.trim()
  if (!z) return
  if (target.some((t) => t.zh === z)) return
  target.push({ zh: z, gloss: gloss.trim() })
}

function parseKnowledgeLine(raw: string): { zh: string; gloss: string } | null {
  const line = raw.trim()
  if (!line) return null
  const gm =
    /^([\u4e00-\u9fffA-Za-z0-9／/·.，,？?！!…āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+?)\s*[（(]\s*([^）)]+)\s*[）)]\s*$/.exec(
      line,
    ) || /^(.+?)\s+[—–-]\s+(.+)$/.exec(line)
  if (gm) return { zh: gm[1]!.trim(), gloss: gm[2]!.trim() }
  return { zh: line, gloss: '' }
}

function isGrammarLemma(zh: string, gloss: string): boolean {
  if (/助词|particle|语法|grammar|结构助|语气助/i.test(gloss)) return true
  return /^(的|吗|呢|了|着|过|吧|啊|呀|嘛)$/.test(zh)
}

function isPinyinToken(zh: string): boolean {
  return /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s']+$/i.test(zh) && /[aeiouüǔūúùāáǎàēéěèīíǐìōóǒò]/i.test(zh)
}

/** Parse mission KP bank from v0.2 元信息 (Word/Grammar/Phrase/Pattern/SocialExpression/Pinyin). */
export function parseMissionKnowledge(phasedMd: string): MissionKnowledge {
  const out = EMPTY_KNOWLEDGE()
  if (!phasedMd) return out

  const section = (names: string[]): string => {
    const alt = names.map(escapeReg).join('|')
    const re = new RegExp(
      `(?:\\*\\*)?(?:${alt})(?:\\*\\*)?[：:][\\s\\S]*?(?=\\n\\s*-\\s*\\*\\*[^*]+\\*\\*|\\n\\s*-\\s*(?:核心|Grammar|Phrase|Pattern|Social|Pinyin|角色)|# Phase|\\n---\\s*\\n|$)`,
      'i',
    )
    return re.exec(phasedMd)?.[0] || ''
  }

  const collectFromBlock = (
    block: string,
    sink: (zh: string, gloss: string) => void,
  ) => {
    if (!block) return
    // Inline slash list on the header line: 核心词汇: 哪国 / 中国
    const headerInline =
      /^[^\n]*[：:]\s*(.+)$/m.exec(block)?.[1]?.trim() || ''
    if (headerInline && !/^[-\*]\s/.test(headerInline)) {
      for (const part of headerInline.split(/\s*\/\s*/)) {
        const item = parseKnowledgeLine(part)
        if (item) sink(item.zh, item.gloss)
      }
    }
    const lineRe = /^\s*[-*]\s*(.+)$/gm
    let m: RegExpExecArray | null
    while ((m = lineRe.exec(block))) {
      const raw = (m[1] || '').trim()
      if (!raw || /核心词汇|核心句型|核心短语|核心语法|拼音|Grammar|Phrase|Pattern|Social|Pinyin|角色/.test(raw)) {
        continue
      }
      const item = parseKnowledgeLine(raw)
      if (item) sink(item.zh, item.gloss)
    }
  }

  // Explicit category sections (optional, preferred when present)
  collectFromBlock(section(['Grammar', '核心语法', '语法点']), (zh, gloss) =>
    pushItem(out.grammar, zh, gloss),
  )
  collectFromBlock(section(['Phrase', '核心短语', '短语']), (zh, gloss) =>
    pushItem(out.phrases, zh, gloss),
  )
  collectFromBlock(
    section(['SocialExpression', '社交表达', '交际表达']),
    (zh, gloss) => pushItem(out.socialExpressions, zh, gloss),
  )
  collectFromBlock(section(['Pinyin', '拼音']), (zh, gloss) => {
    if (isPinyinToken(zh) || /[a-zāáǎà]/i.test(zh)) pushItem(out.pinyin, zh, gloss)
    else pushItem(out.pinyin, zh, gloss)
  })
  collectFromBlock(section(['Pattern', '核心句型', '句型']), (zh, gloss) =>
    pushItem(out.patterns, zh, gloss),
  )
  collectFromBlock(section(['Word', '核心词汇', '词汇']), (zh, gloss) => {
    if (isGrammarLemma(zh, gloss)) pushItem(out.grammar, zh, gloss)
    else if (isPinyinToken(zh)) pushItem(out.pinyin, zh, gloss)
    else pushItem(out.words, zh, gloss)
  })

  // Fallback: classic 核心词汇 / 核心句型 if Word/Pattern empty
  if (!out.words.length && !out.grammar.length) {
    collectFromBlock(section(['核心词汇']), (zh, gloss) => {
      if (isGrammarLemma(zh, gloss)) pushItem(out.grammar, zh, gloss)
      else pushItem(out.words, zh, gloss)
    })
  }
  if (!out.patterns.length) {
    collectFromBlock(section(['核心句型']), (zh, gloss) =>
      pushItem(out.patterns, zh, gloss),
    )
  }

  // 词汇清单 table rows (中文 | 英文)
  const table =
    /##\s*词汇清单[\s\S]*?(?=\n#\s|---|##\s*Phase|$)/i.exec(phasedMd)?.[0] || ''
  for (const m of table.matchAll(
    /^\|\s*([\u4e00-\u9fff]{1,12})\s*\|\s*([^|]+)\|/gm,
  )) {
    const zh = m[1]!.trim()
    const gloss = m[2]!.trim()
    if (/^中文$/.test(zh)) continue
    if (isGrammarLemma(zh, gloss)) pushItem(out.grammar, zh, gloss)
    else if (zh.length >= 3 && /人$/.test(zh) && zh !== '人') {
      pushItem(out.phrases, zh, gloss)
    } else {
      pushItem(out.words, zh, gloss)
    }
  }

  return out
}

/** Drop N2 outline chrome: "视频播放: …", markdown labels, stage notes */
export function stripOutlineChrome(outline: string): string {
  let t = (outline || '').replace(/\r/g, '')
  t = t.replace(
    /^(?:CMP-\d+\s*[·•-]?\s*)?[^\n:]{1,24}:\s*/u,
    '',
  )
  t = t.replace(/\bCMP-\d+\s*[^\n]{0,12}/gi, ' ')
  t = t
    .replace(/\*\*/g, '')
    .replace(/^[A-Za-z][\w\s/-]{0,20}:\s*/gm, (line) => {
      // Keep spoken "Kai:" content by stripping the label only
      if (/^Kai:\s*/i.test(line)) return line.replace(/^Kai:\s*/i, '')
      if (
        /^(Screen|Video|Audio|Student choices|Choices|Freeze|Replay)\s*:/i.test(
          line,
        )
      ) {
        return ''
      }
      return line
    })
  t = t
    .replace(/\bVideo\s+plays\.?/gi, ' ')
    .replace(/\bVideo\s+ends\.?/gi, ' ')
    .replace(/\bAudio:\s*/gi, ' ')
    .replace(/\bStudent choices:\s*/gi, ' ')
    .replace(/\bChoices:\s*/gi, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

const META_SPEECH_BLOCK =
  /建立关系|激活注意|明确任务|首次故事沉浸|感知目标|教学目的|沉浸\/|制造信息差|视频播放|课前寒暄|学习目标|选择题|Mission\s*发布|发布任务|传统版|听音跟读|指人说|全屏大图|词块造句|角色扮演|发音练习|句型学习/

function extractReplayTargetZh(outline: string): string {
  const m =
    /(?:Tom|Emma|Jayden|老师|王老师)\s*[：:]\s*([\u4e00-\u9fff，。？?！!]{2,30})/.exec(
      outline || '',
    ) ||
    /Replay[^\n]*?([\u4e00-\u9fff]{2,16}[。？?]?)/.exec(outline || '')
  return (m?.[1] || '').trim()
}

function extractKaiCueBeforeStudent(outline: string): string {
  const raw = (outline || '').replace(/\r/g, '').replace(/\*\*/g, '')
  const m =
    /Kai\s*[：:]\s*([^\n]{3,80}?)(?=\s*(?:\*\*)?Student|\s*学生)/i.exec(raw)
  if (m) {
    const cue = m[1]!.trim().replace(/\.$/, '')
    if (cue && !META_SPEECH_BLOCK.test(cue) && !/^CMP-/i.test(cue)) return cue
  }
  const ask = /Kai\s+asks?\s*[：:]\s*([^\n]{2,40})/i.exec(raw)
  if (ask) return ask[1]!.trim()
  return ''
}

function isCharacterDialogue(s: string): boolean {
  // 王老师：… / Tom：… — not Kai teacher talk
  if (/^(Kai|凯)\s*[：:]/i.test(s)) return false
  return /^[A-Za-z\u4e00-\u9fff]{1,12}\s*[：:]\s*\S/.test(s.trim())
}

function stripSpeakerLabel(s: string): string {
  return s
    .replace(/^\*{0,2}Kai\*{0,2}\s+asks?(?:\s+student)?\s*[:：]?\s*/i, '')
    .replace(/^\*{0,2}Kai\*{0,2}\s*[:：]\s*/i, '')
    .replace(/^\*{0,2}(?:On\s*)?Screen\*{0,2}\s*[:：]\s*/i, '')
    .trim()
}

function isStageDirection(s: string): boolean {
  const t = stripSpeakerLabel(s.trim())
  if (!t) return true
  if (
    /^(Mission\s*\d+|opening story|Video plays|Video ends|Freeze|Replay)\b/i.test(
      t,
    )
  ) {
    return true
  }
  // Director notes — Kai must not voice these
  if (
    /^(?:Then\s+)?Kai\s+(?:shows|points(?:\s+to)?|looks\s+at|gestures\s+(?:to|at)|holds\s+up|presents)\b/i.test(
      s.trim(),
    )
  ) {
    return true
  }
  if (
    /^(?:Then\s+)?(?:show|shows)\s+(?:Tom|Emma|Anna|Jayden|unknown\s+student)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (
    /^Student\s+(?:taps?|chooses?|selects?|builds?|answers?|repeats?|says)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/^(?:On\s*)?Screen\b|^Highlight\b|^Choices\b|^Audio\b/i.test(s.trim())) {
    return true
  }
  if (/^(Emma|Tom|Anna|Jayden)\s+walks?\b/i.test(t)) return true
  // Narrative stage business without teacher framing
  if (
    /走过来|看向|指向|学生们|Video\b/i.test(t) &&
    !/welcome|watch|listen|ready|today|notice|friend|country|turn|choose|tap|hmm|keep|come back|first|now|your|let'?s|how many|what is/i.test(
      t,
    )
  ) {
    return true
  }
  return false
}

function isSpokenTeacherLine(s: string): boolean {
  const raw = s.trim()
  if (!raw || raw.length < 2) return false
  if (isCharacterDialogue(raw) || isStageDirection(raw)) return false
  const t = stripSpeakerLabel(raw)
  if (!t || t.length < 2) return false
  if (isStageDirection(t)) return false
  if (META_SPEECH_BLOCK.test(t) && !/[a-zA-Z]{3,}/.test(t)) return false
  if (/^[\u4e00-\u9fff]{2,8}$/.test(t) && META_SPEECH_BLOCK.test(t)) return false
  if (/^(A|B|C|D)[\).:\s]/i.test(t)) return false
  if (/^✓/.test(t)) return false
  if (/YOUR MISSION|By the end of this mission/i.test(t)) return false
  // Prefer lines that look like teacher talk (EN or mixed CN dialogue cue)
  if (/^[A-ZА-Я\u4e00-\u9fff]/.test(t) || /[.!?？。]$/.test(t) || /\[User Name\]/i.test(t)) {
    // Avoid captions like "Mission 4: …"
    if (/^Mission\s*\d+/i.test(t)) return false
    // Bare "Kai shows…" already filtered; remaining "Kai …" stage verbs
    if (/^Kai\s+(shows|points|looks|gestures|holds|presents)\b/i.test(t)) {
      return false
    }
    return true
  }
  if (
    /welcome|watch|listen|ready|notice|today|friend|country|turn|choose|tap|look|exactly|hmm|keep|come back|first|now|your|let'?s|how many|what is|say it|ask about/i.test(
      t,
    )
  ) {
    return true
  }
  // Short CN target language Kai may model
  if (/^[\u4e00-\u9fffA-Za-z0-9，。？!\s]{2,40}$/.test(t) && /[？?]/.test(t)) {
    return true
  }
  return false
}

/** Pull Kai-speakable chunks from content outline (no component labels). */
export function extractSpokenChunks(outline: string): string[] {
  const raw = (outline || '').replace(/\r/g, '')
  const chunks: string[] = []

  // Prefer explicit Kai blocks (allow mid-line `Kai:` — outlines are often flat)
  const kaiBlocks = [
    ...raw.matchAll(
      /\*\*Kai:\*\*\s*([\s\S]*?)(?=\*\*[A-Za-z]|Student choices|YOUR MISSION|Screen:|Video plays|Kai shows|---|$)/gi,
    ),
    ...raw.matchAll(
      /(?:^|[\n\s]|[*])Kai\s*[：:]\s*([^*\n]+?)(?=\s*(?:\*{0,2}(?:Student|Kai\s*[：:]|Screen|Choices|Highlight|Friend|Then\s+Kai\s+shows|Kai\s+shows)\b)|\*{2}|$)/gi,
    ),
    ...raw.matchAll(
      /(?:^|\n)Kai\s*[：:]\s*([\s\S]*?)(?=\n(?:Emma|Tom|Jayden|Student|On\s*Screen|Kai|Friend|---)\b|$)/gi,
    ),
  ]
  for (const kb of kaiBlocks) {
    const body = stripOutlineChrome(stripSpeakerLabel(kb[1] || ''))
    for (const part of body.split(/(?<=[.!?。？])\s+/)) {
      const p = stripSpeakerLabel(part.trim())
      if (isSpokenTeacherLine(p)) chunks.push(p)
    }
  }

  if (!chunks.length) {
    const cleaned = stripOutlineChrome(raw)
    for (const part of cleaned.split(/(?<=[.!?。？])\s+/)) {
      const p = stripSpeakerLabel(part.trim())
      if (isSpokenTeacherLine(p)) chunks.push(p)
    }
  }

  // Dedup preserve order
  const seen = new Set<string>()
  return chunks.filter((c) => {
    const k = c.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function withUserName(s: string): string {
  if (/welcome back/i.test(s) && !/\[User Name\]/i.test(s)) {
    return s.replace(/Welcome back\.?/i, 'Welcome back, [User Name].')
  }
  return s
}

function joinSpoken(parts: string[], max = 160): string {
  let out = ''
  for (const p of parts) {
    const next = out ? `${out} ${p}` : p
    if (next.length > max) break
    out = next
  }
  return withUserName(out.trim())
}

/**
 * 观后选择题时间线：氛围开场 / 互动触发 / 收尾，互不复述。
 * Script1 ← Hmm + Names. Countries. Friends. + A lot is happening
 * Script2 ← How many did you catch? Tap one.
 * Transition ← Keep the story… We'll come back…
 */
function splitPostWatchMcqTimeline(outline: string): {
  leadIn: string
  prompt: string
  closing: string
} {
  const raw = (outline || '').replace(/\*\*/g, '')
  const leadBits: string[] = []
  if (/\bHmm\b\.?/i.test(raw)) leadBits.push('Hmm.')
  if (/Names\.?\s*Countries\.?\s*Friends\.?/i.test(raw)) {
    leadBits.push('Names. Countries. Friends.')
  }
  if (/A lot is happening\.?/i.test(raw)) leadBits.push('A lot is happening.')

  let prompt = ''
  if (/How many countries|how many did you|Student choices|Choices:/i.test(raw)) {
    prompt = 'How many did you catch? Tap one.'
  }

  const closeBits: string[] = []
  if (/Keep the story in mind/i.test(raw)) {
    closeBits.push('Keep the story in mind.')
  }
  if (/We'?ll come back to it/i.test(raw)) {
    closeBits.push("We'll come back to it.")
  } else if (/We'?ll come back/i.test(raw)) {
    closeBits.push("We'll come back to this.")
  }

  return {
    leadIn: leadBits.join(' ').trim(),
    prompt,
    closing: closeBits.join(' ').trim(),
  }
}

function hitBankItems(
  items: KnowledgeItem[],
  src: string,
  opts: { allowShortZh?: boolean; max?: number } = {},
): string[] {
  const { allowShortZh = false, max = 4 } = opts
  const hits: string[] = []
  const sorted = [...items].sort((a, b) => b.zh.length - a.zh.length)
  for (const item of sorted) {
    if (!item.zh) continue
    if (!allowShortZh && item.zh.length <= 1) continue
    if (src.includes(item.zh)) {
      hits.push(item.zh)
      continue
    }
    if (item.gloss) {
      const glossToken = item.gloss.split(/[/,;]| or /i)[0]!.trim()
      if (
        glossToken.length >= 4 &&
        new RegExp(`\\b${escapeReg(glossToken)}\\b`, 'i').test(src)
      ) {
        hits.push(item.zh)
      }
    }
  }
  return [...new Set(hits)].slice(0, max)
}

/** 1-char bank items (人 / 的) only when the outline focuses that lemma. */
function lemmaFocusedInOutline(zh: string, src: string): boolean {
  if (zh.length > 1) return src.includes(zh)
  const esc = escapeReg(zh)
  // Do not use \\b around CJK — JS word boundaries ignore Han characters.
  const notHan = `[^\\u4e00-\\u9fff]`
  return (
    new RegExp(
      `(?:Highlight|Focus|发现|强调|看一看|Student taps?)\\s*[:：]?\\s*${esc}(?=${notHan}|$)`,
      'i',
    ).test(src) ||
    new RegExp(`${esc}\\s+is\\s+(?:doing|for|a)\\b`, 'i').test(src) ||
    new RegExp(`\\bwhat\\s+.+${esc}(?=${notHan}|$)`, 'i').test(src) ||
    new RegExp(`(?:^|\\n)\\s*${esc}\\s*(?:\\n|$)`).test(src)
  )
}

export function extractKnowledgePoint(
  outline: string,
  _purpose: string,
  knowledge?: MissionKnowledge,
): string {
  // Scope to THIS activity outline only — do not scan script_step 教学目的,
  // which is shared by every component under the step and over-fills KP.
  const src = stripOutlineChrome(outline || '')
  const lines: string[] = []
  const bank = knowledge || EMPTY_KNOWLEDGE()

  const hitWords: string[] = []
  for (const w of [...bank.words].sort((a, b) => b.zh.length - a.zh.length)) {
    if (!w.zh) continue
    if (w.zh.length <= 1) {
      if (lemmaFocusedInOutline(w.zh, src)) hitWords.push(w.zh)
      continue
    }
    if (src.includes(w.zh)) {
      hitWords.push(w.zh)
      continue
    }
    if (w.gloss) {
      const glossToken = w.gloss.split(/[/,;]| or /i)[0]!.trim()
      if (
        glossToken.length >= 4 &&
        new RegExp(`\\b${escapeReg(glossToken)}\\b`, 'i').test(src)
      ) {
        hitWords.push(w.zh)
      }
    }
  }
  // Country / friend English → mission vocab (only when lemma is in the bank)
  if (/China|Chinese/i.test(src) && bank.words.some((w) => w.zh === '中国')) {
    hitWords.push('中国')
  }
  if (
    /America|American|USA|\bUS\b/i.test(src) &&
    bank.words.some((w) => w.zh === '美国')
  ) {
    hitWords.push('美国')
  }
  if (
    /Britain|British|\bUK\b|England/i.test(src) &&
    bank.words.some((w) => w.zh === '英国')
  ) {
    hitWords.push('英国')
  }
  if (/\bfriends?\b/i.test(src) && bank.words.some((w) => w.zh === '朋友')) {
    hitWords.push('朋友')
  }
  if (
    /where .+ from|which country|哪国/i.test(src) &&
    bank.words.some((w) => w.zh === '哪国')
  ) {
    hitWords.push('哪国')
  }
  const uniqWords = [...new Set(hitWords)].slice(0, 4)
  if (uniqWords.length) lines.push(`Word: ${uniqWords.join(' / ')}`)

  const hitGrammar: string[] = []
  for (const g of [...bank.grammar].sort((a, b) => b.zh.length - a.zh.length)) {
    if (!g.zh) continue
    if (lemmaFocusedInOutline(g.zh, src)) hitGrammar.push(g.zh)
  }
  const uniqGrammar = [...new Set(hitGrammar)].slice(0, 3)
  if (uniqGrammar.length) lines.push(`Grammar: ${uniqGrammar.join(' / ')}`)

  const hitPhrases = hitBankItems(bank.phrases, src, { max: 3 })
  if (hitPhrases.length) lines.push(`Phrase: ${hitPhrases.join(' / ')}`)

  // Patterns: only those whose form actually appears in this outline — no
  // "if word 人 hit, dump every pattern containing 人" expansion.
  const hitPatterns: string[] = []
  for (const p of bank.patterns) {
    if (!p.zh) continue
    if (patternMatchesOutline(p.zh, src)) {
      hitPatterns.push(normalizePatternLabel(p.zh))
    }
  }
  const uniqPat = [...new Set(hitPatterns)].slice(0, 2)
  if (uniqPat.length) lines.push(`Pattern: ${uniqPat.join(' / ')}`)

  const hitSocial = hitBankItems(bank.socialExpressions, src, {
    allowShortZh: true,
    max: 3,
  })
  if (hitSocial.length) {
    lines.push(`SocialExpression: ${hitSocial.join(' / ')}`)
  }

  const hitPinyin: string[] = []
  for (const p of bank.pinyin) {
    if (!p.zh) continue
    const needle = p.zh.trim()
    if (src.includes(needle)) {
      hitPinyin.push(needle)
      continue
    }
    // Tone-insensitive fallback for romanization
    const fold = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ü/gi, 'v')
        .toLowerCase()
    if (fold(src).includes(fold(needle))) hitPinyin.push(needle)
  }
  const uniqPy = [...new Set(hitPinyin)].slice(0, 2)
  if (uniqPy.length) lines.push(`Pinyin: ${uniqPy.join(' / ')}`)

  // No bank hits → leave empty (do not invent "SocialExpression: classroom rapport")
  return lines.join('\n')
}

function normalizePatternLabel(zh: string): string {
  // Prefer bank form without trailing English gloss if duplicated in cell
  return zh.replace(/\s*[（(][^）)]+[）)]\s*$/, '').trim() || zh
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function patternMatchesOutline(patternZh: string, src: string): boolean {
  const variants = [patternZh]
  if (/她\s*\/\s*他|他\s*\/\s*她/.test(patternZh)) {
    variants.push(
      patternZh.replace(/她\s*\/\s*他|他\s*\/\s*她/, '她'),
      patternZh.replace(/她\s*\/\s*他|他\s*\/\s*她/, '他'),
    )
  }
  for (const v of variants) {
    if (/XX/.test(v)) {
      const [a, b] = v.split(/XX/)
      const left = (a || '').replace(/[？?。.\s]/g, '')
      const right = (b || '').replace(/[？?。.\s]/g, '')
      if (left && right && src.includes(left) && src.includes(right)) return true
      continue
    }
    const stem = v.replace(/[？?。.\s]/g, '')
    if (stem.length >= 3 && src.includes(stem)) return true
    if (src.includes(v.replace(/？/g, '?'))) return true
  }
  return false
}

function buildKaiScript1(
  outline: string,
  purpose: string,
  cmpId: string,
): string {
  const id = cmpId.toUpperCase()

  if (id === 'CMP-33' || id === 'CMP-02') {
    const tl = splitPostWatchMcqTimeline(outline)
    if (tl.leadIn) return tl.leadIn
    // 有互动题但无氛围铺垫：开场别吞题干/选项/收尾
    if (tl.prompt) return 'Hmm.'
  }

  if (id === 'CMP-03') {
    const zh = extractReplayTargetZh(outline)
    if (/Replay|Freeze|Listen again/i.test(outline) && zh) {
      if (/once more|one word|new here/i.test(outline)) {
        return `Listen once more: ${zh}`
      }
      return `Listen again. Tom says: ${zh}`
    }
    const chunks = extractSpokenChunks(outline).filter(
      (c) => !/^(Perfect|Good|Nice|Exactly|Great)\b/i.test(c.trim()),
    )
    if (chunks.length) return joinSpoken(chunks.slice(0, 2), 160)
    return 'First, watch. Just notice the key details.'
  }

  if (id === 'CMP-09') {
    const chunks = extractSpokenChunks(outline).filter(
      (c) =>
        !/^(Perfect|Exactly)\b/i.test(c.trim()) &&
        !/^You already know/i.test(c.trim()),
    )
    if (chunks.length) return joinSpoken(chunks.slice(0, 2), 140)
    if (/Tom and Emma know each other/i.test(outline)) {
      return 'Tom and Emma know each other. They study together.'
    }
    return 'Look at the picture.'
  }

  if (id === 'CMP-08') {
    const triple = extractVocabTriple(outline)
    if (triple) {
      return `${triple.zh}. ${triple.pinyin}. ${triple.en}.`
    }
    const hz = extractStudentZhLine(outline) || extractReplayTargetZh(outline)
    if (hz) return `Listen: ${hz}`
  }

  if (id === 'CMP-07') {
    return 'Look at the pattern.'
  }

  if (id === 'CMP-35') {
    const cue = extractKaiCueBeforeStudent(outline)
    const stu = extractStudentZhLine(outline)
    if (cue && /[?？]$/.test(cue)) return cue
    if (cue) return `${cue}. Say it.`
    if (stu) return `Say it: ${stu}`
  }

  if (id === 'CMP-15') {
    const chunks = extractSpokenChunks(outline).filter(
      (c) =>
        !/^(Perfect|Excellent|Great!?\s*$)/i.test(c.trim()) &&
        !/^Start by asking/i.test(c.trim()),
    )
    const lead = joinSpoken(
      chunks
        .filter((c) =>
          /know how|meet|welcome|first one|Let's go|Great/i.test(c),
        )
        .slice(0, 4),
      220,
    )
    if (lead) return lead
    if (chunks.length) return joinSpoken(chunks.slice(0, 3), 200)
  }

  // CMP-12: when outline is mostly Student builds + post-success Kai, open with a prompt
  if (id === 'CMP-12') {
    const hasLeadKai = /Kai\s*:[\s\S]{0,80}Student\s+builds/i.test(outline)
    if (
      !hasLeadKai ||
      /^\s*(?:词块|构建)?[^:]*:\s*Student\s+builds/i.test(outline)
    ) {
      if (/她是/i.test(outline)) return 'Now ask about her.'
      if (/他是___|ask about him|他是哪国/i.test(outline)) {
        return 'Now ask about him.'
      }
      if (/Student\s+builds/i.test(outline)) return 'Your turn. Build it.'
    }
  }

  const chunks = extractSpokenChunks(outline)
  const openers = chunks.filter(
    (c) =>
      !/^(Perfect|Good|Nice|Exactly|Great|You already knew)\b/i.test(c.trim()) &&
      !/^CMP-\d+/i.test(c.trim()),
  )
  if (openers.length) {
    return joinSpoken(openers.slice(0, 3), 160)
  }
  if (id === 'CMP-32')
    return "Today, you'll see what you can do by the end of this mission."
  if (id === 'CMP-04') return 'Ready to start the mission?'
  if (id === 'CMP-01') return 'Welcome back, [User Name].'
  if (id === 'CMP-12') {
    if (/她是/i.test(outline)) return 'Now ask about her.'
    if (/他是___|ask about him|他是哪国/i.test(outline)) {
      return 'Now ask about him.'
    }
    return 'Your turn. Build it.'
  }
  if (id === 'CMP-13') {
    if (/Look at them/i.test(outline)) return 'Look at them.'
  }
  const cleaned = stripOutlineChrome(outline)
  const sent = firstSentence(cleaned, 110)
  if (sent && isSpokenTeacherLine(sent) && !META_SPEECH_BLOCK.test(sent)) {
    return withUserName(sent)
  }
  void purpose
  return "Let's begin."
}

function buildKaiScript2(outline: string, cmpId: string): string {
  const id = cmpId.toUpperCase()

  if (id === 'CMP-33' || id === 'CMP-02') {
    const tl = splitPostWatchMcqTimeline(outline)
    if (tl.prompt) return tl.prompt
  }

  if (id === 'CMP-12') return 'Build the question.'
  if (id === 'CMP-08') {
    const triple = extractVocabTriple(outline)
    const hz = triple?.zh || extractStudentZhLine(outline) || 'it'
    return `Listen and repeat: ${hz}.`
  }
  if (id === 'CMP-35') {
    const stu = extractStudentZhLine(outline)
    if (/不是|Say no/i.test(outline) && stu) {
      return `Say no: ${stu}`
    }
    return stu || 'Your turn. Say it.'
  }
  if (id === 'CMP-15') {
    if (/asking her name|ask.*name/i.test(outline)) {
      return 'Start by asking her name.'
    }
    return 'Your turn. Say the line on the screen.'
  }
  if (id === 'CMP-13') {
    const q =
      /What do you think\s+[^\n?]+\?/i.exec(outline)?.[0] ||
      extractSpokenChunks(outline).find((c) => /[?？]$/.test(c))
    if (q) return shortSnippet(q, 120)
  }

  const chunks = extractSpokenChunks(outline)
  const prompt =
    chunks.find((c, i) => i > 0 && /[?？]$/.test(c)) ||
    chunks.find((c) => /tap|choose|click|your turn|ready|listen|try|选/i.test(c))
  if (
    prompt &&
    !META_SPEECH_BLOCK.test(prompt) &&
    !/You already knew/i.test(prompt)
  ) {
    return shortSnippet(prompt, 120)
  }

  const cleaned = stripOutlineChrome(outline)
  if (/how many|choices|A\s*1|选项|选/i.test(cleaned)) {
    return 'How many did you catch? Tap one.'
  }
  if (/跟读|listen and repeat|repeat/i.test(cleaned)) {
    return 'Your turn. Listen and repeat.'
  }
  if (/drag|match|拖|匹配/i.test(cleaned)) {
    return 'Now drag and match.'
  }
  void cmpId
  return 'Your turn. Try it.'
}

function buildFeedbackCorrect(outline: string, cmpId = ''): string {
  const id = cmpId.toUpperCase()
  if (id === 'CMP-08' || id === 'CMP-35') {
    if (/You can say yes|You can say no/i.test(outline)) {
      return 'Good. You can say yes. You can say no.'
    }
    return 'Good.'
  }
  if (id === 'CMP-15') return 'Excellent.'
  if (/\bYou found it\b/i.test(outline)) return 'You found it.'
  if (/\bPerfect\b/i.test(outline)) return 'Perfect.'
  if (/答\s*[ABC]|answer\s*[ABC]|正确|Exactly/i.test(outline)) {
    return 'Exactly.'
  }
  return 'Good. Keep that in mind.'
}

function buildFeedbackWrong(outline: string, cmpId = ''): string {
  const id = cmpId.toUpperCase()
  if (id === 'CMP-08') {
    const triple = extractVocabTriple(outline)
    const hz = triple?.zh || 'it'
    return `Not yet. Listen again: ${hz}.`
  }
  if (id === 'CMP-35') {
    const stu = extractStudentZhLine(outline)
    return stu ? `Try again: ${stu}` : 'Try again.'
  }
  if (id === 'CMP-15') return 'Try the line on the screen.'
  if (id === 'CMP-13' && /朋友|Tom and Emma/i.test(outline)) {
    return 'Not quite. Look at Tom and Emma together.'
  }
  if (/听|listen|countries|国家/i.test(outline)) {
    return 'Not yet. Listen again for the key words.'
  }
  return 'Not quite. Try once more.'
}

function buildTransition(outline: string, _purpose: string, cmpId = ''): string {
  const id = cmpId.toUpperCase()

  if (id === 'CMP-33' || id === 'CMP-02') {
    const tl = splitPostWatchMcqTimeline(outline)
    if (tl.closing) return tl.closing
  }

  if (id === 'CMP-03') {
    if (/Freeze/i.test(outline)) return 'Freeze. Keep that line in mind.'
    if (/one word|new here|Listen for/i.test(outline)) {
      return 'One word is new here. Listen for it.'
    }
  }
  if (id === 'CMP-09') {
    const chunks = extractSpokenChunks(outline)
    const tail = chunks.filter((c) =>
      /You already know|another word|同学/i.test(c),
    )
    if (tail.length) return joinSpoken(tail.slice(0, 3), 160)
    if (/同学|another word/i.test(outline)) {
      return "You already know: 同学. Emma is Tom's 同学. But Tom says another word."
    }
  }
  if (id === 'CMP-07') {
    const f = extractPatternFormula(outline)
    if (f.right) {
      return f.right
        .replace(/\[PERSON\]/gi, 'PERSON')
        .replace(/\[MY\/YOUR\/HIS\/HER\]/gi, '我的/你的/他的/她的')
    }
  }
  if (id === 'CMP-08') {
    const chunks = extractSpokenChunks(outline).filter((c) =>
      /classmate|friend|Emma is Tom/i.test(c),
    )
    if (chunks.length) return joinSpoken(chunks.slice(0, 2), 140)
  }
  if (id === 'CMP-35') {
    if (/You can say yes|You can say no/i.test(outline)) {
      return 'You can say yes. You can say no.'
    }
    const chunks = extractSpokenChunks(outline)
    const last = chunks[chunks.length - 1]
    if (last && !/^(Good|Perfect)\b/i.test(last)) return shortSnippet(last, 120)
    const stu = extractStudentZhLine(outline)
    if (stu && /她是我的朋友/.test(stu)) return 'Nice. You said it about Emma.'
  }
  if (id === 'CMP-15') {
    if (/Emma smiles/i.test(outline)) {
      return 'Emma smiles. You welcomed your first new friend.'
    }
  }
  if (id === 'CMP-13') {
    if (/朋友 means friend|Exactly/i.test(outline) && /朋友/.test(outline)) {
      return '朋友 means friend.'
    }
  }

  const chunks = extractSpokenChunks(outline)
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1]!
    const first = chunks[0]!
    if (
      last !== first &&
      isSpokenTeacherLine(last) &&
      !META_SPEECH_BLOCK.test(last) &&
      !isCharacterDialogue(last)
    ) {
      return shortSnippet(last, 120)
    }
  }
  const cleaned = stripOutlineChrome(outline)
  if (/come back|keep the story/i.test(cleaned)) {
    return "We'll come back to this."
  }
  if (/START MISSION|Ready to meet/i.test(cleaned)) {
    return 'Ready to meet friends from around the world?'
  }
  if (/First,\s*watch/i.test(cleaned)) {
    return "We'll come back to this story."
  }
  return "Let's keep going."
}

export function buildHeuristicRow(input: {
  phase: string
  scriptStep: number
  scriptName: string
  purpose: string
  cmpId: string
  outline: string
  indexInStep: number
  totalInStep: number
  topic?: string
  missionName?: string
  knowledge?: MissionKnowledge
  missionGoals?: string[]
  /** v0.3.1 activity.title — preferred Step label */
  activityTitle?: string
}): N3Row {
  loadCatalogComponents()
  const interactive = hasStudentInteraction(input.cmpId)
  const displayText = fillDisplayTextTemplate(
    input.cmpId,
    input.outline,
    input.purpose,
    {
      topic: input.topic,
      missionName: input.missionName,
      missionGoals: input.missionGoals,
    },
  )
  return withKaiSpeechSanitized({
    Phase: phaseFull(input.phase),
    'Script Step': `${input.scriptStep} · ${input.scriptName}`.trim(),
    Step: buildStepLabel(
      input.scriptName,
      input.cmpId,
      input.outline,
      input.indexInStep,
      input.totalInStep,
      input.activityTitle,
    ),
    Component: componentLabel(input.cmpId),
    DisplayText: displayText,
    'Display Image': mediaDefault(input.cmpId, 'displayImage'),
    'Video Play': mediaDefault(input.cmpId, 'videoPlay'),
    'Kai Script 1': buildKaiScript1(
      input.outline,
      input.purpose,
      input.cmpId,
    ),
    'Kai Script 2': interactive
      ? buildKaiScript2(input.outline, input.cmpId)
      : '',
    'Kai Feedback Script - Correct': interactive
      ? buildFeedbackCorrect(input.outline, input.cmpId)
      : '',
    'Kai Feedback Script - Wrong': interactive
      ? buildFeedbackWrong(input.outline, input.cmpId)
      : '',
    'Transition Script': buildTransition(
      input.outline,
      input.purpose,
      input.cmpId,
    ),
    'Knowledge point': extractKnowledgePoint(
      input.outline,
      input.purpose,
      input.knowledge,
    ),
  })
}

function escapeCell(s: string): string {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, '\\n')
}

function renderRowBlock(
  row: N3Row,
  missionStepId: string,
  cmpId: string,
): string[] {
  const blocks: string[] = [
    `## mission_step ${missionStepId}: ${cmpId} ${cmpName(cmpId)}`,
    '',
    '### Display Text',
    '',
    '```',
    row.DisplayText || 'NA',
    '```',
    '',
    '### Fields (13)',
    '',
    '| 字段 | 值 |',
    '|---|---|',
  ]
  for (const key of N3_FIELD_ORDER) {
    if (key === 'DisplayText') {
      blocks.push(`| **Display Text** | _(见上方代码块)_ |`)
      continue
    }
    blocks.push(`| **${fieldLabel(key)}** | ${escapeCell(row[key])} |`)
  }
  blocks.push('', '---', '')
  return blocks
}

export function renderPhaseFile(
  missionName: string,
  phase: string,
  rows: Array<{ row: N3Row; missionStepId: string; cmpId: string }>,
): { md: string; count: number } {
  const full = phaseFull(phase)
  const blocks: string[] = [
    `# ${missionName} — Component Content (v0.4) — ${phase}`,
    ``,
    `> **版本**: v0.4.5`,
    `> **Schema**: master/mission_spec_schema.csv（13 字段）`,
    `> **Meta**: master/mission_phase_step_meta_model.md`,
    `> **规则**: Display Text 按 catalog E 列；【】缺料→[待补]；[]→NA；模版=无→NA；Image/Video 按 catalog N/O（NA 或 字段+TBC）`,
    `> **Phase**: ${full}`,
    ``,
    `---`,
    ``,
  ]

  if (!rows.length) {
    blocks.push(`_(no mission steps in ${phase})_`, '')
    return { md: blocks.join('\n'), count: 0 }
  }

  let lastScript = ''
  for (const { row, missionStepId, cmpId } of rows) {
    const scriptKey = row['Script Step']
    if (scriptKey !== lastScript) {
      lastScript = scriptKey
      blocks.push(`# script_step ${scriptKey}`)
      blocks.push('')
      blocks.push(`> **Phase**: ${phase} · **${full}**`)
      blocks.push('')
    }
    blocks.push(...renderRowBlock(row, missionStepId, cmpId))
  }

  return { md: blocks.join('\n'), count: rows.length }
}

export type N3EditRow = {
  missionStepId: string
  cmpId: string
  phaseKey: 'P1' | 'P2' | 'P3' | 'P4'
  row: N3Row
}

export function phaseKeyFromLabel(phase: string): 'P1' | 'P2' | 'P3' | 'P4' {
  const m = /Phase\s*([1-4])|\bP([1-4])\b/i.exec(phase || '')
  const n = m?.[1] || m?.[2] || '1'
  return `P${n}` as 'P1' | 'P2' | 'P3' | 'P4'
}

function cellMap(fieldMap: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (fieldMap[k] != null && fieldMap[k] !== '') return fieldMap[k]!
  }
  return ''
}

/** Parse v0.4 bundle (or single phase file) into editable rows */
export function parseV04BundleToEditRows(md: string): N3EditRow[] {
  const out: N3EditRow[] = []
  const chunks = md.split(/^## mission_step\s+/m).slice(1)
  for (const chunk of chunks) {
    const header = chunk.split('\n')[0] || ''
    const idMatch = /^(\d+\.\d+)\s*:\s*(CMP-\d+)/i.exec(header.trim())
    const cmpMatch = /CMP-\d+/i.exec(header)
    const missionStepId = idMatch?.[1] || ''
    const cmpId = (idMatch?.[2] || cmpMatch?.[0] || '').toUpperCase()

    const fieldMap: Record<string, string> = {}
    const tableRows = chunk.matchAll(
      /^\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|\s*(.*?)\s*\|?\s*$/gm,
    )
    for (const m of tableRows) {
      const key = m[1]!.trim()
      const val = m[2]!.trim()
      if (key === '字段' || key.includes('---')) continue
      if (/见上方/.test(val)) continue
      fieldMap[key] = val.replace(/\\n/g, '\n').replace(/\\\|/g, '|')
    }
    // Heading is "### Display Text" (schema name); tolerate "DisplayText" too
    const dtBlock =
      /### Display\s*Text[\s\S]*?```(?:[^\n]*)\r?\n([\s\S]*?)\r?\n```/.exec(
        chunk,
      ) || /### Display\s*Text[\s\S]*?```([\s\S]*?)```/.exec(chunk)
    const displayText =
      dtBlock?.[1]?.trim() ||
      fieldMap['Display Text'] ||
      fieldMap['DisplayText'] ||
      'NA'
    const component =
      cellMap(fieldMap, 'Component', 'Component 序号') || cmpId
    const cmpFromLabel =
      /CMP-\d+/i.exec(component)?.[0]?.toUpperCase() || cmpId

    const row: N3Row = {
      Phase: cellMap(fieldMap, 'Phase') || 'Phase 1 - Mission Intro',
      'Script Step': cellMap(fieldMap, 'Script Step', 'script_step'),
      Step: cellMap(fieldMap, 'Step') || '',
      Component: component,
      DisplayText: displayText,
      'Display Image': cellMap(fieldMap, 'Display Image'),
      'Video Play': cellMap(fieldMap, 'Video Play'),
      'Kai Script 1': cellMap(fieldMap, 'Kai Script 1'),
      'Kai Script 2': cellMap(fieldMap, 'Kai Script 2'),
      'Kai Feedback Script - Correct': cellMap(
        fieldMap,
        'Kai Feedback Script - Correct',
        'Kai Feedback (Correct)',
      ),
      'Kai Feedback Script - Wrong': cellMap(
        fieldMap,
        'Kai Feedback Script - Wrong',
        'Kai Feedback (Wrong)',
      ),
      'Transition Script': cellMap(fieldMap, 'Transition Script'),
      'Knowledge point': cellMap(
        fieldMap,
        'Knowledge point',
        'Knowledge Point',
      ),
    }

    out.push({
      missionStepId: missionStepId || `${out.length + 1}.1`,
      cmpId: cmpFromLabel,
      phaseKey: phaseKeyFromLabel(row.Phase),
      row,
    })
  }
  return out
}

/** Rebuild P1–P4 markdown + bundle from edited rows */
export function rebuildV04FromEditRows(
  missionName: string,
  rows: N3EditRow[],
): { content: string; phaseFiles: Record<string, string>; total: number } {
  const phaseFiles: Record<string, string> = {}
  let total = 0
  const parts: string[] = [
    `# ${missionName} — v0.4 component content (bundle)`,
    ``,
    `> P1–P4 合集；13 字段对齐 mission_spec_schema / meta model v0.4.5；1 Component = 1 Step = 1 行`,
    `> edited: draft save`,
    ``,
  ]

  for (const phase of ['P1', 'P2', 'P3', 'P4'] as const) {
    const phaseRows = rows
      .filter((r) => r.phaseKey === phase)
      .map((r) => ({
        row: {
          ...r.row,
          Phase: phaseFull(phase),
          Component: r.row.Component || componentLabel(r.cmpId),
        },
        missionStepId: r.missionStepId,
        cmpId: r.cmpId,
      }))
    const { md, count } = renderPhaseFile(missionName, phase, phaseRows)
    phaseFiles[phase] = md
    total += count
    parts.push(
      `# ===== ${phase} · v0.4_component_content_${phase.toLowerCase()}.md =====`,
      '',
      md,
      '',
    )
  }

  return { content: parts.join('\n'), phaseFiles, total }
}


const N3_SYSTEM = `你是中文教学 Mission Pipeline 的 N3（Content 填充）助手。
根据 v0.3 的 component + content outline + catalog 模版，为每一行生成字段。
严格遵守 master/mission_phase_step_meta_model.md v0.4.5：
- Phase 用全称；Script Step 继承 v0.3；Step=v0.3.1 的 activity 标题（已给出 activityTitle，不要改写）；Component=CMP-XX · 简称
- Display Text 必须符合 E 列模版结构；【】不得用 NA（缺料写 [待补: …]）；不要编造 outline 没有的答案
- CMP-13 选项按 outline 实际条数填写（至少 2 个）；不要用 NA 把 A/B/C 凑满；缺项写 [待补: 选项]
- 填 DisplayText 时按 **组件类型** 解析 outline（选择题≠学习目标≠视频叠字）；对照 F 示例 chrome 与 M 设计规范；选项/答案语义正确（单选答案仅一字母）
- Display Image / Video Play 从 catalog N/O 列带出默认值（不需要媒体写 NA；需要则写前端字段名+TBC）；不要改成空字符串
- Kai Script 1/2、Feedback、Transition Script 必须是 Kai 老师口播（可中英混），禁止组件名/教学目的/「视频播放」等标注；姓名用 [User Name]
- 口播里禁止舞台说明与说话人标签：不要写「Kai shows Tom」「Kai:」「Student:」「Screen:」；只写 Kai 要念出来的句子
- 口播里禁止使用破折号「—」或「–」（TTS 会读坏）；停顿用句号或逗号
- 有学生作答互动才填 Script 2 / Feedback；纯观看/继续按钮则 Script2+Feedback 留空
- Knowledge point 只从 v0.2 元信息知识点库中挑本行 outline 实际涉及的条目，并标注类别（有则写、无则省略）：Word / Grammar / Phrase / Pattern / SocialExpression / Pinyin；禁止把整课库抄进每一步；格式如 Word: …\\nGrammar: …
只输出 JSON 数组，每项含 keys: scriptStep(number), componentId, displayText, kaiScript1, kaiScript2, feedbackCorrect, feedbackWrong, transitionScript, knowledgePoint。
不要输出 step 字段（Step 已由 activity 标题锁定）。
不要 Markdown 围栏。`

type LlmRowPatch = {
  scriptStep?: number
  componentId?: string
  step?: string
  displayText?: string
  kaiScript1?: string
  kaiScript2?: string
  feedbackCorrect?: string
  feedbackWrong?: string
  transitionScript?: string
  knowledgePoint?: string
}

function parseLlmPatches(text: string): LlmRowPatch[] {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < start) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1)) as LlmRowPatch[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function applyPatch(
  row: N3Row,
  patch: LlmRowPatch,
  interactive: boolean,
  lockStep?: boolean,
): N3Row {
  const next = { ...row }
  // Step 优先锁定为 v0.3.1 activity 标题
  if (!lockStep && patch.step?.trim()) {
    next.Step = patch.step.trim().slice(0, 80)
  }
  if (patch.displayText?.trim()) next.DisplayText = patch.displayText.trim()
  if (patch.kaiScript1?.trim()) next['Kai Script 1'] = patch.kaiScript1.trim()
  if (interactive) {
    if (patch.kaiScript2?.trim()) next['Kai Script 2'] = patch.kaiScript2.trim()
    if (patch.feedbackCorrect?.trim()) {
      next['Kai Feedback Script - Correct'] = patch.feedbackCorrect.trim()
    }
    if (patch.feedbackWrong?.trim()) {
      next['Kai Feedback Script - Wrong'] = patch.feedbackWrong.trim()
    }
  } else {
    next['Kai Script 2'] = ''
    next['Kai Feedback Script - Correct'] = ''
    next['Kai Feedback Script - Wrong'] = ''
  }
  if (patch.transitionScript?.trim()) {
    next['Transition Script'] = patch.transitionScript.trim()
  }
  if (patch.knowledgePoint?.trim()) {
    next['Knowledge point'] = patch.knowledgePoint.trim()
  }
  next['Display Image'] = mediaDefault(next.Component, 'displayImage')
  next['Video Play'] = mediaDefault(next.Component, 'videoPlay')
  return withKaiSpeechSanitized(next)
}

/** @deprecated use parseSteppedScript — kept for tests */
export function parseV03Tables(md: string): MappedStep[] {
  return parseSteppedScript(md)
}

export type N3Result = NodeEngineResult & {
  phaseFiles: Record<string, string>
}

export async function runN3(input: {
  missionName: string
  steppedMd: string
  scriptMd?: string
  /** v0.2 phased script — 元信息知识点库（Word/Grammar/Phrase/Pattern/SocialExpression/Pinyin） */
  phasedMd?: string
  /**
   * Optional activity titles keyed by `scriptStep.seq` (1-based component index),
   * from v0.3.1. When present, becomes the Step label.
   */
  activityTitles?: Record<string, string>
}): Promise<N3Result> {
  loadCatalogComponents()
  let steps = parseSteppedScript(input.steppedMd)
  const steppedHasCmps = steps.some((s) => s.components.length > 0)
  if (!steppedHasCmps) steps = parseV03Tables(input.steppedMd)
  const knowledge = parseMissionKnowledge(input.phasedMd || '')
  const missionGoals = extractMissionGoalsFromPhased(input.phasedMd || '')
  const activityTitles = input.activityTitles || {}

  type Built = {
    phase: string
    scriptStep: number
    cmpId: string
    row: N3Row
    missionStepId: string
    interactive: boolean
    outline: string
    purpose: string
    activityTitle: string
  }

  const built: Built[] = []
  for (const step of steps) {
    const total = step.components.length
    let seq = 0
    for (const c of step.components) {
      seq += 1
      const missionStepId = `${step.scriptStep}.${seq}`
      const activityTitle =
        activityTitles[missionStepId] ||
        activityTitleFromOutline(c.outline) ||
        ''
      const row = buildHeuristicRow({
        phase: step.phase,
        scriptStep: step.scriptStep,
        scriptName: step.name,
        purpose: step.purpose,
        cmpId: c.id,
        outline: c.outline,
        indexInStep: seq,
        totalInStep: total,
        missionName: input.missionName,
        topic: undefined,
        knowledge,
        missionGoals,
        activityTitle,
      })
      built.push({
        phase: step.phase,
        scriptStep: step.scriptStep,
        cmpId: c.id,
        row,
        missionStepId,
        interactive: hasStudentInteraction(c.id),
        outline: c.outline,
        purpose: step.purpose,
        activityTitle,
      })
    }
  }

  let provider: string = 'deterministic'
  let fallbackReason: string | undefined

  if (process.env.N3_USE_LLM === '1' && built.length) {
    try {
      const catalogHints = built
        .slice(0, 40)
        .map((b) => {
          const cat = getCatalogComponent(b.cmpId)
          return {
            scriptStep: b.scriptStep,
            componentId: b.cmpId,
            phase: b.phase,
            purpose: b.purpose,
            outline: b.outline,
            template: cat?.template || '',
            example: (cat?.example || '').slice(0, 400),
            interaction: cat?.interaction || '',
            userInput: cat?.userInput || '',
            interactive: b.interactive,
            activityTitle: b.activityTitle || b.row.Step,
            lockedStep: b.row.Step,
            heuristicDisplayText: b.row.DisplayText,
          }
        })
      const llm = await completeMarkdown({
        system: N3_SYSTEM,
        user: [
          `# Mission: ${input.missionName}`,
          `# 待填充行（JSON）`,
          JSON.stringify(catalogHints, null, 2),
          input.phasedMd
            ? `\n# v0.2 元信息/核心词汇句型\n${input.phasedMd.slice(0, 2500)}`
            : '',
          input.scriptMd
            ? `\n# v0.1 原文摘录\n${input.scriptMd.slice(0, 2000)}`
            : '',
        ].join('\n'),
        temperature: 0.25,
      })
      const patches = parseLlmPatches(llm.text)
      for (const b of built) {
        const patch =
          patches.find(
            (p) =>
              Number(p.scriptStep) === b.scriptStep &&
              (p.componentId || '').toUpperCase() === b.cmpId,
          ) ||
          patches.find(
            (p) => (p.componentId || '').toUpperCase() === b.cmpId,
          )
        if (patch) {
          b.row = applyPatch(b.row, patch, b.interactive, Boolean(b.activityTitle))
        }
      }
      provider = llm.provider
    } catch (err) {
      provider = 'deterministic'
      fallbackReason =
        err instanceof LlmUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
    }
  }

  const phaseFiles: Record<string, string> = {}
  let total = 0
  const parts: string[] = [
    `# ${input.missionName} — v0.4 component content (bundle)`,
    ``,
    `> P1–P4 合集；13 字段对齐 mission_spec_schema / meta model v0.4.5；1 Component = 1 Step = 1 行`,
    `> provider: ${provider}${fallbackReason ? ` · fallback: ${fallbackReason.slice(0, 120)}` : ''}`,
    ``,
  ]

  for (const phase of ['P1', 'P2', 'P3', 'P4'] as const) {
    const phaseRows = built
      .filter((b) => b.phase === phase)
      .map((b) => ({
        row: b.row,
        missionStepId: b.missionStepId,
        cmpId: b.cmpId,
      }))
    const { md, count } = renderPhaseFile(input.missionName, phase, phaseRows)
    phaseFiles[phase] = md
    total += count
    parts.push(
      `# ===== ${phase} · v0.4_component_content_${phase.toLowerCase()}.md =====`,
      '',
      md,
      '',
    )
  }

  const decisions: DecisionCreate[] = []
  if (total === 0) {
    decisions.push({
      node: 'N3',
      targetType: 'mission',
      type: 'edit_required',
      severity: 'blocking',
      question: '未解析出任何 mission step。是否回到 N2？',
      options: [
        { id: 'rerun_n2', label: 'Reject 并回到 N2', recommended: true },
        { id: 'accept', label: '接受空输出' },
      ],
      aiRationale: 'N3 依赖 v0.3',
    })
  } else {
    decisions.push({
      node: 'N3',
      targetType: 'mission',
      type: 'confirm',
      severity: 'info',
      question: `Checkpoint：已生成 ${total} 行（13 字段）。请核对 Display Text / Kai 脚本 / KP；Image·Video 为 catalog 默认（NA 或字段+TBC）。`,
      options: [{ id: 'ack', label: '已开始核对', recommended: true }],
      aiRationale: 'mission_phase_step_meta_model v0.4.5',
    })
  }

  if (fallbackReason) {
    decisions.push({
      node: 'N3',
      targetType: 'mission',
      type: 'warning_ack',
      severity: 'deferrable',
      question: `N3 LLM 未使用，已用启发式填充。原因：${fallbackReason.slice(0, 200)}`,
      options: [{ id: 'ok', label: '知道了', recommended: true }],
      aiRationale: 'N3_USE_LLM fallback',
    })
  }

  return {
    content: parts.join('\n'),
    decisions,
    meta: {
      provider,
      missionStepCount: total,
      schemaFields: 13,
      fallbackReason,
    },
    phaseFiles,
  }
}
