import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { heuristicPhasedScript } from './n1.js'
import { outlineFromBody, runN2, renderV03 } from './n2.js'
import {
  analyzeActivitiesFromPhased,
  activityTitlesFromV031,
  v031ToMappedSteps,
} from './n2ActivityAnalysis.js'
import {
  parseV03Tables,
  runN3,
  buildHeuristicRow,
  sanitizeKaiSpeech,
  parseMissionKnowledge,
  parseV04BundleToEditRows,
  rebuildV04FromEditRows,
  buildStepLabel,
  activityTitleFromOutline,
  extractKnowledgePoint,
} from './n3.js'
import { loadCatalogComponents } from '../master/catalog.js'
import { parseV04ToRows, rowsToCsv } from './n4.js'
import { validateN1 } from '../validators/n1.js'
import { validateN2, parseSteppedScript } from '../validators/n2.js'

describe('N1 baseline-aligned format', () => {
  it('parses Mission 4 gold v0.2 (元信息 + 建议 component)', () => {
    const path = resolve(
      process.cwd(),
      '../../missions/mission_4/v0.2_script_phased.md',
    )
    const md = readFileSync(path, 'utf8')
    const { steps, issues } = validateN1(md)
    expect(md).toMatch(/## 元信息/)
    expect(md).toMatch(/建议 component/)
    expect(steps.length).toBeGreaterThan(5)
    // gold may still flag a few TBD steps; ensure most steps parse
    expect(issues.filter((i) => i.level === 'error').length).toBeLessThan(5)
  })

  it('heuristic N1 emits 建议 component lines', () => {
    const out = heuristicPhasedScript(
      'Demo',
      'Friends',
      'Warm up. Practice saying 你好.',
    )
    expect(out).toMatch(/建议 component/)
    const v = validateN1(out)
    expect(v.steps.length).toBeGreaterThan(0)
  })

  it('heuristic N1 suggests CMP-33 for direct MCQ and CMP-13 for focus-lemma MCQ', () => {
    const direct = heuristicPhasedScript(
      'Demo',
      'Friends',
      `**5\\. CONTEXT STORY**
Audio: 你是哪国人？
Kai: What is the teacher trying to find out?
Student choices:
A. Tom's name
B. Where Tom is from
C. If Tom is a teacher
`,
    )
    expect(direct).toMatch(
      /## script_step 5\.[\s\S]*?\*\*建议 component\*\*:.*CMP-33/,
    )
    expect(direct).not.toMatch(
      /## script_step 5\.[\s\S]*?\*\*建议 component\*\*:.*CMP-13/,
    )

    const focus = heuristicPhasedScript(
      'Demo',
      'Friends',
      `**11\\. DISCOVERY**
Highlight: 朋友
Kai: What do you think 朋友 means?
Student choices:
A. Teacher
B. Friend
C. Student
`,
    )
    expect(focus).toMatch(
      /## script_step 11\.[\s\S]*?\*\*建议 component\*\*:.*CMP-13/,
    )
    expect(focus).not.toMatch(
      /## script_step 11\.[\s\S]*?\*\*建议 component\*\*:.*CMP-33/,
    )

    const listenGloss = heuristicPhasedScript(
      'Demo',
      'Friends',
      `**5\\. CONNECT**
Kai asks: 你是哪国人？
Student choices:
A. Name
B. Country
Student chooses: Country
`,
    )
    expect(listenGloss).toMatch(
      /## script_step 5\.[\s\S]*?\*\*建议 component\*\*:.*CMP-13/,
    )
    expect(listenGloss).not.toMatch(
      /## script_step 5\.[\s\S]*?\*\*建议 component\*\*:.*CMP-33/,
    )

    const oldKp = heuristicPhasedScript(
      'Demo',
      'Friends',
      `**6\\. CONNECT**
You already know how to ask someone's name.
Kai asks: 你叫什么名字？
Student choices:
A. Name
B. Country
Student chooses: Name
`,
    )
    expect(oldKp).toMatch(
      /## script_step 6\.[\s\S]*?\*\*建议 component\*\*:.*CMP-13/,
    )
    expect(oldKp).not.toMatch(
      /## script_step 6\.[\s\S]*?\*\*建议 component\*\*:.*CMP-33/,
    )
  })
})

describe('N2 outline helpers', () => {
  it('outlineFromBody clips kai lead', () => {
    const o = outlineFromBody(
      '**Kai:** Hello.\n**Video plays.**\nTom: 你好',
      'CMP-03',
    )
    expect(o.length).toBeGreaterThan(0)
    expect(o.length).toBeLessThanOrEqual(400)
  })
})

describe('N2/N3/N4 engines per pipeline_design nodes', () => {
  it('N2 maps from v0.2 suggestions into gold-like tables', async () => {
    const phased = heuristicPhasedScript(
      'M4',
      'Friends',
      `**1\\. MISSION ENTRY — Warm Up**\na\n**4\\. PRACTICE**\nb\n**16\\. AI MISSION**\nc\n**17\\. TODAY YOU CAN**\nd\n`,
    )
    const n2 = await runN2({ missionName: 'M4', phasedMd: phased })
    expect(n2.content).toMatch(/script_step → Component 映射/)
    expect(n2.content).toMatch(/Content outline/)
    const steps = parseV03Tables(n2.content)
    const v = validateN2(steps)
    expect(v.issues.some((i) => i.code === 'N2_P1_NEED_CMP04')).toBe(false)
    expect((n2.meta as { missionStepCount: number }).missionStepCount).toBeGreaterThan(0)

    const n3 = await runN3({
      missionName: 'M4',
      steppedMd: n2.content,
      phasedMd: phased,
    })
    expect(n3.phaseFiles.P1).toMatch(/v0\.4/)
    expect(n3.content).toContain('mission_step')
    expect(n3.content).toMatch(/Fields \(13\)/)
    expect(n3.content).toMatch(/Phase 1 - Mission Intro/)

    const rows = parseV04ToRows(n3.content)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.Component).toMatch(/CMP-/)
    expect(rows[0]!['Display Image']).toMatch(/^(NA|.+\+TBC)$/)
    expect(rows[0]!['Video Play']).toMatch(/^(NA|.+\+TBC)$/)
    expect(rows[0]!['Kai Script 1'].length).toBeGreaterThan(0)

    const csv = rowsToCsv(rows.slice(0, 2), false)
    expect(csv.split('\n')[0]).toMatch(/^Phase,Script Step,Step,Component,Display Text/)
    expect(csv).toContain(rows[0]!.Component)

    // V0.4 editor: parse → edit → rebuild preserves identity + field edits
    const editRows = parseV04BundleToEditRows(n3.content)
    expect(editRows.length).toBe(rows.length)
    expect(editRows[0]!.missionStepId).toMatch(/^\d+\.\d+$/)
    editRows[0]!.row['Kai Script 1'] = 'EDITED KAI LINE FOR DRAFT'
    editRows[0]!.row.DisplayText = '【编辑】draft display'
    const rebuilt = rebuildV04FromEditRows('M4', editRows)
    expect(rebuilt.total).toBe(editRows.length)
    expect(rebuilt.content).toContain('EDITED KAI LINE FOR DRAFT')
    expect(rebuilt.content).toContain('【编辑】draft display')
    expect(rebuilt.phaseFiles.P1).toContain('EDITED KAI LINE FOR DRAFT')
    const again = parseV04BundleToEditRows(rebuilt.content)
    expect(again[0]!.row['Kai Script 1']).toBe('EDITED KAI LINE FOR DRAFT')
  })
})

