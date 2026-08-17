import { describe, expect, it } from 'vitest'
import {
  analyzeActivitiesFromPhased,
  nameActivity,
  renderV031,
  validateV031Selections,
  v031ToMappedSteps,
  hasFocusLemma,
} from './n2ActivityAnalysis.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_V02 = `# Mission
**名称:** Test

## Phase 1 — Mission Intro

### script_step 1. MISSION ENTRY — Warm Up
> 教学目的: 欢迎并发布任务目标。
> 建议 component: CMP-01, CMP-04

**Kai:** Welcome back.
YOUR MISSION — Meet friends
✓ Talk about countries

### script_step 2. OPENING STORY
> 教学目的: 整体观看故事并检查理解。
> 建议 component: CMP-03, CMP-33

**Kai:**
First, watch.
Just notice: Where is everyone from?

**Video plays.**
Tom meets friends from different countries.
**Video ends.**
How many countries did you hear?
**Student choices:**
A. 1
B. 2
C. 3
Student chooses C.

## Phase 2 — Knowledge Discovery

### script_step 3. CONTEXT STORY
> 教学目的: 理解"你是哪国人？"的含义，学习该问句
> 建议 component: CMP-05, CMP-33, CMP-08

**Replay.**
老师：你是哪国人？
Tom：我是英国人。
**Freeze.**
**Kai:**
The teacher already knows Tom's name.
She is asking something new.
Listen again.
**Audio:**
你是哪国人？
**Kai:**
What is the teacher trying to find out?
**Choices:**
A. Tom's name
B. Where Tom is from
C. If Tom is a teacher
**Student chooses B.**
**Kai:**
Exactly.
She is asking where Tom is from.
**Screen:**
你是哪国人？
**Audio:**
nǐ shì nǎ guó rén
**Kai:**
Your turn.
**Student repeats.**
**AI pronunciation feedback.**
`

describe('N2 v0.3.1 activity analysis', () => {
  it('splits script_steps into named activities with candidates', () => {
    const doc = analyzeActivitiesFromPhased('Test', SAMPLE_V02)
    expect(doc.version).toBe('v0.3.1')
    expect(doc.steps.length).toBe(3)
    const step2 = doc.steps.find((s) => s.scriptStep === 2)!
    expect(step2.activities.length).toBeGreaterThanOrEqual(2)
    expect(step2.activities.map((a) => a.title)).toEqual(
      expect.arrayContaining(['观看开场故事', '观后理解检测']),
    )
    for (const a of step2.activities) {
      expect(a.candidates.length).toBeGreaterThanOrEqual(1)
      expect(a.selectedComponentId).toBeTruthy()
      expect(['Audio:', 'Choices:', 'Kai:']).not.toContain(a.title)
    }
    const md = renderV031(doc)
    expect(md).toContain('v0.3.1')
    expect(md).toContain('Activity')
  })

  it('merges Kai watch lead-in with Video plays as one opening-story activity', () => {
    const doc = analyzeActivitiesFromPhased('Test', SAMPLE_V02)
    const step2 = doc.steps.find((s) => s.scriptStep === 2)!
    const titles = step2.activities.map((a) => a.title)
    expect(titles).toContain('观看开场故事')
    expect(titles).toContain('观后理解检测')
    expect(titles.filter((t) => t === '观看开场故事').length).toBe(1)
    const watch = step2.activities.find((a) => a.title === '观看开场故事')!
    expect(watch.sourceAnchor).toMatch(/First,\s*watch|Just notice/i)
    expect(watch.sourceAnchor).toMatch(/Video\s+plays/i)
  })

  it('moves post-Video-ends atmosphere Kai into 观后理解检测', () => {
    const md = `# Mission
## Phase 1 — Mission Intro
### script_step 2. OPENING STORY
> 教学目的: 整体观看故事并检查理解。
> 建议 component: CMP-03, CMP-33

**Kai:**
First, watch.
Just notice: Where is everyone from?

