import { describe, expect, it } from 'vitest'
import {
  analyzeActivitiesFromPhased,
  nameActivity,
  renderV031,
  validateV031Selections,
  v031ToMappedSteps,
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
    expect(nameQ.selectedComponentId).toMatch(/CMP-13|CMP-33|CMP-02/)
    expect(countryQ.selectedComponentId).toMatch(/CMP-13|CMP-33|CMP-02/)
    expect(nameQ.candidates[0]!.id).toMatch(/CMP-13|CMP-33|CMP-02/)
    expect(countryQ.candidates[0]!.id).toMatch(/CMP-13|CMP-33|CMP-02/)
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
    expect(step5.activities[5]!.sourceAnchor).toMatch(/中国 \+ 人/)
    expect(step5.activities[5]!.sourceAnchor).toMatch(/Country \+ 人/)
    expect(step5.activities[5]!.selectedComponentId).toMatch(
      /CMP-11|CMP-07|CMP-10/,
    )
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
})