describe('N3 Step from v0.3.1 activity title', () => {
  it('buildStepLabel prefers activityTitle over outline snippet', () => {
    expect(
      buildStepLabel(
        'PRACTICE',
        'CMP-13',
        'Audio: 你叫什么名字？ Choices: A/B',
        1,
        2,
        '听辨练习：问名字',
      ),
    ).toBe('听辨练习：问名字')
    expect(
      activityTitleFromOutline('听辨练习：问国籍: Audio: 你是哪国人？'),
    ).toBe('听辨练习：问国籍')
  })

  it('runN3 Step uses activityTitles map / outline title prefix', async () => {
    const path = resolve(
      process.cwd(),
      '../../missions/mission_4/v0.2_script_phased.md',
    )
    const phased = readFileSync(path, 'utf8')
    const doc = analyzeActivitiesFromPhased('Mission 4', phased)
    // pick first selected components so v0.3 is valid
    for (const s of doc.steps) {
      for (const a of s.activities) {
        a.selectedComponentId =
          a.selectedComponentId ||
          a.candidates.find((c) => c.recommended)?.id ||
          a.candidates[0]?.id ||
          'CMP-01'
      }
    }
    const mapped = v031ToMappedSteps(doc)
    const titles = activityTitlesFromV031(doc)
    expect(Object.keys(titles).length).toBeGreaterThan(0)

    const steppedMd = renderV03('Mission 4', mapped)
    const n3 = await runN3({
      missionName: 'Mission 4',
      steppedMd,
      phasedMd: phased,
      activityTitles: titles,
    })
    const rows = parseV04BundleToEditRows(n3.content)
    const withTitle = rows.filter((r) => titles[r.missionStepId])
    expect(withTitle.length).toBeGreaterThan(0)
    for (const r of withTitle.slice(0, 8)) {
      expect(r.row.Step).toBe(titles[r.missionStepId])
    }
  })
})