**Video plays.**
Tom meets friends from different countries.
**Video ends.**
**Kai:**
Hmm.
Names. Countries. Friends.
A lot is happening.
How many countries did you hear?
**Student choices:**
A. 1
B. 2
C. 3
Student chooses C.
**Kai:**
Keep the story in mind.
We'll come back to it.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step2 = doc.steps.find((s) => s.scriptStep === 2)!
    const watch = step2.activities.find((a) => a.title === '观看开场故事')!
    const quiz = step2.activities.find((a) => a.title === '观后理解检测')!
    expect(watch.sourceAnchor).toMatch(/First,\s*watch/)
    expect(watch.sourceAnchor).toMatch(/Video\s+ends/)
    expect(watch.sourceAnchor).not.toMatch(/Hmm|A lot is happening/)
    expect(quiz.sourceAnchor).toMatch(/Hmm/)
    expect(quiz.sourceAnchor).toMatch(/A lot is happening/)
    expect(quiz.sourceAnchor).toMatch(/How many countries/)
    expect(quiz.sourceAnchor).toMatch(/Keep the story/)
  })

  it('keeps Audio+Choices+feedback as one 听后含义推断 activity', () => {
    const doc = analyzeActivitiesFromPhased('Test', SAMPLE_V02)
    const step3 = doc.steps.find((s) => s.scriptStep === 3)!
    const titles = step3.activities.map((a) => a.title)
    expect(titles).toContain('听后含义推断')
    expect(titles.filter((t) => t === 'Audio:' || t === 'Choices:')).toEqual([])
    const comp = step3.activities.find((a) => a.title === '听后含义推断')!
    expect(comp.sourceAnchor).toMatch(/Audio:/)
    expect(comp.sourceAnchor).toMatch(/Choices:/)
    expect(comp.sourceAnchor).toMatch(/Exactly/)
    expect(comp.sourceAnchor).not.toMatch(/Student repeats/)
    expect(comp.selectedComponentId).toBe('CMP-33')
    expect(comp.candidates[0]!.id).toBe('CMP-33')
  })

  it('names activities instead of stage directions', () => {
    expect(
      nameActivity(
        'Audio:\n你是哪国人？\nChoices:\nA. x\nStudent chooses B.\nKai:\nExactly.',
        '理解问句',
        0,
      ),
    ).toBe('听后含义推断')
  })

  it('recommends CMP-33 over CMP-13 for 听后含义推断 (direct Q, no focus lemma)', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 3. CONTEXT STORY
> 教学目的: 理解"你是哪国人？"的含义
> 建议 component: CMP-13, CMP-05, CMP-08

**Audio:**
你是哪国人？
**Kai:**
What is the teacher trying to find out?
**Choices:**
A. Tom's name
B. Where Tom is from
C. If Tom is a teacher
**Student chooses B.**
**Kai:**
Exactly.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const inf = doc.steps
      .find((s) => s.scriptStep === 3)!
      .activities.find((a) => a.title === '听后含义推断')!
    expect(inf.candidates[0]!.id).toBe('CMP-33')
    expect(inf.selectedComponentId).toBe('CMP-33')
    expect(inf.candidates.find((c) => c.recommended)?.id).toBe('CMP-33')
    expect(inf.selectionThinking).toMatch(/直接理解|焦点/)
    const c13 = inf.candidates.find((c) => c.id === 'CMP-13')
    expect(c13?.rationale).toMatch(/焦点|不太适合|次选/)
  })

  it('recommends CMP-13 when the MCQ is guessing a focus lemma', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 11. DISCOVERY
> 教学目的: 理解"朋友"的含义
> 建议 component: CMP-33

**Highlight:**
朋友
**Kai:**
What do you think 朋友 means?
**Choices:**
A. Teacher
B. Friend
C. Student
**Student chooses B.**
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const acts = doc.steps.find((s) => s.scriptStep === 11)!.activities
    const guess =
      acts.find((a) => /朋友|含义/.test(a.title)) || acts[acts.length - 1]!
    expect(guess.candidates[0]!.id).toBe('CMP-13')
    expect(guess.selectedComponentId).toBe('CMP-13')
    expect(guess.selectionThinking).toMatch(/焦点|目标词/)
  })

  it('hasFocusLemma is true only when a target word should be magnified', () => {
    expect(
      hasFocusLemma(
        '探索「朋友」含义',
        'Highlight:\n朋友\nKai:\nWhat do you think 朋友 means?',
      ),
    ).toBe(true)
    expect(
      hasFocusLemma(
        '发现构词规律',
        'Highlight:\n人\nKai:\nWhat do you think 人 is doing here?\nChoices:\nA. Asking a question\nB. Talking about a person from that country',
      ),
    ).toBe(true)
    expect(
      hasFocusLemma(
        '听辨练习：问名字',
        'Kai asks:\n你叫什么名字？\nChoices:\nA. Name\nB. Country\nStudent chooses: Name',
      ),
    ).toBe(true)
    expect(
      hasFocusLemma(
        '听辨练习：问国籍',
        'Kai asks:\n你是哪国人？\nChoices:\nA. Name\nB. Country\nStudent chooses: Country',
      ),
    ).toBe(true)
    expect(
      hasFocusLemma(
        '听后含义推断',
        'Kai:\nWhat is the teacher trying to find out?\nChoices:\nA. Tom\'s name',
      ),
    ).toBe(false)
  })

  it('flattens selections into mapped steps from sourceAnchor not full v0.2 body', () => {
    const doc = analyzeActivitiesFromPhased('Test', SAMPLE_V02)
    expect(validateV031Selections(doc)).toEqual([])
    const mapped = v031ToMappedSteps(doc, SAMPLE_V02)
    expect(mapped.length).toBe(3)
    expect(mapped.every((s) => s.components.length >= 1)).toBe(true)

    // Explicit: outline must track 原文锚点, not re-slice whole step body
    const synthetic: ReturnType<typeof analyzeActivitiesFromPhased> = {
      version: 'v0.3.1',
      missionName: 'AnchorTest',
      steps: [
        {
          phase: 'P2',
          scriptStep: 7,
          name: 'USE',
          purpose: '表达国籍',
          activities: [
            {
              id: '7.2',
              title: '指人说「他是英国人」',
              intent: '提示后产出',
              sourceAnchor:
                'Then Kai shows Tom. Kai: Tom is from the UK. Say it. Student: 他是英国人。',
              candidates: [
                {
                  id: 'CMP-24',
                  nameZh: '单轮情境口语作答',
                  rationale: 'test',
                  recommended: true,
                },
              ],
              selectedComponentId: 'CMP-24',
            },
          ],
        },
      ],
    }
    const poisonedV02 = `# Mission
### script_step 7. USE
> 教学目的: 表达国籍
Listen and choose. Name Country. YOUR MISSION. Video plays. 全脚本噪声
Then Kai shows Tom. Say it. 他是英国人。
`
    const rows = v031ToMappedSteps(synthetic, poisonedV02)
    expect(rows[0]!.components[0]!.outline).toMatch(/他是英国人/)
    expect(rows[0]!.components[0]!.outline).toMatch(/Kai shows Tom/)
    expect(rows[0]!.components[0]!.outline).not.toMatch(/Listen and choose/)
    expect(rows[0]!.components[0]!.outline).not.toMatch(/YOUR MISSION/)
  })

  it('applyV031Selections supports add and delete activities', async () => {
    const { applyV031Selections } = await import('./n2ActivityAnalysis.js')
    const doc = analyzeActivitiesFromPhased('Test', SAMPLE_V02)
    const step2 = doc.steps.find((s) => s.scriptStep === 2)!
    expect(step2.activities.length).toBeGreaterThanOrEqual(2)
    const kept = step2.activities[0]!
    const next = applyV031Selections(doc, {
      steps: [
        {
          scriptStep: 2,
          activities: [
            {
              id: kept.id,
              title: kept.title,
              intent: kept.intent,
              sourceAnchor: kept.sourceAnchor,
              selectedComponentId: kept.selectedComponentId,
              candidates: kept.candidates,
            },
            {
              id: '2.99',
              title: '手工新增活动',
              intent: 'CD 自建',
              sourceAnchor: 'extra',
              selectedComponentId: kept.selectedComponentId,
            },
          ],
        },
      ],
    })
    const s2 = next.steps.find((s) => s.scriptStep === 2)!
    expect(s2.activities.length).toBe(2)
    expect(s2.activities[1]!.title).toBe('手工新增活动')
  })

  it('handles mission 7194dded script_step 3 as pedagogical units', () => {
    const root = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../missions/runtime/7194dded-5388-4159-8df8-8142dcae0e18',
    )
    const md = readFileSync(resolve(root, 'v0.2_phased_script.md'), 'utf8')
    const doc = analyzeActivitiesFromPhased('Mission', md)
    const step3 = doc.steps.find((s) => s.scriptStep === 3)!
    expect(step3).toBeTruthy()
    const titles = step3.activities.map((a) => a.title)
    expect(titles.some((t) => /Audio:|Choices:/.test(t))).toBe(false)
    expect(titles).toContain('听后含义推断')
    const comp = step3.activities.find((a) => a.title === '听后含义推断')!
    expect(comp.sourceAnchor).toMatch(/What is the teacher trying to find out/)
    expect(comp.sourceAnchor).toMatch(/Student chooses B/)
    expect(comp.sourceAnchor).toMatch(/Exactly/)
  })

  it('ranks CMP-11/07/10 for 对比已学问句, not CMP-13', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 4. CONNECT
> 教学目的: 关联已学知识，区分"问名字"和"问国家"两种问句
> 建议 component: CMP-13, CMP-29

**Screen:**
你叫什么名字？
你是哪国人？
**Kai:**
Two questions.
Both help you get to know someone.
Listen and choose.
**Kai asks:**
你叫什么名字？
**Student chooses:**
Name
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step4 = doc.steps.find((s) => s.scriptStep === 4)!
    const contrast = step4.activities.find((a) => a.title.includes('对比'))
    expect(contrast).toBeTruthy()
    const top = contrast!.candidates.slice(0, 3).map((c) => c.id)
    expect(top[0]).toBe('CMP-11')
    expect(top).toEqual(expect.arrayContaining(['CMP-11', 'CMP-07', 'CMP-10']))
    expect(contrast!.selectedComponentId).toBe('CMP-11')
    expect(contrast!.selectionThinking).toMatch(/对比/)
    expect(contrast!.selectionThinking).toMatch(/不是先做选择题/)
    expect(contrast!.candidates[0]!.rationale).toMatch(/例句|适合/)
    const mcq = contrast!.candidates.find((c) => c.id === 'CMP-13')
    if (mcq) {
      expect(mcq.rationale).toMatch(/不适合|单项选择/)
    }
  })

  it('splits parallel Listen-and-choose into two single-choice activities', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 4. CONNECT
> 教学目的: 关联已学知识，区分"问名字"和"问国家"两种问句
> 建议 component: CMP-13, CMP-29

**Screen:**
你叫什么名字？
你是哪国人？
**Kai:**
Two questions.
Both help you get to know someone.
Listen and choose.
**Kai asks:**
你叫什么名字？
**Student chooses:**
Name
**Kai asks:**
你是哪国人？
**Student chooses:**
Country
**Kai:**
好！
One question finds out a name.
One question finds out where someone is from.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step4 = doc.steps.find((s) => s.scriptStep === 4)!
    const titles = step4.activities.map((a) => a.title)
    expect(titles).toContain('对比已学问句')
    expect(titles).toContain('听辨练习：问名字')
    expect(titles).toContain('听辨练习：问国籍')
    const nameQ = step4.activities.find((a) => a.title === '听辨练习：问名字')!
    const countryQ = step4.activities.find((a) => a.title === '听辨练习：问国籍')!
    expect(nameQ.sourceAnchor).toMatch(/你叫什么名字/)
    expect(nameQ.sourceAnchor).toMatch(/Name/)
    expect(nameQ.sourceAnchor).not.toMatch(/你是哪国人/)
    expect(countryQ.sourceAnchor).toMatch(/你是哪国人/)
    expect(countryQ.sourceAnchor).toMatch(/Country/)
    expect(nameQ.sourceAnchor).toMatch(/Choices:|A\. Name/)
    expect(countryQ.sourceAnchor).toMatch(/Choices:|A\. Name/)
    expect(nameQ.selectedComponentId).toBe('CMP-13')
    expect(countryQ.selectedComponentId).toBe('CMP-13')
    expect(nameQ.candidates[0]!.id).toBe('CMP-13')
    expect(countryQ.candidates[0]!.id).toBe('CMP-13')
    expect(nameQ.selectionThinking).toMatch(/知识点|旧知|焦点/)
    expect(countryQ.selectionThinking).toMatch(/知识点|焦点/)
  })

  it('regroups Replay + multi country focus into 5 activities', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 5. DISCOVERY — COUNTRY + 人
> 教学目的: 发现"国家 + 人 = 国家人"的构词规律
> 建议 component: CMP-11, CMP-13, CMP-29

**Replay.**
Tom：我是英国人。

**Freeze.**

**Kai:**
Tom is from the UK.
Listen.

**Audio:**
英国人。

**Screen shows UK flag / map.**
英国人

Then replay Emma.
Tom：她是美国人。

**Screen shows US flag / map.**
美国人

Then Jayden.
Emma：他是中国人。

**Screen shows China flag / map.**
中国人

**Screen:**
英国人
美国人
中国人

**Kai:**
What do you notice?

**Student taps 人.**

**Kai:**
Exactly.
The same character appears every time.

**Highlight:**
人

**Kai:**
What do you think 人 is doing here?

**Choices:**
A. Asking a question
B. Talking about a person from that country
C. Saying goodbye

**Student chooses B.**

**Kai:**
Exactly. 😄

**Screen:**
中国 + 人 → 中国人
美国 + 人 → 美国人
英国 + 人 → 英国人

**Kai:**
Country + 人.
A person from that country.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step5 = doc.steps.find((s) => s.scriptStep === 5)!
    expect(step5).toBeTruthy()
    const titles = step5.activities.map((a) => a.title)
    expect(titles).toEqual([
      '情境回放聚焦目标知识点',
      '聚焦知识点「英国人」',
      '聚焦知识点「美国人」',
      '聚焦知识点「中国人」',
      '发现构词规律',
      '句型规律识别',
    ])
    const replay = step5.activities[0]!
    expect(replay.sourceAnchor).toMatch(/我是英国人/)
    expect(replay.sourceAnchor).toMatch(/她是美国人/)
    expect(replay.sourceAnchor).toMatch(/他是中国人/)
    expect(replay.sourceAnchor).not.toMatch(/Screen shows UK/i)
    expect(step5.activities[1]!.sourceAnchor).toMatch(/英国人/)
    expect(step5.activities[1]!.sourceAnchor).toMatch(/Screen shows UK/i)
    expect(step5.activities[2]!.sourceAnchor).toMatch(/美国人/)
    expect(step5.activities[3]!.sourceAnchor).toMatch(/中国人/)
    expect(step5.activities[4]!.sourceAnchor).toMatch(/What do you notice/)
    expect(step5.activities[4]!.sourceAnchor).not.toMatch(/中国 \+ 人/)
    expect(step5.activities[4]!.selectedComponentId).toBe('CMP-13')
    expect(step5.activities[4]!.candidates[0]!.id).toBe('CMP-13')
    expect(step5.activities[4]!.selectionThinking).toMatch(/知识点|焦点/)
    expect(step5.activities[5]!.sourceAnchor).toMatch(/中国 \+ 人/)
    expect(step5.activities[5]!.sourceAnchor).toMatch(/Country \+ 人/)
    expect(step5.activities[5]!.selectedComponentId).toBe('CMP-07')
    expect(step5.activities[5]!.candidates[0]!.id).toBe('CMP-07')
    expect(step5.activities[5]!.selectionThinking).toMatch(
      /观察结果|公式|CMP-07/,
    )
    const patternNotice = step5.activities[5]!.candidates.find(
      (c) => c.id === 'CMP-11',
    )
    expect(patternNotice?.rationale).toMatch(/公式|不太适合/)
    for (const lemma of ['英国人', '美国人', '中国人'] as const) {
      const card = step5.activities.find((a) => a.title === `聚焦知识点「${lemma}」`)!
      expect(card.selectedComponentId).toBe('CMP-10')
      expect(card.candidates[0]!.id).toBe('CMP-10')
      expect(card.selectionThinking).toMatch(/图文|知识点/)
      const c09 = card.candidates.find((c) => c.id === 'CMP-09')
      expect(c09?.rationale).toMatch(/汉字|不太适合|次选/)
    }
  })

  it('splits step7 into self-Q&A plus per-person 指人说 activities', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 7. USE BEFORE MEMORY
> 教学目的: 在真实情境中使用"我是___人"表达国籍
> 建议 component: CMP-08 (听音跟读) + CMP-15 (角色扮演对话) + CMP-16

**Kai asks student:**
请问，你是哪国人？

**Student answers based on profile / choice:**
我是中国人。
or
我是英国人。
or
我是美国人。

**Kai:**
Got it. 😄
You just said where you are from in Chinese.

Then Kai shows Tom.
**Kai:**
Tom is from the UK.
Say it.
**Student:**
他是英国人。

Kai shows Emma.
**Kai:**
Emma is from America.
**Student:**
她是美国人。

Kai shows Anna. Kai: Anna is also from America
Student: 她也是美国人

Kai shows Jayden.
**Kai:**
Jayden is from China.
**Student:**
他是中国人。

**Kai:**
好！
You can now talk about where other people are from too.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step7 = doc.steps.find((s) => s.scriptStep === 7)!
    const titles = step7.activities.map((a) => a.title)
    expect(titles[0]).toMatch(/对话练习|说出自己的国籍/)
    expect(titles).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/指人说「他是英国人」/),
        expect.stringMatching(/指人说「她是美国人」/),
        expect.stringMatching(/指人说「她也是美国人」/),
        expect.stringMatching(/指人说「他是中国人」/),
      ]),
    )
    expect(titles.some((t) => /听音跟读/.test(t))).toBe(false)
    expect(
      step7.activities.some((a) =>
        /听音跟读目标句（audio/.test(a.sourceAnchor),
      ),
    ).toBe(false)
    const tom = step7.activities.find((a) => /他是英国人/.test(a.title))!
    expect(tom.selectedComponentId).toBe('CMP-24')
    expect(tom.candidates.slice(0, 3).map((c) => c.id)).toEqual(
      expect.arrayContaining(['CMP-24', 'CMP-25']),
    )
  })

  it('splits 的 discovery into meaning check, chunk-build, and pattern present', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 10. DISCOVERY — 的
> 教学目的: 发现中文所有格"的"的意义与用法
> 建议 component: CMP-11, CMP-07, CMP-13, CMP-12

**Screen:**
你的朋友
我的朋友
**Kai:**
Look carefully.
Highlight 的.
**Kai:**
What do you think 的 is doing?
**Choices:**
A. Shows who someone belongs or connects to
B. Makes a question
C. Says no
**Student chooses A.**
**Kai:**
Exactly.
我的 means my.
你的 means your.
**Screen:**
我 → 我的
你 → 你的
**Kai:**
Can you predict these?
**Screen:**
他 → ?
她 → ?
**Student builds:**
他的
她的
**Kai:**
You found it.
**Screen:**
我 → 我的
你 → 你的
他 → 他的
她 → 她的
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step10 = doc.steps.find((s) => s.scriptStep === 10)!
    const titles = step10.activities.map((a) => a.title)
    expect(titles).toEqual([
      '发现「的」表所属',
      '词块造句',
      '句型呈现',
    ])
    const meaning = step10.activities[0]!
    expect(meaning.sourceAnchor).toMatch(/What do you think 的/)
    expect(meaning.sourceAnchor).not.toMatch(/Student builds/)
    expect(meaning.selectedComponentId).toBe('CMP-13')

    const build = step10.activities[1]!
    expect(build.sourceAnchor).toMatch(/Student builds/)
    expect(build.sourceAnchor).toMatch(/他的/)
    expect(build.sourceAnchor).toMatch(/You found it/)
    expect(build.sourceAnchor).not.toMatch(/她 → 她的/)
    expect(build.selectedComponentId).toBe('CMP-12')

    const present = step10.activities[2]!
    expect(present.sourceAnchor).toMatch(/我 → 我的/)
    expect(present.sourceAnchor).toMatch(/她 → 她的/)
    expect(present.sourceAnchor).not.toMatch(/Student builds/)
    expect(present.selectedComponentId).toBe('CMP-07')
    expect(present.selectionThinking).toMatch(/观察结果|公式|CMP-07/)
  })

  it('splits 朋友 discovery on Replay / Visual / Highlight / repeat keywords', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 11. DISCOVERY — 朋友
> 教学目的: 理解"朋友"的含义
> 建议 component: CMP-03, CMP-09, CMP-33, CMP-08

**Replay.**
Tom：
她是我的朋友。
Freeze.
Visual: Tom and Emma smiling together.
Kai:
Tom and Emma know each other.
They study together.
You already know:
同学
Emma is Tom's 同学.
But Tom says another word.
Replay:
她是我的朋友。
Highlight:
朋友
Kai:
Look at them.
What do you think 朋友 means?
Choices:
A. Teacher
B. Friend
C. Student
Student chooses B.
Kai:
Exactly.
朋友 — péng you — friend.
Audio.
Student repeats.
Kai:
Emma is Tom's classmate.
She is also his friend.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step11 = doc.steps.find((s) => s.scriptStep === 11)!
    const titles = step11.activities.map((a) => a.title)
    expect(titles).toEqual([
      '情境回放聚焦目标知识点',
      '看图：对照「同学」',
      '情境回放聚焦目标知识点',
      '探索「朋友」含义',
      '听音跟读目标句',
    ])

    const replay1 = step11.activities[0]!
    expect(replay1.sourceAnchor).toMatch(/Replay/)
    expect(replay1.sourceAnchor).toMatch(/她是我的朋友/)
    expect(replay1.sourceAnchor).toMatch(/Freeze/)
    expect(replay1.sourceAnchor).not.toMatch(/Visual:/)
    expect(replay1.sourceAnchor).not.toMatch(/Highlight/)
    expect(replay1.selectedComponentId).toMatch(/CMP-0[35]/)

    const visual = step11.activities[1]!
    expect(visual.sourceAnchor).toMatch(/Visual:/)
    expect(visual.sourceAnchor).toMatch(/同学/)
    expect(visual.sourceAnchor).not.toMatch(/Highlight/)
    expect(visual.selectedComponentId).toBe('CMP-09')

    const replay2 = step11.activities[2]!
    expect(replay2.sourceAnchor).toMatch(/Replay/)
    expect(replay2.sourceAnchor).toMatch(/她是我的朋友/)
    expect(replay2.sourceAnchor).not.toMatch(/Highlight/)
    expect(replay2.sourceAnchor).not.toMatch(/Choices/)
    expect(replay2.selectedComponentId).toMatch(/CMP-0[35]/)

    const meaning = step11.activities[3]!
    expect(meaning.sourceAnchor).toMatch(/Highlight/)
    expect(meaning.sourceAnchor).toMatch(/What do you think 朋友/)
    expect(meaning.sourceAnchor).toMatch(/Choices/)
    expect(meaning.sourceAnchor).not.toMatch(/Student repeats/)
    expect(meaning.selectedComponentId).toBe('CMP-13')

    const repeat = step11.activities[4]!
    expect(repeat.sourceAnchor).toMatch(/Student repeats/)
    expect(repeat.selectedComponentId).toBe('CMP-08')
  })

  it('recommends CMP-15 for Story + multi-round Friend role-play, not CMP-11', () => {
    const md = `# Mission
## Phase 2 — Knowledge Discovery
### script_step 13. PRACTICE — COUNTRY + FRIEND
> 教学目的: 综合练习姓名问句、国籍问句、朋友表达
> 建议 component: CMP-15

**Story**
Kai:Great!
Now you know how to ask where someone is from.
Let's go and meet your new friends.
Some students have just arrived at the International Chinese School.
Can you help welcome them?

**Friend 1 (Full Support)**
Kai:
Let's do the first one together.
Emma walks over.
Emma：
你好！
Kai:
Start by asking her name.
On Screen
请问，你叫什么名字？
Student
请问，你叫什么名字？
Emma
我叫 Emma。
Kai
Now ask where she is from.
On Screen
请问，你是哪国人？
Student
请问，你是哪国人？
Emma
我是美国人。
On Screen
她是你的朋友吗？
Student
是。她是我的朋友。

**Friend 2 (Reduced Support)**
Kai
Now try with Tom.
Only keywords appear.
名字
哪国人
朋友
Student decides what to say.

**Friend 3 (Minimal Support)**
Kai
I'll let you take the lead.
Goal
✔ Learn the student's name.
✔ Find out where they are from.
✔ Make a new friend.
`
    const doc = analyzeActivitiesFromPhased('Test', md)
    const step13 = doc.steps.find((s) => s.scriptStep === 13)!
    expect(step13.activities.length).toBe(1)
    const rp = step13.activities[0]!
    expect(rp.title).toMatch(/角色扮演|综合练习/)
    expect(rp.selectedComponentId).toBe('CMP-15')
    expect(rp.candidates[0]!.id).toBe('CMP-15')
    expect(rp.selectionThinking).toMatch(/角色扮演|综合练习/)
    expect(rp.selectionThinking).toMatch(/CMP-15/)
    expect(rp.selectionThinking).not.toMatch(/要展示并对比/)
    const c11 = rp.candidates.find((c) => c.id === 'CMP-11')
    if (c11) {
      expect(c11.rationale).toMatch(/不适合|对话|扮演/)
    }
  })
})
