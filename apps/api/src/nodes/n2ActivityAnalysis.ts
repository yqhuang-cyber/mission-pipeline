import type { DecisionCreate } from '@mission-pipeline/shared'
import {
  COMPONENT_NAMES,
  PHASE_ALLOWED,
  isAllowed,
  type PhaseId,
} from '../master/eligibility.js'
import { loadCatalogComponents } from '../master/catalog.js'
import { parsePhasedScript } from '../validators/n1.js'
import type { NodeEngineResult } from './n1.js'
import { outlineFromBody } from './n2.js'
import type { MappedStep } from '../validators/n2.js'
import { hasFocusLemma } from './mcqFocus.js'

export { hasFocusLemma } from './mcqFocus.js'

export type ActivityCandidate = {
  id: string
  nameZh: string
  rationale: string
  recommended?: boolean
  fromN1?: boolean
}

export type ActivityDraft = {
  id: string
  title: string
  intent: string
  sourceAnchor: string
  candidates: ActivityCandidate[]
  selectedComponentId: string
  /** CD-facing selection thinking (why these CMPs fit / don't). */
  selectionThinking?: string
}

export type StepActivityAnalysis = {
  phase: PhaseId
  scriptStep: number
  name: string
  purpose: string
  activities: ActivityDraft[]
}

export type V031Document = {
  version: 'v0.3.1'
  missionName: string
  steps: StepActivityAnalysis[]
}

type RawChunk = { title: string; text: string }

/**
 * Pedagogical fit thinking (mirrors CD review with catalog + prototypes):
 * 1) What must this activity PRESENT / DO?
 * 2) Does catalog E (template) have slots that can carry that content?
 * 3) Does catalog J (purpose) match the teaching move?
 * 4) Is K/L interaction appropriate (e.g. pure sentence contrast ≠ 单项选择)?
 */
type ActivityNeed =
  | 'contrast_sentences'
  | 'meaning_choice_direct'
  | 'meaning_choice_focus'
  | 'listen_choose'
  | 'watch'
  | 'listen_repeat'
  | 'pattern_discover'
  | 'pattern_formula'
  | 'lemma_visual'
  | 'assemble'
  | 'dialogue'
  | 'prompted_say'
  | 'mission'
  | 'generic'

/** 锚点里已经写出观察结果：Country + 人 / 中国 + 人 → 中国人 */
function hasStatedPattern(text: string): boolean {
  const t = text.replace(/\s+/g, ' ')
  if (/Country\s*\+\s*人/i.test(t)) return true
  if (/[\u4e00-\u9fff]+\s*\+\s*[\u4e00-\u9fff]+\s*→/.test(t)) return true
  if (/[\u4e00-\u9fff]+\s*→\s*[\u4e00-\u9fff]+的/.test(t) && !/→\s*\?/.test(t)) {
    return true
  }
  return false
}