describe('N3 Kai speech + knowledge from v0.2', () => {
  it('strips component labels and uses spoken Kai lines', () => {
    loadCatalogComponents()
    const row = buildHeuristicRow({
      phase: 'P1',
      scriptStep: 2,
      scriptName: 'OPENING STORY',
      purpose: '首次故事沉浸，感知目标语言在真实交际中的出现',
      cmpId: 'CMP-03',
      outline:
        '视频播放: **Kai:** First, watch. Don\'t try to understand every word. **Video plays.** 王老师：你是哪国人？Tom：我是英国人。',
      indexInStep: 1,
      totalInStep: 2,
      knowledge: parseMissionKnowledge(`
## 元信息
- **核心词汇**:
  - 哪国 (which country)
  - 英国 (UK)
  - 朋友 (friend)
- **核心句型**:
  - 你是哪国人？ (Where are you from?)
  - 我是XX人。 (I am from XX.)
`),
    })
    expect(row['Kai Script 1']).toMatch(/First, watch/i)
    expect(row['Kai Script 1']).not.toMatch(/视频播放/)
    expect(row['Transition Script']).not.toMatch(/首次故事沉浸|Next —/)
    expect(row['Kai Script 2']).toBe('')
    expect(row['Knowledge point']).toMatch(/Word:.*哪国|英国/)
    expect(row['Knowledge point']).toMatch(/Pattern:.*你是哪国人/)
    expect(row['Knowledge point']).not.toMatch(/视频播放|首次故事/)
  })

  it('buildHeuristicRow Step uses activityTitle when provided', () => {
    loadCatalogComponents()
    const row = buildHeuristicRow({
      phase: 'P2',
      scriptStep: 4,
      scriptName: 'PRACTICE',
      purpose: '听辨',
      cmpId: 'CMP-13',
      outline: 'Audio: x',
      indexInStep: 1,
      totalInStep: 2,
      activityTitle: '听辨练习：问名字',
    })
    expect(row.Step).toBe('听辨练习：问名字')
  })

  it('sanitizeKaiSpeech strips em dashes for TTS', () => {
    expect(sanitizeKaiSpeech('Your turn — try it.')).toBe('Your turn. try it.')
    expect(sanitizeKaiSpeech('朋友 — péng you — friend.')).toBe(
      '朋友. péng you. friend.',
    )
    expect(sanitizeKaiSpeech('Nice – you said it.')).not.toMatch(/[—–]/)
  })

  it('CMP-33 观后理解: Script1=atmosphere, Script2=tap prompt, Transition=closing', () => {
    loadCatalogComponents()
    const row = buildHeuristicRow({
      phase: 'P1',
      scriptStep: 2,
      scriptName: 'OPENING STORY',
      purpose: '整体输入、激活先验、引发好奇',
      cmpId: 'CMP-33',
      outline: `**Kai:**
Hmm.
Names. Countries. Friends.
A lot is happening.
How many countries did you hear
Student choices:
A 1 B 2 C 3
Where is Tom come from?
**Kai:**
Keep the story in mind.
We'll come back to it.`,
      indexInStep: 2,
      totalInStep: 2,
      activityTitle: '观后理解检测',
    })
    expect(row['Kai Script 1']).toMatch(/Hmm/)
    expect(row['Kai Script 1']).toMatch(/Names\. Countries\. Friends/)
    expect(row['Kai Script 1']).toMatch(/A lot is happening/)
    expect(row['Kai Script 1']).not.toMatch(/How many countries|A 1|Keep the story|come back/i)
    expect(row['Kai Script 2']).toBe('How many did you catch? Tap one.')
    expect(row['Kai Script 2']).not.toMatch(/A 1|Keep the story/i)
    expect(row['Transition Script']).toMatch(/Keep the story|come back/i)
    expect(row['Transition Script']).not.toMatch(/Hmm|How many did you catch/i)
  })

  it('N3 discovery 11–13 styles: CMP-03/09 watch, CMP-08/07/35/15 fill', () => {
    loadCatalogComponents()

    const replay = buildHeuristicRow({
      phase: 'P2',
      scriptStep: 11,
      scriptName: 'DISCOVERY — 朋友',
      purpose: '理解朋友',
      cmpId: 'CMP-03',
      outline: '**Replay.** Tom：她是我的朋友。 **Freeze.**',
      indexInStep: 1,
      totalInStep: 5,
      activityTitle: '情境回放：她是我的朋友',
    })
    expect(replay['Kai Script 1']).toMatch(/Listen again.*Tom says.*她是我的朋友/)
    expect(replay['Kai Script 1']).not.toMatch(/[—–]/)
    expect(replay['Kai Script 2']).toBe('')
    expect(replay['Transition Script']).toMatch(/Freeze/)

    const image = buildHeuristicRow({
      phase: 'P2',
      scriptStep: 11,
      scriptName: 'DISCOVERY — 朋友',
      purpose: '理解朋友',
      cmpId: 'CMP-09',
      outline:
        'Visual: Tom and Emma smiling together. CMP-09 全屏大图\nKai:\nTom and Emma know each other.\nThey study together.\nYou already know:\n同学\nEmma is Tom’s 同学.\nBut Tom says another word.',
      indexInStep: 2,
      totalInStep: 5,
    })
    expect(image['Kai Script 2']).toBe('')
    expect(image['Kai Script 1']).not.toMatch(/CMP-09|全屏大图/)
    expect(image['Transition Script']).toMatch(/同学|another word/)

    const listen = buildHeuristicRow({
      phase: 'P2',
      scriptStep: 11,
      scriptName: 'DISCOVERY — 朋友',
      purpose: '理解朋友',
      cmpId: 'CMP-08',
      outline:
        '朋友 — péng you — friend.\nAudio.\nStudent repeats. CMP-08 听音跟读\nKai:\nEmma is Tom’s classmate.\nShe is also his friend.',
      indexInStep: 5,
      totalInStep: 5,
    })
    expect(listen.DisplayText).toMatch(/【汉字】\s*朋友/)
    expect(listen['Kai Script 1']).toMatch(/朋友\. péng you\. friend/)
    expect(listen['Kai Script 1']).not.toMatch(/[—–]/)
    expect(listen['Kai Script 2']).toMatch(/Listen and repeat: 朋友/)
    expect(listen['Kai Feedback Script - Correct']).toBe('Good.')

    const pattern = buildHeuristicRow({
      phase: 'P2',
      scriptStep: 12,
      scriptName: 'PATTERN',
      purpose: '句型',
      cmpId: 'CMP-07',
      outline:
        '**Screen:** 她是我的朋友。 **Kai:** Look at the pattern. **Screen:** [PERSON] + 是 + [MY/YOUR/HIS/HER] + 朋友 **',
      indexInStep: 1,
      totalInStep: 4,
    })
    expect(pattern.DisplayText).toMatch(/【左侧】\s*她是我的朋友/)
    expect(pattern['Kai Script 1']).toMatch(/Look at the pattern/)
    expect(pattern['Kai Script 2']).toBe('')
    expect(pattern['Transition Script']).toMatch(/PERSON.*是.*朋友/)

    const say = buildHeuristicRow({
      phase: 'P2',
      scriptStep: 12,
      scriptName: 'PATTERN',
      purpose: '指人说',
      cmpId: 'CMP-35',
      outline:
        'Kai shows Emma.** **Kai:** Emma is my friend. **Student:** 她是我的朋友。 **',
      indexInStep: 2,
      totalInStep: 4,
    })
    expect(say.DisplayText).toMatch(/【汉字】\s*她是我的朋友/)
    expect(say.DisplayText).not.toMatch(/对不起/)
    expect(say['Kai Script 1']).toMatch(/Emma is my friend/)
    expect(say['Kai Script 2']).toMatch(/她是我的朋友/)
  })

  it('Knowledge point stays scoped to this outline (no whole-mission dump)', () => {
    const knowledge = parseMissionKnowledge(`
## 元信息
- **核心词汇**: 哪国 / 中国 / 美国 / 英国 / 人 / 的 / 朋友 / 我的 / 你的
- **核心句型**:
  - 你是哪国人？ (Where are you from?)
  - 我是XX人。 (I am from XX.)
  - 她/他是你的朋友吗？
  - 她/他是我的朋友。
`)
    // Welcome / mission publish should NOT inherit every pattern via 人/的
    const warm = extractKnowledgePoint(
      'Welcome back. Today you will meet friends.',
      '欢迎并发布任务：感知哪国人、朋友等全部核心词汇句型',
      knowledge,
    )
    expect(warm).toMatch(/Word:\s*朋友/)
    expect(warm).not.toMatch(/你是哪国人/)
    expect(warm).not.toMatch(/Word:.*人\b/)
    expect(warm).not.toMatch(/她\/他是你的朋友吗/)
    expect(warm).not.toMatch(/classroom rapport/)

    // Name-focus listen activity: only name-related hits, not every country pattern
    const nameOnly = extractKnowledgePoint(
      '听辨练习：问名字: Audio: 你叫什么名字？ Choices: A. Tom B. Emma',
      '对比问名字与问国籍；练习哪国人、朋友等全部句型',
      knowledge,
    )
    expect(nameOnly).not.toMatch(/你是哪国人/)
    expect(nameOnly).not.toMatch(/中国|美国|英国/)
    // Pure greeting with no bank hits → empty (no fake SocialExpression)
    expect(
      extractKnowledgePoint('Hello! Welcome back.', '课前寒暄', knowledge),
    ).toBe('')
  })

  it('5.5 发现构词规律 focuses Word 人 (not classroom rapport)', () => {
    const knowledge = parseMissionKnowledge(`
## 元信息
- **核心词汇**:
  - 人 (person)
  - 英国 (UK)
  - 中国 (China)
- **核心句型**:
  - 你是哪国人？ (Where are you from?)
`)
    const kp = extractKnowledgePoint(
      '发现构词规律: Kai: What do you notice? Student taps 人. Highlight: 人 Kai: What do you think 人 is doing here? Choices: A. Asking a question B. Talking about a person from that country',
      '发现"国家+人"构词规律',
      knowledge,
    )
    expect(kp).toMatch(/Word:\s*人/)
    expect(kp).not.toMatch(/classroom rapport/)
    expect(kp).not.toMatch(/Pattern:\s*你是哪国人/)
  })

  it('Knowledge point uses mission bank categories Word/Grammar/Phrase/Pattern/Pinyin', () => {
    const knowledge = parseMissionKnowledge(`
## 元信息
- **核心词汇**:
  - 哪国 (which country)
  - 朋友 (friend)
  - 的 (possessive particle)
  - 我的 (my)
- **核心短语**:
  - 哪国人 (person from which country)
- **核心句型**:
  - 你是哪国人？ (Where are you from?)
- **拼音**:
  - nǐ shì nǎ guó rén (你是哪国人)
`)
    expect(knowledge.words.map((w) => w.zh)).toEqual(
      expect.arrayContaining(['哪国', '朋友', '我的']),
    )
    expect(knowledge.grammar.map((g) => g.zh)).toEqual(
      expect.arrayContaining(['的']),
    )
    expect(knowledge.phrases.map((p) => p.zh)).toEqual(
      expect.arrayContaining(['哪国人']),
    )
    expect(knowledge.patterns.map((p) => p.zh)).toEqual(
      expect.arrayContaining(['你是哪国人？']),
    )
    expect(knowledge.pinyin.map((p) => p.zh)).toEqual(
      expect.arrayContaining(['nǐ shì nǎ guó rén']),
    )

    const deFocus = extractKnowledgePoint(
      'Highlight: 的\nWhat do you think 的 is doing?\n我的 你的',
      '发现的',
      knowledge,
    )
    expect(deFocus).toMatch(/Grammar:\s*的/)
    expect(deFocus).toMatch(/Word:\s*.*我的/)
    expect(deFocus).not.toMatch(/Pattern:\s*你是哪国人/)

    const askCountry = extractKnowledgePoint(
      'Audio: 你是哪国人？\nnǐ shì nǎ guó rén\nWhat is the teacher trying to find out?',
      '理解问句',
      knowledge,
    )
    expect(askCountry).toMatch(/Word:\s*哪国/)
    expect(askCountry).toMatch(/Phrase:\s*哪国人/)
    expect(askCountry).toMatch(/Pattern:\s*你是哪国人？/)
    expect(askCountry).toMatch(/Pinyin:\s*nǐ shì nǎ guó rén/)
    expect(askCountry).not.toMatch(/Grammar:\s*的/)
  })
})

describe('parseSteppedScript smoke', () => {
  it('round-trips minimal v0.3', () => {
    const md = `# x

## Phase 1

### script_step 1. Warm (P1)

> **教学目的**: hi

| Component | 角色 | 关键字段 | Content outline |
|---|---|---|---|
| CMP-01 课前寒暄 | primary | — | Hello |
`
    const steps = parseSteppedScript(md)
    expect(steps[0]?.components[0]?.id).toBe('CMP-01')
  })
})