/** Story 进场 + Friend 1/2/3 同任务多轮 = 一套角色扮演，不是句型对比或看开场故事 */
function isRolePlaySet(text: string): boolean {
  const t = text.replace(/\*\*/g, '')
  if (/opening\s+story|context\s+story|Opening story plays/i.test(t)) {
    return false
  }
  const rounds = (t.match(/Friend\s+\d+\s*\(/gi) || []).length
  if (rounds >= 2) return true
  if (
    /Friend\s+\d+\s*\((?:Full|Reduced|Minimal)\s+Support\)/i.test(t) &&
    /On Screen|Student decides|take the lead/i.test(t)
  ) {
    return true
  }
  if (
    /^\s*Story\b/im.test(t) &&
    /Friend\s+\d+/i.test(t) &&
    /Student\b/i.test(t)
  ) {
    return true
  }
  return false
}

function detectActivityNeed(
  title: string,
  text: string,
  purpose: string,
): ActivityNeed {
  // Trust pedagogical titles after naming (strongest signal)
  if (/对比已学|对比两句|并排观察/i.test(title)) return 'contrast_sentences'
  if (/听辨练习/i.test(title)) {
    return hasFocusLemma(title, text)
      ? 'meaning_choice_focus'
      : 'listen_choose'
  }
  if (/听后含义推断|含义推断|观后理解/i.test(title)) {
    return hasFocusLemma(title, text)
      ? 'meaning_choice_focus'
      : 'meaning_choice_direct'
  }
  // 单元意图可以是「发现规律」，但本活动若已是「标出语素 + 单选」，按选择题走
  if (
    /Choices:|Student\s+chooses|选项/i.test(text) &&
    hasFocusLemma(title, text)
  ) {
    return 'meaning_choice_focus'
  }
  if (/探索「|发现「的」/i.test(title) && /Choices:|Student\s+chooses|选项/i.test(text)) {
    return 'meaning_choice_focus'
  }
  if (/情境回放|观看开场|例证输入/i.test(title)) return 'watch'
  if (/看图/i.test(title)) return 'watch'
  if (/聚焦知识点/i.test(title)) return 'lemma_visual'
  if (/听音跟读/i.test(title)) return 'listen_repeat'
  if (/句型规律识别|句型呈现|呈现构词|总结构词/i.test(title)) return 'pattern_formula'
  if (/发现构词|句型观察/i.test(title)) {
    return hasStatedPattern(text) ? 'pattern_formula' : 'pattern_discover'
  }
  if (/构建「|词块造句/i.test(title)) return 'assemble'
  if (/指人说/i.test(title)) return 'prompted_say'
  if (/对话练习|角色扮演/i.test(title)) return 'dialogue'
  if (/综合练习/i.test(title) && isRolePlaySet(text)) return 'dialogue'
  if (/迁移：/i.test(title)) return 'dialogue'
  if (isRolePlaySet(text)) return 'dialogue'
  if (/发布 Mission|Mission/i.test(title)) return 'mission'

  const hay = `${title}\n${text}\n${purpose}`
  if (/Two questions|区分.*问句/i.test(hay)) {
    if (
      !/Listen and choose|Kai asks:[\s\S]*Student chooses/i.test(text) &&
      !isRolePlaySet(text)
    ) {
      return 'contrast_sentences'
    }
  }
  if (
    /你叫什么名字[\s\S]*你是哪国人|你是哪国人[\s\S]*你叫什么名字/i.test(text) &&
    !/Student chooses|Choices:|Listen and choose/i.test(text) &&
    !isRolePlaySet(text)
  ) {
    return 'contrast_sentences'
  }
  if (/Choices:|Student\s+chooses|单项选择/i.test(hay)) {
    return hasFocusLemma(title, text)
      ? 'meaning_choice_focus'
      : 'meaning_choice_direct'
  }
  if (hasStatedPattern(text)) return 'pattern_formula'
  return 'generic'
}

function extractContrastPair(text: string): string | null {
  const q = [
    ...text.matchAll(/[「"]?([\u4e00-\u9fff]{2,12}[？?])[」"]?/g),
  ].map((m) => m[1]!)
  const uniq = [...new Set(q)]
  if (uniq.length >= 2) return `「${uniq[0]}」与「${uniq[1]}」`
  if (/你叫什么名字/.test(text) && /你是哪国人/.test(text)) {
    return '「你叫什么名字？」与「你是哪国人？」'
  }
  return null
}

type FitResult = { score: number; rationale: string }

/** Score one catalog component against an activity need (template + purpose + interaction). */
function fitComponentToNeed(
  need: ActivityNeed,
  c: {
    id: string
    purpose: string
    template: string
    interaction: string
    nameZh: string
  },
  contrastPair: string | null,
): FitResult | null {
  const tpl = c.template || ''
  const purpose = c.purpose || ''
  const inter = c.interaction || ''
  const exampleSlots = (tpl.match(/【例句】/g) || []).length
  const hasLeftRight = /【左侧】|【右侧】/.test(tpl)
  const isChoiceUi =
    /【A】|【B】|【答案】/.test(tpl) ||
    /选择/.test(inter) ||
    /^(CMP-13|CMP-33|CMP-02)$/.test(c.id)
  const pair = contrastPair || '两句目标表达'

  if (need === 'contrast_sentences') {
    // Thinking: activity must SHOW two sentences for comparison — not quiz first.
    if (isChoiceUi) {
      return {
        score: -12,
        rationale: `不适合：活动要并排对比${pair}，单项选择是判断练习而非对比展示`,
      }
    }
    if (exampleSlots >= 2) {
      return {
        score: 22,
        rationale: `适合：模版有 ${exampleSlots} 个【例句】槽，可并排呈现${pair}供观察对比；目的「${clip(purpose, 28)}」`,
      }
    }
    if (hasLeftRight) {
      return {
        score: 18,
        rationale: `适合：左右例句+公式支架，可对照${pair}并点出结构差异`,
      }
    }
    if (c.id === 'CMP-10' || (/【汉字】/.test(tpl) && /图文/.test(c.nameZh))) {
      return {
        score: 11,
        rationale: `可用：图文卡可承载对比文案，但原型偏单点聚焦，两句并排略勉强`,
      }
    }
    if (/对比|发现结构|观察/.test(purpose)) {
      return {
        score: 8,
        rationale: `部分适合：catalog 目的含观察/对比，模版槽位不如多例句组件直观`,
      }
    }
    return null
  }

  if (need === 'listen_choose') {
    // 听辨：听完直接选题，通常没有要放大的焦点词
    if (c.id === 'CMP-33') {
      return {
        score: 18,
        rationale: `适合：听辨后直接选题，CMP-33 题干+选项即可，无需【焦点】放大框`,
      }
    }
    if (c.id === 'CMP-13') {
      return {
        score: 7,
        rationale: `次选：CMP-13 左侧会放大焦点词，本题没有要标识的知识点`,
      }
    }
    if (isChoiceUi) {
      return {
        score: 9,
        rationale: `适合：模版含选项/答案，可做听辨选择`,
      }
    }
    return null
  }

  if (need === 'meaning_choice_direct') {
    // 直接理解题（老师在问什么 / 听到几个国家）— 不要 CMP-13 焦点框
    if (c.id === 'CMP-33') {
      return {
        score: 20,
        rationale: `适合：直接理解题，题干没有要放大的知识点；CMP-33 只有题目+选项`,
      }
    }
    if (c.id === 'CMP-13') {
      return {
        score: 5,
        rationale: `不太适合：CMP-13 左侧有【焦点】放大框，本题是整句理解而非猜某个词`,
      }
    }
    if (isChoiceUi) {
      return {
        score: 8,
        rationale: `可用：能选题，但传统选择题（CMP-33）更贴切`,
      }
    }
    return null
  }

  if (need === 'meaning_choice_focus') {
    if (c.id === 'CMP-13') {
      return {
        score: 20,
        rationale: `适合：听辨在识别目标问句/词的功能，CMP-13【焦点】可标出该知识点`,
      }
    }
    if (c.id === 'CMP-33') {
      return {
        score: 8,
        rationale: `可用：能做选择，但无焦点槽，弱化目标词`,
      }
    }
    if (isChoiceUi) {
      return {
        score: 10,
        rationale: `适合：模版含选项/答案，匹配含义判断`,
      }
    }
    return null
  }

  if (need === 'lemma_visual') {
    // 一张图把一个知识点说清楚（国旗/地图 + 「英国人」）→ 图文卡，不是纯大图、也不是句型规律
    if (c.id === 'CMP-10' || (/【汉字】/.test(tpl) && /图文/.test(c.nameZh))) {
      return {
        score: 22,
        rationale: `适合：用图表意、用【汉字】【拼音】标出该知识点；CMP-10 图文卡正是这一下`,
      }
    }
    if (c.id === 'CMP-29') {
      return {
        score: 8,
        rationale: `可用：能讲这个词，但词汇卡偏释义/部首，弱化「图→义」`,
      }
    }
    if (c.id === 'CMP-09') {
      return {
        score: 5,
        rationale: `不太适合：全屏大图没有汉字槽，图能到、知识点标不出来`,
      }
    }
    if (exampleSlots >= 2 || hasLeftRight) {
      return {
        score: 3,
        rationale: `不太适合：本活动只标一个知识点配图，不是多句对照发现规律`,
      }
    }
    return null
  }

  if (need === 'pattern_discover') {
    // 只有例句、先让学生自己看：CMP-11；右侧公式会提前灌输
    if (c.id === 'CMP-11' || (exampleSlots >= 2 && !hasLeftRight)) {
      return {
        score: 20,
        rationale: `适合：多句对照让学生自己发现，CMP-11 只有【例句】槽、不提前给公式`,
      }
    }
    if (c.id === 'CMP-07' || hasLeftRight) {
      return {
        score: 8,
        rationale: `次选：能挂例句，但右侧公式会把规律说破，偏早`,
      }
    }
    if (/发现结构|规律/.test(purpose)) {
      return {
        score: 6,
        rationale: `部分适合：catalog 目的含观察/规律`,
      }
    }
    return null
  }

  if (need === 'pattern_formula') {
    // 已经有观察结果（Country + 人）：左侧例句 + 右侧公式 → CMP-07
    if (c.id === 'CMP-07' || hasLeftRight) {
      return {
        score: 22,
        rationale: `适合：锚点已有句型结果；CMP-07 左侧挂例句、右侧挂公式（如 Country + 人）`,
      }
    }
    if (c.id === 'CMP-11' || exampleSlots >= 2) {
      return {
        score: 7,
        rationale: `不太适合：CMP-11 只有例句槽，没有右侧公式位，观察结果挂不上去`,
      }
    }
    return null
  }

  if (need === 'prompted_say') {
    if (c.id === 'CMP-24' || /单轮|口语作答/.test(c.nameZh)) {
      return {
        score: 18,
        rationale: `适合：单轮情境口语，匹配「看提示→说出目标句」`,
      }
    }
    if (c.id === 'CMP-25' || /视觉口语|看图/.test(c.nameZh)) {
      return {
        score: 12,
        rationale: `可用：视觉线索促说，但模版偏选择/快答`,
      }
    }
    if (c.id === 'CMP-35' || /发音/.test(c.nameZh)) {
      return {
        score: 8,
        rationale: `可用：可练目标句发音，但弱化意义→形式产出`,
      }
    }
    if (c.id === 'CMP-08') {
      return {
        score: -6,
        rationale: `不太适合：脚本是意义提示后自说，不是先听标准音跟读`,
      }
    }
  }

  if (need === 'dialogue') {
    if (c.id === 'CMP-15' || /角色扮演/.test(c.nameZh)) {
      return {
        score: 22,
        rationale: `适合：同一交际任务多轮对话（Story 只是进场，Friend 1/2/3 是支架递减），CMP-15 角色扮演`,
      }
    }
    if (c.id === 'CMP-19') {
      return {
        score: 8,
        rationale: `次选：开放任务偏真实表现段；这里是带支架的综合练习`,
      }
    }
    if (c.id === 'CMP-24') {
      return {
        score: 6,
        rationale: `不太适合：单轮作答扛不住多轮欢迎对话`,
      }
    }
    if (c.id === 'CMP-11' || exampleSlots >= 2) {
      return {
        score: -10,
        rationale: `不适合：两句是对话里先后要说的话，不是并排观察句型`,
      }
    }
    if (c.id === 'CMP-03' || c.id === 'CMP-05' || c.id === 'CMP-01') {
      return {
        score: -8,
        rationale: `不适合：Story / welcome 是扮演进场，不是开场寒暄或看故事`,
      }
    }
  }

  return null
}

function buildSelectionThinking(
  need: ActivityNeed,
  contrastPair: string | null,
  topIds: string[],
): string {
  if (need === 'contrast_sentences') {
    const pair = contrastPair || '两句目标表达'
    return [
      `选型思考：本活动要展示并对比${pair}，让学生观察差异，不是先做选择题。`,
      `因此优先模版能挂多句的组件（句型观察/句型学习/图文卡），下调单项选择。`,
      topIds.length ? `推荐顺序：${topIds.join(' → ')}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (need === 'meaning_choice_direct') {
    return [
      `选型思考：这是直接理解题（问情境/意图），题干里没有要单独标识的知识点。`,
      `CMP-13 左侧有焦点放大框，会空着或硬塞词；因此优先 CMP-33 传统选择题。`,
      topIds.length ? `推荐顺序：${topIds.join(' → ')}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (need === 'meaning_choice_focus') {
    return [
      `选型思考：题目是在识别某个知识点（新知或旧知），选项对着该点的含义/功能作答，需要把它标出来。`,
      `因此优先 CMP-13（【焦点】放大框），CMP-33 作无焦点备选。`,
      topIds.length ? `推荐顺序：${topIds.join(' → ')}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (need === 'lemma_visual') {
    return [
      `选型思考：本活动用一张图表意、同时标出一个知识点（如「英国人」），是图文说明而不是纯看图或发现构词规律。`,
      `因此优先 CMP-10 图文卡片；全屏大图（CMP-09）没有汉字槽。`,
      topIds.length ? `推荐顺序：${topIds.join(' → ')}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (need === 'pattern_formula') {
    return [
      `选型思考：锚点里已经写出观察结果（如 Country + 人 / 我 → 我的）。`,
      `CMP-07 左侧挂供观察的句子，右侧挂句型公式；CMP-11 只有例句、没有公式槽。因此优先 CMP-07。`,
      topIds.length ? `推荐顺序：${topIds.join(' → ')}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (need === 'dialogue') {
    return [
      `选型思考：这是一套角色扮演综合练习（Story 进场 + 同一任务多轮，支架递减）。`,
      `对话里先后说出目标句，不是并排对比句型；因此优先 CMP-15，不用 CMP-11。`,
      topIds.length ? `推荐顺序：${topIds.join(' → ')}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

/**
 * Strong boundaries that start a NEW teaching activity.
 * Do NOT split on Choices / Student chooses / Kai Exactly — those belong
 * inside the same comprehension activity as the preceding Audio / question.
 */
const ACTIVITY_START_RE = new RegExp(
  [
    '(?=^(?:\\*\\*)?(?:',
    [
      // NOTE: do NOT split on "Video plays" / "Screen shows" / "Student builds|taps"
      // — those are usually micro-steps inside one pedagogical activity.
      'YOUR MISSION\\b',
      'Replay\\.',
      'How many countries did you hear',
      'What do you notice\\b',
      'Listen and choose\\b',
      // Drill / pronunciation (after meaning check)
      'Your turn\\b',
      'Student repeats\\b',
      'Listen and repeat\\b',
    ].join('|'),
    '))',
  ].join(''),
  'im',
)

/** Chunks that must glue to the previous activity (never standalone) */
const MICRO_HEAD_RE =
  /^(?:\*\*)?(?:Choices|Student\s*choices?|Student\s*chooses|Student\s*selects|Exactly\.?|Perfect\.?|Good\.?|AI pronunciation)/i

const KEYWORD_HINTS: Array<{ re: RegExp; cmps: string[]; label: string }> = [
  { re: /Welcome back|warm\s*up|课前寒暄|课前欢迎/i, cmps: ['CMP-01'], label: '开场寒暄' },
  {
    re: /your\s*mission|mission\s*goals?|start\s*mission|任务发布|学习目标/i,
    cmps: ['CMP-04', 'CMP-32'],
    label: 'Mission / Goals',
  },
  {
    re: /video|视频|opening\s*story|context\s*story|Opening story plays|观看开场/i,
    cmps: ['CMP-03', 'CMP-05', 'CMP-23'],
    label: '观看 / 故事',
  },
  {
    re: /(?:Student\s*choices?|Choices:|单项选择|single[- ]?choice|How many countries|What is the teacher)/i,
    cmps: ['CMP-33', 'CMP-13', 'CMP-02'],
    label: '选择题',
  },
  {
    re: /【焦点】|What do you think\s+[\u4e00-\u9fff]|你觉得.{0,6}[「"“][\u4e00-\u9fff]/i,
    cmps: ['CMP-13', 'CMP-33', 'CMP-02'],
    label: '焦点含义选择',
  },
  {
    re: /listen|跟读|repeat|nǐ|pinyin/i,
    cmps: ['CMP-08'],
    label: '听音跟读',
  },
  {
    re: /Visual:/i,
    cmps: ['CMP-09'],
    label: '看图',
  },
  {
    re: /Country\s*\+\s*人|[\u4e00-\u9fff]+\s*\+\s*[\u4e00-\u9fff]+\s*→|[\u4e00-\u9fff]+\s*→\s*[\u4e00-\u9fff]+的/i,
    cmps: ['CMP-07', 'CMP-11'],
    label: '句型公式',
  },
  {
    re: /句型观察|noticing|对比|两句|Two questions|distinguish|区分/i,
    cmps: ['CMP-11', 'CMP-07', 'CMP-10'],
    label: '句型观察/对比',
  },
  {
    re: /assemble|造句|chunks?|build\s+the/i,
    cmps: ['CMP-12'],
    label: '词块造句',
  },
  {
    re: /dialogue|对话|role\s*play|Friend\s+\d+\s*\(|use\s+before/i,
    cmps: ['CMP-15', 'CMP-19'],
    label: '对话 / 表演',
  },
  {
    re: /match|匹配|drag|拖拽/i,
    cmps: ['CMP-06'],
    label: '匹配',
  },
  {
    re: /board|mission\s*play|performance|真实任务/i,
    cmps: ['CMP-18', 'CMP-19', 'CMP-24'],
    label: '任务板 / 表演',
  },
  {
    re: /takeaway|summary|key\s*point|总结|收获|today\s+you\s+can/i,
    cmps: ['CMP-21', 'CMP-26', 'CMP-22', 'CMP-36'],
    label: '总结收束',
  },
  {
    re: /vocab|词汇|word\s*card/i,
    cmps: ['CMP-29', 'CMP-10'],
    label: '词汇',
  },
]

function parseSuggestedCmps(line: string): string[] {
  return [...line.matchAll(/CMP-\d+/gi)].map((m) => m[0]!.toUpperCase())
}

function clip(s: string, max = 220): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  let cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  if (sp > max * 0.55) cut = cut.slice(0, sp)
  return `${cut}…`
}

function stripQuotePrefixes(body: string): string {
  return body
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
}

/** Meaningful activity title — never raw stage directions like "Audio:" / "Choices:" */
export function nameActivity(
  text: string,
  purpose: string,
  index: number,
): string {
  const t = text.replace(/\*\*/g, '')

  if (
    /YOUR MISSION|START MISSION/i.test(t) &&
    (/✓|goals?/i.test(t) || /Mission/i.test(t))
  ) {
    return '发布 Mission 与学习目标'
  }
  if (/Welcome back|Warm\s*Up|课前寒暄/i.test(t) && !/YOUR MISSION/i.test(t)) {
    return '课前欢迎与导入'
  }
  if (
    /Video\s+plays/i.test(t) ||
    (/opening story|王老师/i.test(t) && /Video\s+ends/i.test(t))
  ) {
    return '观看开场故事'
  }
  if (/How many countries did you hear/i.test(t)) {
    return '观后理解检测'
  }
  // Discovery: aggregated replay (no flag screens) vs legacy combined example input
  if (
    /Replay\.?|Then\s+replay/i.test(t) &&
    !/Screen shows/i.test(t) &&
    !/What do you notice|Student chooses|Choices:/i.test(t)
  ) {
    return '情境回放聚焦目标知识点'
  }
  {
    const focusLemma = extractFocusLemma(t)
    if (
      focusLemma &&
      /Screen shows|Audio:/i.test(t) &&
      !/What do you notice|Student chooses|Student builds:/i.test(t) &&
      !/Then\s+replay|Then\s+[A-Z][a-z]+\.|^\s*Replay\./im.test(t)
    ) {
      return `聚焦知识点「${focusLemma}」`
    }
  }
  // Legacy combined Replay+flags (should be rare after regroup)
  if (
    /Replay\.?/i.test(t) &&
    /Screen shows|\bflag\b|国旗/i.test(t) &&
    !/What do you notice|Student chooses|Choices:/i.test(t)
  ) {
    return '例证输入：国家人'
  }
  if (
    /Replay\.?/i.test(t) &&
    /Freeze/i.test(t) &&
    !/Student chooses|Student selects|Choices:/i.test(t)
  ) {
    return '情境回放聚焦目标知识点'
  }
  if (
    /Visual:/i.test(t) &&
    !/Highlight:|Choices:|Student chooses|Replay[.:]/i.test(t)
  ) {
    return /同学/.test(t) ? '看图：对照「同学」' : '看图'
  }
  // Pattern noticing (guided discover) — not the later formula Screen
  if (
    /What do you notice|Student taps/i.test(t) &&
    !/[\u4e00-\u9fff]+\s*\+\s*人\s*→/.test(t)
  ) {
    return '发现构词规律'
  }
  // Explicit pattern formula after discovery (中国 + 人 → 中国人)
  if (
    /(?:[\u4e00-\u9fff]+\s*\+\s*人\s*→|Country\s*\+\s*人|国家\s*\+\s*人)/i.test(
      t,
    ) &&
    !/What do you notice|Student chooses|Choices:|Student builds:/i.test(t)
  ) {
    return '句型规律识别'
  }
  // Complete paradigm screen (我 → 我的) — not the predict/build trial
  if (
    /[\u4e00-\u9fff]+\s*→\s*[\u4e00-\u9fff]+的/.test(t) &&
    !/Student builds:|Choices:|Student chooses|Can you predict|→\s*\?/i.test(t)
  ) {
    return '句型呈现'
  }
  if (/Country\s*\+\s*人|国家\s*\+\s*人/i.test(t) && /Student taps/i.test(t)) {
    return '发现构词规律'
  }
  // Listen-and-choose BEFORE Choices→含义推断 (enrichment injects Choices:)
  if (/Listen and choose|Kai asks:[\s\S]*Student chooses/i.test(t)) {
    if (/你叫什么名字/.test(t) && !/你是哪国人/.test(t)) {
      return '听辨练习：问名字'
    }
    if (/你是哪国人/.test(t) && !/你叫什么名字/.test(t)) {
      return '听辨练习：问国籍'
    }
    if (/你叫什么名字/.test(t) && /你是哪国人/.test(t)) {
      return '听辨练习：名字问句 vs 国籍问句'
    }
    const q = /Kai asks:?\s*\n\s*([^\n？?]+[？?]?)/i.exec(t)
    if (q?.[1]) return `听辨练习：${clip(q[1].trim(), 18)}`
    return '听辨练习'
  }
  if (
    (/Audio:/i.test(t) ||
      /What is the teacher|What is .+ asking|What do you think/i.test(t)) &&
    (/Choices:|Student\s*choices?|Student chooses|Student selects/i.test(t))
  ) {
    if (/Highlight:\s*的|的 is doing|你的\s*我的|表所属/i.test(t)) {
      return '发现「的」表所属'
    }
    if (/朋友/.test(t) && !/Highlight:\s*的/i.test(t)) return '探索「朋友」含义'
    return '听后含义推断'
  }
  if (
    /Choices:|Student\s*choices?/i.test(t) &&
    /Student chooses|Student selects/i.test(t)
  ) {
    if (/Highlight:\s*的|的 is doing|你的\s*我的/i.test(t)) return '发现「的」表所属'
    if (/朋友/.test(t)) return '探索「朋友」含义'
    if (/他是___|她是哪国人|ask about him/i.test(t)) return '迁移：用他/她问国籍'
    return '含义推断选择题'
  }
  if (
    /Your turn|Student repeats|AI pronunciation|Listen and repeat|跟读|nǐ shì|péng you/i.test(
      t,
    )
  ) {
    return '听音跟读目标句'
  }
  if (/Screen shows[\s\S]*Student builds|Student builds:[\s\S]*\+ 人/i.test(t)) {
    const m = /(?:China|America|UK|中国|美国|英国)/i.exec(t)
    if (m) {
      const map: Record<string, string> = {
        China: '中国人',
        中国: '中国人',
        America: '美国人',
        美国: '美国人',
        UK: '英国人',
        英国: '英国人',
      }
      const label = map[m[0]!] || m[0]
      return `构建「${label}」`
    }
    return '词块造句练习'
  }
  if (/Student builds|chunks?|造句|Build the/i.test(t)) {
    return '词块造句'
  }
  // Prompted say-it after showing a person (meaning → Chinese form)
  if (
    /Kai shows\s+[A-Za-z]+/i.test(t) &&
    (/Say it|Student:\s*/i.test(t) || /他是|她是|也是/.test(t))
  ) {
    const plain = t.replace(/\*\*/g, '')
    const said =
      /Student:\*{0,2}\s*\n?\s*([^\n]+)/i.exec(plain)?.[1]?.trim() ||
      /(他是[\u4e00-\u9fff]+人|她是[\u4e00-\u9fff]+人|她也是[\u4e00-\u9fff]+人)/.exec(
        plain,
      )?.[1]
    if (said && /[\u4e00-\u9fff]/.test(said)) {
      return `指人说「${clip(said.replace(/[。.!！]/g, ''), 16)}」`
    }
    const who = /Kai shows\s+([A-Za-z]+)/i.exec(plain)?.[1]
    return who ? `指人说国籍（${who}）` : '指人说国籍'
  }
  if (
    /Kai asks student/i.test(t) &&
    /你是哪国人/i.test(t) &&
    !/Kai shows/i.test(t)
  ) {
    return '对话练习：说出自己的国籍'
  }
  if (isRolePlaySet(t)) {
    return /meet your new friends|welcome them|Friend\s+\d+/i.test(t)
      ? '角色扮演：欢迎新同学'
      : '角色扮演综合练习'
  }
  if (
    /Screen:/i.test(t) &&
    /你叫什么名字|你是哪国人/i.test(t) &&
    (/Two questions|对比|区分/i.test(t) || purpose.includes('区分'))
  ) {
    return '对比已学问句'
  }
  if (/的|朋友|belong|friend/i.test(t) && /Choices:|Highlight/i.test(t)) {
    if (/朋友/.test(t)) return '探索「朋友」含义'
    if (/Highlight:\s*的|你的|我的/i.test(t)) return '发现「的」表所属'
    return '关键语素含义探索'
  }
  if (/他是___|她是哪国人|ask about him|ask about her/i.test(t)) {
    return '迁移：用他/她问国籍'
  }
  if (/role\s*play|dialogue|对话练习|Use before|Kai asks student/i.test(t)) {
    return '对话练习'
  }
  if (/takeaway|Today you can|Key takeaway|总结/i.test(t)) {
    return '总结与收获'
  }

  if (purpose) {
    const short = purpose.split(/[，。；;]/)[0]?.trim() || purpose
    return clip(short, 28)
  }
  return `教学活动 ${index + 1}`
}

function mergeMicroChunks(parts: string[]): string[] {
  const out: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const head = trimmed.replace(/^\*\*/, '').trim()
    if (out.length && MICRO_HEAD_RE.test(head)) {
      out[out.length - 1] = `${out[out.length - 1]}\n\n${trimmed}`
      continue
    }
    if (
      out.length &&
      /Student chooses|Student selects/i.test(out[out.length - 1]!) &&
      /^Kai:/i.test(head) &&
      trimmed.length < 220
    ) {
      out[out.length - 1] = `${out[out.length - 1]}\n\n${trimmed}`
      continue
    }
    out.push(trimmed)
  }
  return out
}

function refineComprehensionBoundaries(parts: string[]): string[] {
  const out: string[] = []
  for (const cur of parts) {
    const isSetupOnly =
      /Listen again/i.test(cur) &&
      !/Choices:|Student chooses/i.test(cur) &&
      !/Video\s+plays|YOUR MISSION|Replay\./i.test(cur.slice(0, 40))
    if (isSetupOnly && out.length && /Replay\.?/i.test(out[out.length - 1]!)) {
      out[out.length - 1] = `${out[out.length - 1]}\n\n${cur}`
      continue
    }
    out.push(cur)
  }
  return out
}

/** Replay / Visual / Highlight start new activities; don't split notice+Highlight. */
function splitSceneKeywords(text: string): string[] {
  if ((text.match(/Screen shows/gi) || []).length >= 2) return [text]
  const bits = text
    .split(
      /(?=(?:\*\*)?(?:Replay[.:]|Then\s+replay\b|Visual:|Highlight:))/i,
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
  if (bits.length < 2) return [text]

  const out: string[] = []
  for (const bit of bits) {
    const head = bit.replace(/\*\*/g, '').trim()
    if (/^Highlight:/i.test(head) && out.length) {
      const prev = out[out.length - 1]!
      if (
        /What do you notice|Student taps/i.test(prev) &&
        !/Replay[.:]\s*$/i.test(prev.replace(/\*\*/g, '').trim())
      ) {
        out[out.length - 1] = `${prev}\n\n${bit}`
        continue
      }
    }
    out.push(bit)
  }
  return out.length >= 2 ? out : [text]
}
function splitReplayFromComprehension(text: string): string[] {
  const normalized = text.replace(/\*\*/g, '').trim()
  const m =
    /^(Replay\.[\s\S]*?(?:Listen again\.?)?)\s*\n+(Audio:\s*[\s\S]*)$/i.exec(
      normalized,
    )
  if (m && /Choices:|Student chooses|What is the teacher/i.test(m[2]!)) {
    // Map back to original slices by locating markers in original text
    const audioAt = text.search(/(?:\*\*)?Audio:/i)
    if (audioAt > 0) {
      return [text.slice(0, audioAt).trim(), text.slice(audioAt).trim()]
    }
    return [m[1]!.trim(), m[2]!.trim()]
  }
  return [text]
}

/** Move trailing Screen + pinyin Audio into the following Your-turn drill */
function attachPreDrillScreen(parts: string[]): string[] {
  const out: string[] = []
  for (const cur of parts) {
    if (
      /^(?:Your turn|Student repeats|Listen and repeat)/i.test(
        cur.replace(/^\*\*/, '').trim(),
      ) &&
      out.length
    ) {
      const prev = out[out.length - 1]!
      const moved =
        /([\s\S]*?)((?:\n|^)(?:\*\*)?Screen:[\s\S]*)$/i.exec(prev)
      if (
        moved &&
        /Audio:/i.test(moved[2]!) &&
        /n[iǐ]|[a-zāáǎàēéěèīíǐìōóǒòūúǔùü]{3,}/i.test(moved[2]!)
      ) {
        out[out.length - 1] = moved[1]!.trim()
        out.push(`${moved[2]!.trim()}\n\n${cur}`)
        continue
      }
    }
    out.push(cur)
  }
  return out.filter((p) => p.trim().length > 0)
}

function mergeWatchPreamble(parts: string[]): string[] {
  if (parts.length < 2) return parts
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i]!
    const next = parts[i + 1]
    const isWatchLeadIn =
      /First,\s*watch|Just notice|Don't try to understand every word/i.test(
        cur,
      ) && !/Video\s+plays|Video\s+ends|王老师|Student chooses|Choices:/i.test(cur)
    if (isWatchLeadIn && next && /Video\s+plays/i.test(next)) {
      out.push(`${cur}\n\n${next}`)
      i++
      continue
    }
    out.push(cur)
  }
  return out
}

/**
 * After Video ends, Kai atmosphere (Hmm / Names. Countries / A lot is happening)
 * belongs with the quiz activity — not the watch activity.
 */
function attachPostWatchAtmosphereToQuiz(parts: string[]): string[] {
  if (parts.length < 2) return parts
  const out = [...parts]
  for (let i = 0; i < out.length - 1; i++) {
    const watch = out[i]!
    const quiz = out[i + 1]!
    if (!/How many countries did you hear/i.test(quiz)) continue
    if (!/Video\s+ends/i.test(watch)) continue
    if (!/Hmm|Names\.|A lot is happening/i.test(watch)) continue

    const veMatch = /Video\s+ends\.?/i.exec(watch)
    if (!veMatch || veMatch.index == null) continue
    const cut = veMatch.index + veMatch[0].length
    const after = watch.slice(cut).trim()
    if (!after || !/(?:\*\*)?Kai:/i.test(after)) continue
    if (!/Hmm|Names\.|A lot is happening/i.test(after)) continue

    out[i] = watch.slice(0, cut).trim()
    out[i + 1] = `${after}\n\n${quiz}`.trim()
  }
  return out
}

/**
 * Parallel "Screen shows X + Student builds" trials → one activity each,
 * with distinct names (构建「中国人」…).
 */
function splitParallelBuilds(text: string): string[] {
  const normalized = text.replace(/\*\*/g, '')
  if (!/(?:Screen shows|Student builds:)/i.test(normalized)) return [text]
  // Don't treat discovery "Screen shows flag + 英国人" input as builds
  if (
    /Replay\.?|Then\s+replay/i.test(normalized) &&
    !/Student builds:/i.test(normalized)
  ) {
    return [text]
  }
  const trials = [
    ...normalized.matchAll(
      /((?:Screen shows[^\n]*\n)?[\s\S]*?Student builds:[\s\S]*?(?:Student says:[\s\S]*?)?(?:Kai:[\s\S]*?)?)(?=(?:Screen shows|Student builds:)|$)/gi,
    ),
  ]
    .map((m) => m[1]!.trim())
    .filter((p) => /Student builds:|Screen shows/i.test(p) && p.length > 15)

  if (trials.length >= 2) {
    // Keep any lead-in before first trial
    const firstIdx = normalized.search(/Screen shows|Student builds:/i)
    const lead = firstIdx > 0 ? normalized.slice(0, firstIdx).trim() : ''
    const parts = trials.slice(0, 5)
    if (lead && lead.length > 40 && !/Student builds:/i.test(lead)) {
      return [lead, ...parts]
    }
    return parts
  }
  return [text]
}

const COUNTRY_PERSON =
  '(?:中国|美国|英国|日本|韩国|法国|德国|西班牙|意大利|加拿大|澳大利亚|俄罗斯)人'

function extractFocusLemma(block: string): string | null {
  const plain = block.replace(/\*\*/g, '')
  const afterScreen = new RegExp(
    `Screen shows[^\\n]*\\n\\s*[^\\n]*?(${COUNTRY_PERSON})`,
    'i',
  ).exec(plain)
  if (afterScreen?.[1]) return afterScreen[1]
  const afterAudio = new RegExp(
    `Audio:\\s*\\n?\\s*(${COUNTRY_PERSON})`,
    'i',
  ).exec(plain)
  if (afterAudio?.[1]) return afterAudio[1]
  const all = [
    ...plain.matchAll(new RegExp(`(${COUNTRY_PERSON})`, 'g')),
  ].map((m) => m[1]!)
  return all.length ? all[all.length - 1]! : null
}

/**
 * Discovery pattern: scattered Replay lines + parallel Screen/Audio focus
 * → 1× 情境回放 + N× 聚焦知识点「X」 (+ discover if still attached).
 * Spec: docs/superpowers/specs/2026-08-12-replay-focus-activity-regroup-design.md
 */
export function expandReplayFocusCluster(text: string): RawChunk[] | null {
  const plain = text.replace(/\*\*/g, '')
  if (!/Replay\.?|Then\s+replay/i.test(plain)) return null
  if ((plain.match(/Screen shows/gi) || []).length < 2) return null

  const lemmasHit = new Set(
    [
      ...plain.matchAll(
        new RegExp(`Screen shows[\\s\\S]{0,80}?(${COUNTRY_PERSON})`, 'gi'),
      ),
    ].map((m) => m[1]!),
  )
  if (lemmasHit.size < 2) return null

  let cluster = text.trim()
  let discoverPart = ''
  const discoverAt = text.search(
    /(?:(?:\*\*)?Kai:\s*\n\s*)?(?:\*\*)?What do you notice\b/i,
  )
  if (discoverAt >= 0) {
    cluster = text.slice(0, discoverAt).trim()
    discoverPart = text.slice(discoverAt).trim()
  }

  const segments = cluster
    .split(
      /(?=(?:\*\*)?(?:Replay\.|Then\s+replay\b|Then\s+[A-Za-z]+\.|Audio:|Screen shows|Screen:(?!\s*shows)))/i,
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  type Piece = {
    kind: 'replay' | 'focus' | 'summary'
    text: string
    lemma?: string
  }
  const pieces: Piece[] = []

  for (const seg of segments) {
    const head = seg.replace(/\*\*/g, '').trim()
    if (/^Screen:/i.test(head) && !/^Screen shows/i.test(head)) {
      pieces.push({ kind: 'summary', text: seg })
      continue
    }
    if (/^(?:Audio:|Screen shows)/i.test(head)) {
      pieces.push({
        kind: 'focus',
        text: seg,
        lemma: extractFocusLemma(seg) || undefined,
      })
      continue
    }
    if (/^(?:Replay\.|Then\s+replay\b|Then\s+[A-Za-z]+\.)/i.test(head)) {
      const focusAt = seg.search(/(?:\*\*)?(?:Audio:|Screen shows)/i)
      if (focusAt > 0) {
        pieces.push({ kind: 'replay', text: seg.slice(0, focusAt).trim() })
        const focusText = seg.slice(focusAt).trim()
        pieces.push({
          kind: 'focus',
          text: focusText,
          lemma: extractFocusLemma(focusText) || undefined,
        })
      } else {
        pieces.push({ kind: 'replay', text: seg })
      }
      continue
    }
    // Freeze / Kai Listen between Replay and Audio — keep with replay
    if (pieces.length && pieces[pieces.length - 1]!.kind === 'replay') {
      pieces[pieces.length - 1]!.text += `\n\n${seg}`
    } else {
      pieces.push({ kind: 'replay', text: seg })
    }
  }

  const replayParts = pieces
    .filter((p) => p.kind === 'replay')
    .map((p) => p.text)
  const focusParts = pieces.filter((p) => p.kind === 'focus')
  const summary = pieces
    .filter((p) => p.kind === 'summary')
    .map((p) => p.text)
    .join('\n\n')

  if (replayParts.length === 0 || focusParts.length < 2) return null

  const ordered: { lemma: string; texts: string[] }[] = []
  for (const f of focusParts) {
    const lemma = f.lemma || extractFocusLemma(f.text)
    if (!lemma) continue
    const last = ordered[ordered.length - 1]
    if (last && last.lemma === lemma) last.texts.push(f.text)
    else ordered.push({ lemma, texts: [f.text] })
  }
  if (ordered.length < 2) return null

  const replayBlob = replayParts.join('\n\n')
  const chunks: RawChunk[] = [
    { title: '情境回放聚焦目标知识点', text: replayBlob },
  ]

  for (let i = 0; i < ordered.length; i++) {
    const o = ordered[i]!
    let body = o.texts.join('\n\n')
    const lineRe = new RegExp(`^.*${o.lemma}.*$`, 'm')
    const line = lineRe.exec(replayBlob.replace(/\*\*/g, ''))
    if (line?.[0] && !body.includes(line[0].trim())) {
      body = `${line[0].trim()}\n\n${body}`
    }
    if (i === ordered.length - 1 && summary) {
      body = `${body}\n\n${summary}`
    }
    chunks.push({
      title: `聚焦知识点「${o.lemma}」`,
      text: body,
    })
  }

  if (discoverPart) {
    for (const part of splitDiscoverFromPatternFormula(discoverPart)) {
      chunks.push({
        title: nameActivity(part, '', chunks.length),
        text: part,
      })
    }
  }

  return chunks
}

/**
 * After guided notice + MCQ, a formula Screen (中国 + 人 → 中国人) is a
 * separate 「句型规律识别」 activity — not more of the same discover unit.
 */
function splitDiscoverFromPatternFormula(text: string): string[] {
  const plain = text.replace(/\*\*/g, '')
  if (!/What do you notice|Student taps|Choices:/i.test(plain)) return [text]
  if (
    !/[\u4e00-\u9fff]+\s*\+\s*人\s*→|Country\s*\+\s*人|国家\s*\+\s*人/i.test(
      plain,
    )
  ) {
    return [text]
  }

  // Note: markers are often **Screen:** — trailing * must be allowed after ':'
  let formulaAt = text.search(
    /(?:\*\*)?Screen:\*{0,2}\s*\n\s*[\u4e00-\u9fff]+\s*\+\s*人\s*→/i,
  )
  if (formulaAt < 0) {
    formulaAt = text.search(
      /(?:\*\*)?Screen:\*{0,2}\s*\n[\s\S]{0,80}?[\u4e00-\u9fff]+\s*\+\s*人\s*→/i,
    )
  }
  if (formulaAt < 0) {
    formulaAt = text.search(/(?:\*\*)?Kai:\*{0,2}\s*\n\s*Country\s*\+\s*人/i)
  }
  if (formulaAt < 80) return [text]

  const before = text.slice(0, formulaAt).trim()
  const after = text.slice(formulaAt).trim()
  if (
    before.length < 40 ||
    after.length < 15 ||
    !/What do you notice|Choices:|Student chooses|Student taps/i.test(before)
  ) {
    return [text]
  }
  return [before, after]
}

/** Connect step: screen contrast vs listen-and-choose practice */
function splitConnectPractice(text: string): string[] {
  if (!/Listen and choose/i.test(text)) return [text]
  const soft = text.split(/(?=Listen and choose)/i)
  if (soft.length >= 2) {
    return soft.map((p) => p.trim()).filter((p) => p.length > 20)
  }
  return [text]
}

/**
 * Parallel listen-and-choose trials (Kai asks → Student chooses)×N
 * → one single-choice activity each (e.g. Name vs Country).
 * Implied options (Name/Country) are surfaced when script omits Choices:.
 */
function splitParallelListenChoose(text: string): string[] {
  const askCount = (text.match(/Kai asks/gi) || []).length
  const chooseCount = (text.match(/Student chooses/gi) || []).length
  if (askCount < 2 || chooseCount < 2) return [text]

  const bits = text
    .split(/(?=(?:\*\*)?Kai asks)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (bits.length < 2) return [text]

  const lead: string[] = []
  const trials: string[] = []
  for (const b of bits) {
    const head = b.replace(/^\*\*/, '').trim()
    if (/^Kai asks/i.test(head)) {
      trials.push(b)
    } else if (trials.length === 0) {
      lead.push(b)
    } else {
      // Trailing Kai feedback stays on the last trial only
      trials[trials.length - 1] = `${trials[trials.length - 1]}\n\n${b}`
    }
  }
  if (trials.length < 2) return [text]

  // Each trial should contain its own Student chooses
  const valid = trials.filter((t) => /Student chooses/i.test(t))
  if (valid.length < 2) return [text]

  const leadText = lead.join('\n\n').trim()
  const listenLead = /Listen and choose/i.test(leadText)
    ? 'Listen and choose.'
    : /Listen and choose/i.test(text)
      ? 'Listen and choose.'
      : ''

  return valid.map((t, i) => {
    let body = t
    // First trial keeps full lead (contrast already split away); later trials
    // keep a short Listen-and-choose cue so each reads as a standalone MCQ.
    if (i === 0 && leadText) body = `${leadText}\n\n${t}`.trim()
    else if (i > 0 && listenLead && !/Listen and choose/i.test(body)) {
      body = `${listenLead}\n\n${t}`.trim()
    }
    return enrichImpliedListenChooseOptions(body)
  })
}

/** When script only shows "Student chooses: Name|Country", surface A/B options. */
function enrichImpliedListenChooseOptions(text: string): string {
  if (/Choices:|选项[：:]/i.test(text)) return text
  if (
    !/Student chooses:\s*(?:\*\*)?\s*(Name|Country)\b/i.test(text)
  ) {
    return text
  }
  return text.replace(
    /((?:\*\*)?Student chooses:)/i,
    '**Choices:**\nA. Name\nB. Country\n\n$1',
  )
}

/** After a completed choice, Student builds starts a new practice activity.
 * If a given-example Screen (我 → 我的) / predict prompt precedes the build,
 * keep that stem with the assemble activity — not the meaning-check. */
function splitPostChoiceBuild(text: string): string[] {
  if (!/Student builds:/i.test(text)) return [text]
  if (!/Student chooses|Student selects/i.test(text)) {
    return [text]
  }
  const buildAt = text.search(/Student builds:/i)
  if (buildAt < 0) return [text]
  const beforeBuild = text.slice(0, buildAt)
  const givenAt = beforeBuild.search(
    /(?:\*\*)?Screen:\*{0,2}\s*(?:\n\s*)?[\u4e00-\u9fff]+\s*→\s*[\u4e00-\u9fff]+的/i,
  )
  const predictAt = beforeBuild.search(/Can you predict/i)
  let cut = buildAt
  if (givenAt >= 0) cut = givenAt
  else if (predictAt >= 0) cut = predictAt
  const before = text.slice(0, cut).trim()
  const after = text.slice(cut).trim()
  if (before.length < 40 || after.length < 15) return [text]
  return [before, after]
}

/**
 * After Student builds + feedback, a complete paradigm Screen
 * (我 → 我的 / 你 → 你的 / …) is a separate 「句型呈现」 — not more of the assemble.
 */
function splitBuildFromPatternPresent(text: string): string[] {
  if (!/Student builds:/i.test(text)) return [text]
  const buildAt = text.search(/Student builds:/i)
  if (buildAt < 0) return [text]
  const rest = text.slice(buildAt)
  const screenRe = /(?:\*\*)?Screen:\*{0,2}\s*(?:\n\s*)?(?=[\u4e00-\u9fff]+\s*→)/gi
  let match: RegExpExecArray | null
  while ((match = screenRe.exec(rest))) {
    if (match.index < 12) continue
    const window = rest.slice(match.index, match.index + 220)
    const complete = (
      window.match(/[\u4e00-\u9fff]+\s*→\s*[\u4e00-\u9fff]+的/g) || []
    ).length
    if (complete >= 2 && !/→\s*\?/.test(window)) {
      const abs = buildAt + match.index
      const before = text.slice(0, abs).trim()
      const after = text.slice(abs).trim()
      if (before.length >= 20 && after.length >= 12) return [before, after]
    }
  }
  return [text]
}

/**
 * Parallel "Kai shows X + English cue + Say it + Student Chinese" trials
 * → one prompted-say activity each (plus optional opening self-Q&A lead-in).
 */
function splitParallelShowSayIt(text: string): string[] {
  const plain = text.replace(/\*\*/g, '')
  const showCount = (plain.match(/(?:Then\s+)?Kai shows\s+[A-Za-z]+/gi) || [])
    .length
  if (showCount < 2) return [text]
  if (
    !/Say it|Student:\s*\n?\s*[\u4e00-\u9fff]|Student:\s*[\u4e00-\u9fff]/i.test(
      plain,
    )
  ) {
    return [text]
  }

  const bits = text
    .split(/(?=(?:Then\s+)?Kai shows\s+[A-Za-z]+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (bits.length < 2) return [text]

  const out: string[] = []
  const lead = bits[0]!
  if (lead.length > 25 && !/^(?:Then\s+)?Kai shows\s+[A-Za-z]+/i.test(lead.replace(/^\*\*/, ''))) {
    out.push(lead)
  } else if (/Kai shows/i.test(lead)) {
    out.push(lead)
  }

  for (const trial of bits.slice(1)) {
    if (
      /Student:|Say it/i.test(trial) ||
      /他是|她是|也是[\u4e00-\u9fff]*人/.test(trial)
    ) {
      out.push(trial)
    }
  }

  return out.length >= 3 ? out.slice(0, 10) : out.length >= 2 ? out : [text]
}

function splitBodyIntoChunks(body: string, purpose: string): RawChunk[] {
  const raw = stripQuotePrefixes(body || '')
  if (!raw || /^\*\(内容待补充\)\*$/i.test(raw) || raw === '（内容待补充）') {
    return [
      {
        title: purpose ? nameActivity(purpose, purpose, 0) : '本步教学活动',
        text: purpose || '（原文待补充）',
      },
    ]
  }

  // Prefer pedagogical regroup: 情境回放 + 聚焦「X」 (+ discover)
  const regrouped = expandReplayFocusCluster(raw)
  if (regrouped) return regrouped.slice(0, 10)

  let parts = raw
    .split(ACTIVITY_START_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)

  // Opening story: watch block vs post-video comprehension check
  if (
    parts.length === 1 &&
    /Video\s+plays/i.test(raw) &&
    /How many countries/i.test(raw)
  ) {
    const soft = raw.split(/(?=How many countries did you hear)/i)
    if (soft.length >= 2) parts = soft.map((p) => p.trim()).filter(Boolean)
  }

  // Watch vs choice when "Video:" shorthand (no Video plays)
  if (
    parts.length === 1 &&
    /Video:/i.test(raw) &&
    /Student\s*choices?|Choices:/i.test(raw)
  ) {
    const soft = raw.split(
      /(?=How many countries did you hear|(?:\*\*)?Student\s*choices?:|(?:\*\*)?Choices:)/i,
    )
    if (soft.length >= 2) {
      parts = [soft[0]!.trim(), soft.slice(1).join('\n').trim()].filter(
        (p) => p.length > 20,
      )
    }
  }

  parts = mergeWatchPreamble(parts)
  parts = attachPostWatchAtmosphereToQuiz(parts)
  parts = parts.flatMap(splitReplayFromComprehension)
  parts = parts.flatMap(splitSceneKeywords)
  parts = parts.flatMap(splitConnectPractice)
  parts = parts.flatMap(splitParallelListenChoose)
  parts = parts.flatMap(splitPostChoiceBuild)
  parts = parts.flatMap(splitParallelBuilds)
  parts = parts.flatMap(splitParallelShowSayIt)
  parts = parts.flatMap(splitDiscoverFromPatternFormula)
  parts = parts.flatMap(splitBuildFromPatternPresent)
  parts = mergeMicroChunks(parts)
  parts = refineComprehensionBoundaries(parts)
  parts = attachPreDrillScreen(parts)

  // Expand any remaining replay+multi-focus cluster parts
  const chunks: RawChunk[] = []
  for (const part of parts) {
    const exp = expandReplayFocusCluster(part)
    if (exp) chunks.push(...exp)
    else {
      chunks.push({
        title: nameActivity(part, purpose, chunks.length),
        text: part,
      })
    }
  }

  if (chunks.length === 0) {
    return [{ title: nameActivity(raw, purpose, 0), text: raw.slice(0, 400) }]
  }

  return chunks.slice(0, 10)
}

/** Outline fallbacks from outlineFromBody — not real script anchors */
const OUTLINE_STUB_RE =
  /（从本步|选择题干|词汇\/关键|对话轮次|视觉\/图卡|听音跟读目标句（|句型观察\/公式|组句\/拖拽|过渡\/总结|开放任务|（原文/

function isOutlineStub(outline: string): boolean {
  const t = outline.trim()
  return !t || OUTLINE_STUB_RE.test(t) || t.length < 10
}

/** Does the step body actually contain evidence for this CMP's teaching move? */
function bodySupportsCmp(body: string, cmpId: string): boolean {
  const t = body.replace(/\*\*/g, '')
  switch (cmpId) {
    case 'CMP-08':
    case 'CMP-35':
      return /Listen and repeat|Student repeats|Your turn|跟读|AI pronunciation|Audio:\s*\n?\s*[a-záàǎāēéěèīíǐìōóǒòūúǔùüńňnv]/i.test(
        t,
      )
    case 'CMP-15':
    case 'CMP-19':
    case 'CMP-24':
    case 'CMP-16':
      return /Kai asks|Student answers|role\s*play|对话练习|NPC|Kai shows|Say it/i.test(
        t,
      )
    case 'CMP-13':
    case 'CMP-33':
    case 'CMP-02':
      return /Choices:|Student chooses|Student selects|Student choices/i.test(t)
    case 'CMP-11':
    case 'CMP-07':
      return /Screen:|What do you notice|\+\s*人|Pattern|Two questions/i.test(t)
    case 'CMP-03':
    case 'CMP-05':
    case 'CMP-23':
      return /Video|Replay\.|Freeze|Watch/i.test(t)
    case 'CMP-12':
      return /Student builds/i.test(t)
    case 'CMP-04':
    case 'CMP-32':
      return /YOUR MISSION|Mission|学习目标/i.test(t)
    default:
      return true
  }
}

function n1HintIsGrounded(
  body: string,
  cmpId: string,
  n1: string[],
): boolean {
  if (!bodySupportsCmp(body, cmpId)) return false
  const outline = outlineFromBody(body, cmpId, n1) || ''
  // Stub = no real section extracted → do not invent an activity
  if (isOutlineStub(outline)) return false
  return true
}

/** When body won't split but N1 suggested multiple CMPs, one activity per suggestion */
function activitiesFromN1Hints(
  phase: PhaseId,
  scriptStep: number,
  purpose: string,
  body: string,
  n1: string[],
): ActivityDraft[] {
  const text = stripQuotePrefixes(body) || purpose || '（原文）'
  const grounded = n1.filter((id) => n1HintIsGrounded(text, id, n1))
  if (grounded.length === 0) return []

  const prepared = grounded.map((cmpId, i) => {
    const outline = outlineFromBody(text, cmpId, n1) || text
    const stubby = isOutlineStub(outline)
    const anchor = stubby ? clip(text, 280) : clip(outline, 280)
    return { cmpId, anchor, i }
  })

  // Same pedagogical stretch suggested as multiple CMPs → not multiple activities
  const uniqKeys = new Set(
    prepared.map((p) => {
      // Drop outlineFromBody "组件名: " prefix before comparing
      const raw = p.anchor.replace(/\s+/g, ' ').trim()
      const withoutLabel = raw.replace(/^[^:]{1,40}:\s+/, '')
      return withoutLabel.slice(0, 80).toLowerCase()
    }),
  )
  if (uniqKeys.size < 2) return []

  return prepared.map(({ cmpId, anchor }, i) => {
    const titleBase = nameActivity(anchor, purpose, i)
    const cmpLabel = COMPONENT_NAMES[cmpId] || cmpId
    const title =
      titleBase === clip(purpose.split(/[，。；;]/)[0] || purpose, 28) ||
      grounded.length > 1
        ? `${titleBase} · ${cmpLabel}`
        : titleBase
    const chunk: RawChunk = { title, text: anchor }
    const { candidates, selectionThinking } = scoreCandidates(
      phase,
      chunk,
      purpose,
      n1,
    )
    const selected =
      candidates.find((c) => c.id === cmpId)?.id ||
      candidates.find((c) => c.recommended)?.id ||
      candidates[0]?.id ||
      cmpId
    return {
      id: `${scriptStep}.${i + 1}`,
      title,
      intent: clip(
        purpose
          ? `【${title}】服务「${purpose}」，建议由 ${cmpId} 承载`
          : `【${title}】由 ${cmpId} 承载`,
        160,
      ),
      sourceAnchor: anchor,
      candidates,
      selectedComponentId: selected,
      selectionThinking: selectionThinking || undefined,
    }
  })
}

export function analyzeActivitiesFromPhased(
  missionName: string,
  phasedMd: string,
): V031Document {
  const scriptSteps = parsePhasedScript(phasedMd)
  const steps: StepActivityAnalysis[] = scriptSteps.map((s) => {
    const n1 = parseSuggestedCmps(s.suggestedComponents).filter((id) =>
      isAllowed(s.phase, id),
    )
    let activities: ActivityDraft[]
    const chunks = splitBodyIntoChunks(s.body, s.purpose)
    if (n1.length > 1 && chunks.length === 1) {
      activities = activitiesFromN1Hints(
        s.phase,
        s.index,
        s.purpose,
        s.body,
        n1,
      )
      // N1 multi-hint produced phantoms / duplicates → trust body chunk instead
      if (activities.length < 1) {
        activities = chunks.map((chunk, i) => {
          const { candidates, selectionThinking } = scoreCandidates(
            s.phase,
            chunk,
            s.purpose,
            n1,
          )
          const selected =
            candidates.find((c) => c.recommended)?.id ||
            candidates[0]?.id ||
            PHASE_ALLOWED[s.phase][0]!
          return {
            id: `${s.index}.${i + 1}`,
            title: chunk.title,
            intent: clip(
              s.purpose
                ? `【${chunk.title}】服务教学目的「${s.purpose}」`
                : `【${chunk.title}】${clip(chunk.text, 80)}`,
              160,
            ),
            sourceAnchor: clip(chunk.text, 320),
            candidates,
            selectedComponentId: selected,
            selectionThinking: selectionThinking || undefined,
          }
        })
      }
    } else {
      activities = chunks.map((chunk, i) => {
        const { candidates, selectionThinking } = scoreCandidates(
          s.phase,
          chunk,
          s.purpose,
          n1,
        )
        const selected =
          candidates.find((c) => c.recommended)?.id ||
          candidates[0]?.id ||
          PHASE_ALLOWED[s.phase][0]!
        const id = `${s.index}.${i + 1}`
        return {
          id,
          title: chunk.title,
          intent: clip(
            s.purpose
              ? `【${chunk.title}】服务教学目的「${s.purpose}」`
              : `【${chunk.title}】${clip(chunk.text, 80)}`,
            160,
          ),
          sourceAnchor: clip(chunk.text, 320),
          candidates,
          selectedComponentId: selected,
          selectionThinking: selectionThinking || undefined,
        }
      })
    }
    return {
      phase: s.phase,
      scriptStep: s.index,
      name: s.name,
      purpose: s.purpose,
      activities,
    }
  })

  return { version: 'v0.3.1', missionName, steps }
}

function scoreCandidates(
  phase: PhaseId,
  chunk: RawChunk,
  purpose: string,
  n1Suggested: string[],
): { candidates: ActivityCandidate[]; selectionThinking: string } {
  const catalog = loadCatalogComponents()
  const byId = new Map(catalog.map((c) => [c.id, c]))
  const allowed = new Set(PHASE_ALLOWED[phase].filter((id) => isAllowed(phase, id)))
  const scores = new Map<string, { score: number; rationale: string; fromN1?: boolean }>()

  const bump = (
    id: string,
    add: number,
    rationale: string,
    fromN1?: boolean,
    preferRationale?: boolean,
  ) => {
    if (!allowed.has(id)) return
    const cur = scores.get(id) || { score: 0, rationale: '' }
    cur.score += add
    if (preferRationale || !cur.rationale) cur.rationale = rationale
    if (fromN1) cur.fromN1 = true
    scores.set(id, cur)
  }

  const need = detectActivityNeed(chunk.title, chunk.text, purpose)
  const contrastPair =
    need === 'contrast_sentences' ? extractContrastPair(chunk.text) : null

  // Pedagogical fit from catalog E/J/K (primary for contrast / choice needs)
  for (const id of allowed) {
    const c = byId.get(id)
    if (!c) continue
    const fit = fitComponentToNeed(
      need,
      {
        id: c.id,
        purpose: c.purpose || '',
        template: c.template || '',
        interaction: c.interaction || '',
        nameZh: c.nameZh || '',
      },
      contrastPair,
    )
    if (fit) bump(id, fit.score, fit.rationale, false, true)
  }

  const hay = `${purpose}\n${chunk.title}\n${chunk.text}`
  for (const hint of KEYWORD_HINTS) {
    if (hint.re.test(hay)) {
      // 「选择题」只表示这是 MCQ，不在 13/33 之间分胜负（由 pedagogical fit 决定）
      const even = hint.label === '选择题'
      hint.cmps.forEach((id, i) =>
        bump(id, even ? 5 : 8 - i, `匹配「${hint.label}」`),
      )
    }
  }

  // Title-based boosts (after pedagogical naming)
  // Contrast / observe sentences — NOT multiple choice
  if (/对比已学|对比两句|句型观察|并排观察/i.test(chunk.title)) {
    ;['CMP-11', 'CMP-07', 'CMP-10'].forEach((id, i) =>
      bump(id, 16 - i * 2, '活动类型：句子对比观察'),
    )
  }
  if (/听后含义推断|含义推断|观后理解/i.test(chunk.title)) {
    if (hasFocusLemma(chunk.title, chunk.text)) {
      ;['CMP-13', 'CMP-33', 'CMP-02'].forEach((id, i) =>
        bump(id, 16 - i * 4, '活动类型：焦点含义推断'),
      )
    } else {
      ;['CMP-33', 'CMP-13', 'CMP-02'].forEach((id, i) =>
        bump(id, 16 - i * 4, '活动类型：直接理解选择题'),
      )
    }
  }
  // Listen-and-choose practice (separate from contrast display)
  if (/听辨练习/i.test(chunk.title)) {
    if (hasFocusLemma(chunk.title, chunk.text)) {
      ;['CMP-13', 'CMP-33', 'CMP-02'].forEach((id, i) =>
        bump(id, 12 - i, '活动类型：听辨（有焦点词）'),
      )
    } else {
      ;['CMP-33', 'CMP-13', 'CMP-02'].forEach((id, i) =>
        bump(id, 12 - i, '活动类型：听辨选择'),
      )
    }
  }
  if (/听音跟读/i.test(chunk.title)) {
    bump('CMP-08', 12, '活动类型：听音跟读')
  }
  if (/看图/i.test(chunk.title)) {
    ;['CMP-09', 'CMP-03'].forEach((id, i) =>
      bump(id, 18 - i * 8, '活动类型：看图'),
    )
  } else if (/情境回放/i.test(chunk.title)) {
    ;['CMP-05', 'CMP-03'].forEach((id, i) =>
      bump(id, 14 - i, '活动类型：情境回放'),
    )
  } else if (/观看开场/i.test(chunk.title)) {
    ;['CMP-05', 'CMP-03'].forEach((id, i) =>
      bump(id, 10 - i, '活动类型：观看/回放'),
    )
  }
  if (/聚焦知识点/i.test(chunk.title)) {
    ;['CMP-10', 'CMP-29', 'CMP-09'].forEach((id, i) =>
      bump(id, 18 - i * 6, '活动类型：图文聚焦知识点'),
    )
  }
  if (/例证输入/i.test(chunk.title)) {
    ;['CMP-09', 'CMP-11', 'CMP-10'].forEach((id, i) =>
      bump(id, 12 - i, '活动类型：例证输入'),
    )
  }
  if (/发现「的」|探索「朋友」|发现构词/i.test(chunk.title)) {
    if (
      hasFocusLemma(chunk.title, chunk.text) &&
      /Choices:|Student\s+chooses|选项/i.test(chunk.text)
    ) {
      ;['CMP-13', 'CMP-33', 'CMP-02'].forEach((id, i) =>
        bump(id, 16 - i * 4, '活动类型：语素含义选择（有焦点）'),
      )
    } else {
      ;['CMP-11', 'CMP-29', 'CMP-13'].forEach((id, i) =>
        bump(id, 12 - i, '活动类型：语素/规律发现'),
      )
    }
  }
  if (/句型规律识别|句型呈现|呈现构词|总结构词/i.test(chunk.title)) {
    ;['CMP-07', 'CMP-11', 'CMP-10'].forEach((id, i) =>
      bump(id, 18 - i * 6, '活动类型：呈现句型公式'),
    )
  }
  if (/构建「|词块造句/i.test(chunk.title)) {
    bump('CMP-12', 18, '活动类型：词块造句')
    bump('CMP-07', 6, '活动类型：句型学习备选')
  }
  if (/指人说/i.test(chunk.title)) {
    ;['CMP-24', 'CMP-25', 'CMP-35'].forEach((id, i) =>
      bump(id, 16 - i * 2, '活动类型：指人提示口语产出'),
    )
  }
  if (/对话练习：说出自己的国籍/i.test(chunk.title)) {
    ;['CMP-24', 'CMP-15', 'CMP-19'].forEach((id, i) =>
      bump(id, 12 - i, '活动类型：自我介绍口语'),
    )
  }
  if (/发布 Mission/i.test(chunk.title)) {
    ;['CMP-04', 'CMP-32'].forEach((id, i) =>
      bump(id, 10 - i, '活动类型：Mission 发布'),
    )
  }
  if (/角色扮演|综合练习/i.test(chunk.title)) {
    ;['CMP-15', 'CMP-19'].forEach((id, i) =>
      bump(id, 18 - i * 8, '活动类型：角色扮演综合练习'),
    )
  } else if (/对话练习|迁移：/i.test(chunk.title)) {
    ;['CMP-15', 'CMP-19'].forEach((id, i) =>
      bump(id, 10 - i, '活动类型：对话'),
    )
  }

  for (const id of n1Suggested) {
    bump(id, 6, 'N1 建议 component', true)
  }

  // Soft boost: catalog purpose overlap with activity text
  for (const id of allowed) {
    const c = byId.get(id)
    if (!c?.purpose) continue
    const tokens = c.purpose
      .split(/[，,、/\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 6)
    let hit = 0
    for (const t of tokens) {
      if (hay.includes(t)) hit++
    }
    if (hit > 0) bump(id, hit * 2, `catalog 目的相近：${clip(c.purpose, 40)}`)
  }

  // Prefer components that have a text template when activity has language content
  const hasText = /[\u4e00-\u9fffA-Za-z]{4,}/.test(chunk.text)
  if (hasText) {
    for (const id of allowed) {
      const c = byId.get(id)
      if (c?.template && c.template !== '无' && /【|\[/.test(c.template)) {
        bump(id, 1, '模版可承载文字')
      }
    }
  }

  let ranked = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .map(([id]) => id)

  // Ensure at least some candidates
  if (ranked.length < 3) {
    for (const id of PHASE_ALLOWED[phase]) {
      if (!ranked.includes(id)) ranked.push(id)
      if (ranked.length >= 5) break
    }
  }

  ranked = ranked.filter((id) => allowed.has(id)).slice(0, 5)
  if (ranked.length === 0) {
    ranked = [PHASE_ALLOWED[phase][0]!].filter((id) => allowed.has(id))
  }

  const candidates = ranked.map((id, i) => {
    const meta = scores.get(id)
    const nameZh =
      byId.get(id)?.nameZh || COMPONENT_NAMES[id] || id
    return {
      id,
      nameZh,
      rationale: meta?.rationale || 'phase 允许列表候选',
      recommended: i === 0,
      fromN1: meta?.fromN1,
    }
  })

  const selectionThinking = buildSelectionThinking(
    need,
    contrastPair,
    candidates.slice(0, 3).map((c) => `${c.id} ${c.nameZh}`),
  )

  return { candidates, selectionThinking }
}

export function renderV031(doc: V031Document): string {
  const lines: string[] = [
    `# ${doc.missionName} — script_step 教学活动分析 (v0.3.1)`,
    ``,
    `> **版本**: v0.3.1`,
    `> **输入**: v0.2 phased script（教学目的 + 正文）+ component catalog`,
    `> **产出**: 每 script_step 的教学活动拆分 + 潜在承载 component 列表`,
    `> **下一步**: CD 为每个 activity 选择 1 个 component → Confirm → 生成 v0.3`,
    ``,
    `---`,
    ``,
    `## 总览`,
    ``,
    `| Phase | script_step | 教学目的 | activity 数 |`,
    `|---|---|---|---|`,
  ]

  for (const s of doc.steps) {
    lines.push(
      `| ${s.phase} | ${s.scriptStep}. ${s.name} | ${clip(s.purpose || '—', 60)} | ${s.activities.length} |`,
    )
  }

  lines.push('', '---', '')

  for (const s of doc.steps) {
    lines.push(`## script_step ${s.scriptStep}. ${s.name} (${s.phase})`)
    lines.push('')
    if (s.purpose) lines.push(`> **教学目的**: ${s.purpose}`)
    lines.push('')
    for (const a of s.activities) {
      lines.push(`### Activity ${a.id} · ${a.title}`)
      lines.push(`- **意图**: ${a.intent}`)
      lines.push(`- **原文锚点**: ${a.sourceAnchor}`)
      if (a.selectionThinking) {
        lines.push(`- **选型思考**: ${a.selectionThinking}`)
      }
      lines.push(`- **候选 components**:`)
      a.candidates.forEach((c, i) => {
        const tags = [
          c.recommended ? 'recommended' : null,
          c.fromN1 ? 'from_n1' : null,
          a.selectedComponentId === c.id ? 'selected' : null,
        ]
          .filter(Boolean)
          .join(', ')
        lines.push(
          `  ${i + 1}. ${c.id} ${c.nameZh} — ${c.rationale}${tags ? ` (${tags})` : ''}`,
        )
      })
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/** Apply CD edits: replace activities per step (supports add / delete / reorder) */
export function applyV031Selections(
  doc: V031Document,
  patch: {
    steps: Array<{
      scriptStep: number
      activities: Array<{
        id: string
        title?: string
        intent?: string
        sourceAnchor?: string
        selectedComponentId: string
        candidates?: ActivityCandidate[]
      }>
    }>
  },
): V031Document {
  const byStep = new Map(patch.steps.map((s) => [s.scriptStep, s]))
  return {
    ...doc,
    steps: doc.steps.map((s) => {
      const p = byStep.get(s.scriptStep)
      if (!p) return s
      const existingById = new Map(s.activities.map((a) => [a.id, a]))
      const activities = p.activities.map((sel, i) => {
        const prev = existingById.get(sel.id)
        const selected = String(sel.selectedComponentId || '').toUpperCase()
        let candidates: ActivityCandidate[] =
          sel.candidates && sel.candidates.length
            ? sel.candidates
            : prev?.candidates
              ? [...prev.candidates]
              : []
        if (selected && !candidates.some((c) => c.id === selected)) {
          const cat = loadCatalogComponents().find((c) => c.id === selected)
          candidates = [
            ...candidates,
            {
              id: selected,
              nameZh: cat?.nameZh || COMPONENT_NAMES[selected] || selected,
              rationale: 'CD 新增 / 另选',
            },
          ]
        }
        const id = sel.id?.trim() || `${s.scriptStep}.${i + 1}`
        return {
          id,
          title: (sel.title ?? prev?.title ?? `教学活动 ${i + 1}`).trim(),
          intent: (sel.intent ?? prev?.intent ?? '').trim(),
          sourceAnchor: (
            sel.sourceAnchor ??
            prev?.sourceAnchor ??
            ''
          ).trim(),
          candidates,
          selectedComponentId: selected,
          selectionThinking: prev?.selectionThinking,
        }
      })
      return { ...s, activities }
    }),
  }
}

export function validateV031Selections(doc: V031Document): string[] {
  const errors: string[] = []
  for (const s of doc.steps) {
    if (!s.activities.length) {
      errors.push(`script_step ${s.scriptStep} 至少需要 1 个 activity`)
      continue
    }
    if (s.activities.length > 10) {
      errors.push(`script_step ${s.scriptStep} activity 数不宜超过 10`)
    }
    for (const a of s.activities) {
      if (!a.selectedComponentId) {
        errors.push(`Activity ${a.id} 未选择 component`)
        continue
      }
      if (!isAllowed(s.phase, a.selectedComponentId)) {
        errors.push(
          `Activity ${a.id}: ${a.selectedComponentId} 不在 ${s.phase} 允许列表`,
        )
      }
    }
  }
  return errors
}

/** Flatten V0.3.1 selections into v0.3 MappedStep rows.
 * Content outline MUST come from each activity's 原文锚点 (sourceAnchor),
 * not from re-slicing the full v0.2 script_step body.
 */
export function outlineFromActivityAnchor(a: {
  title: string
  intent?: string
  sourceAnchor: string
  selectedComponentId: string
}): string {
  const anchor = (a.sourceAnchor || '').replace(/\s+/g, ' ').trim()
  const title = (a.title || '').trim()
  if (anchor) {
    // Keep title as a light label when anchor doesn't already lead with it
    if (title && !anchor.startsWith(title) && !anchor.includes(`【${title}】`)) {
      return clip(`${title}: ${anchor}`, 400)
    }
    return clip(anchor, 400)
  }
  const intent = (a.intent || '').trim()
  if (title && intent) return clip(`${title}: ${intent}`, 240)
  return clip(title || intent || '（无原文锚点）', 200)
}

export function v031ToMappedSteps(
  doc: V031Document,
  _phasedMd?: string,
): MappedStep[] {
  return doc.steps.map((s) => {
    const components = s.activities.map((a, i) => ({
      id: a.selectedComponentId,
      role: (i === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
      outline: outlineFromActivityAnchor(a),
    }))
    return {
      phase: s.phase,
      scriptStep: s.scriptStep,
      name: s.name,
      purpose: s.purpose,
      components,
    }
  })
}

/** Map `scriptStep.seq` → activity.title for N3 Step labels */
export function activityTitlesFromV031(
  doc: V031Document,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of doc.steps) {
    s.activities.forEach((a, i) => {
      const title = (a.title || '').trim()
      if (title) out[`${s.scriptStep}.${i + 1}`] = title.slice(0, 80)
    })
  }
  return out
}

export async function runN2ActivityAnalysis(input: {
  missionName: string
  phasedMd: string
}): Promise<NodeEngineResult & { document: V031Document }> {
  const document = analyzeActivitiesFromPhased(
    input.missionName,
    input.phasedMd,
  )
  const content = renderV031(document)
  const decisions: DecisionCreate[] = [
    {
      node: 'N2',
      targetType: 'mission',
      type: 'confirm',
      severity: 'info',
      question:
        'Checkpoint：请审阅 V0.3.1 活动拆分，为每个 activity 选择 1 个 component，再 Confirm 生成 v0.3。',
      options: [{ id: 'ack', label: '已知悉', recommended: true }],
      aiRationale: 'N2 V0.3.1 活动分析门禁',
    },
  ]

  return {
    content,
    document,
    decisions,
    meta: {
      provider: 'deterministic',
      activityCount: document.steps.reduce(
        (n, s) => n + s.activities.length,
        0,
      ),
      scriptStepCount: document.steps.length,
    },
  }
}
