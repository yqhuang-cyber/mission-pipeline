import { describe, expect, it } from 'vitest'
import {
  fillDisplayTextTemplate,
  getMasterComponentsPayload,
  resolveComponentFamily,
} from '../master/catalog.js'
import { keyFieldsFor } from '../master/keyFields.js'
import { parseSteppedScript } from '../validators/n2.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('master catalog for v0.3 editor', () => {
  it('loads components with keyFields and previews', () => {
    const { components, phaseAllowed } = getMasterComponentsPayload()
    expect(components.length).toBeGreaterThanOrEqual(30)
    const c33 = components.find((c) => c.id === 'CMP-33')
    expect(c33?.nameZh).toMatch(/选择/)
    expect(c33?.nameEn).toMatch(/Single Choice/i)
    expect(c33?.template).toMatch(/【题目】|【题干】/)
    expect(c33?.phases).toContain('P1')
    expect(c33?.keyFields).toBe(keyFieldsFor('CMP-33'))
    expect(c33?.previewImages?.[0]).toMatch(/CMP-33/)
    expect(phaseAllowed.P1).toContain('CMP-33')
    expect(phaseAllowed.P1).toContain('CMP-19')
    expect(phaseAllowed.P4).toContain('CMP-03')
  })

  it('fills CMP-32 DisplayText from example chrome + outline goals', () => {
    const outline =
      "学习目标: Today, you'll meet friends from different countries. **Screen:** YOUR MISSION Meeting Friends from Around the World By the end of this mission, you can: ✓ Ask where someone is from ✓ Say where you are from ✓ Talk about Chinese, American and British people ✓ Say who your friend is"
    const dt = fillDisplayTextTemplate('CMP-32', outline, '明确任务', {
      topic: 'Meeting Friends from Around the World',
    })
    expect(dt).toContain('[页眉] Welcome to your Chinese lesson!')
    expect(dt).toMatch(/\[副标题\] Today's topic: Meeting Friends/)
    expect(dt).toContain('[卡片标题] Mission goals')
    expect(dt).toMatch(/【目标】\s*Ask where someone is from/)
    expect(dt).toMatch(/【目标】\s*Say where you are from/)
    expect(dt).toMatch(
      /【目标】\s*Talk about Chinese, American and British people/,
    )
    expect(dt).not.toMatch(/\[页眉\] NA/)
    expect(dt).not.toMatch(/【目标】\s*\[待补/)
  })

  it('recovers clipped goals from missionGoals bank', () => {
    const outline =
      "学习目标: By the end of this mission, you can: ✓ Ask where someone is from ✓ Say where you are from ✓ Talk about C…"
    const dt = fillDisplayTextTemplate('CMP-32', outline, '明确任务', {
      missionGoals: [
        'Ask where someone is from',
        'Say where you are from',
        'Talk about Chinese, American and British people',
        'Say who your friend is',
        'Ask if someone is your friend',
      ],
    })
    expect(dt).toContain('Talk about Chinese, American and British people')
    expect(dt).not.toMatch(/Talk about C…/)
    expect(dt).toContain('Ask if someone is your friend')
  })

  it('parses CMP-33 single-choice question/options/answer without letter-in-word slices', () => {
    const outline =
      '选择题（传统版）: How many countries did you hear **Student choices:** A 1 B 2 C 3 Where is Tom come from? **Kai:** Keep the story in mind.'
    const dt = fillDisplayTextTemplate('CMP-33', outline, '首次故事沉浸')
    expect(dt).toMatch(/【题目】\s*How many countries did you hear\?/)
    expect(dt).toMatch(/【A】\s*1/)
    expect(dt).toMatch(/【B】\s*2/)
    expect(dt).toMatch(/【C】\s*3/)
    expect(dt).not.toMatch(/【A】\s*ny countries/)
    expect(dt).not.toMatch(/Student choices/)
    expect(dt).toMatch(/【答案】/)
  })

  it('extracts single answer letter for choice components', () => {
    const outline =
      "【题目】What is the teacher trying to find out?\nStudent choices: A. Tom's name B. Where Tom is from C. If Tom is a teacher\nStudent chooses B."
    const dt = fillDisplayTextTemplate('CMP-13', outline, '感知问句')
    expect(dt).toMatch(/【题目】\s*What is the teacher trying to find out\?/)
    expect(dt).toMatch(/【A】\s*Tom's name/)
    expect(dt).toMatch(/【B】\s*Where Tom is from/)
    expect(dt).toMatch(/【C】\s*If Tom is a teacher/)
    expect(dt).toMatch(/【答案】\s*B/)
    expect(dt).not.toMatch(/【答案】\s*\[待补/)
  })

  it('parses Student selects text answer and Screen blank prompt (CMP-13)', () => {
    const outline =
      '迁移：用他/她问国籍: **Screen:** 你是哪国人？ **Kai shows Tom.** **Kai:** You can ask you. But what if we ask about him? **Screen:** 他是___？ **Choices:** A. 他是哪国人？ B. 他叫什么名字？ C. 他是老师吗？ **Student selects:** 他是哪国人？ **Kai:** Exactly.'
    const dt = fillDisplayTextTemplate('CMP-13', outline, '学习用他/她问国籍')
    expect(dt).toMatch(/【题目】\s*他是___？/)
    expect(dt).toMatch(/【A】\s*他是哪国人？/)
    expect(dt).toMatch(/【B】\s*他叫什么名字？/)
    expect(dt).toMatch(/【C】\s*他是老师吗？/)
    expect(dt).not.toMatch(/Student selects/)
    expect(dt).toMatch(/【答案】\s*A/)
    expect(dt).not.toMatch(/\[待补/)
    expect(dt).toMatch(/【焦点】\s*他/)
  })

  it('fills CMP-04 title and start button from outline/example', () => {
    const outline =
      'Mission 发布: YOUR MISSION Meeting Friends from Around the World By the end of this mission, you can: ✓ Ask where someone is from START MISSION'
    const dt = fillDisplayTextTemplate('CMP-04', outline, '发布任务')
    expect(dt).toMatch(/【任务标题】\s*Meeting Friends from Around the World/)
    expect(dt).toMatch(/\[开始按钮\]\s*/)
    expect(dt).not.toMatch(/开始按钮\]\s*NA/)
  })

  it('routes components to the right DisplayText family', () => {
    expect(resolveComponentFamily('CMP-33', 'single-choice-legacy')).toBe(
      'single-choice',
    )
    expect(resolveComponentFamily('CMP-32', 'learning-goals')).toBe(
      'learning-goals',
    )
    expect(resolveComponentFamily('CMP-03', 'video', '无')).toBe('none')
    expect(resolveComponentFamily('CMP-28', 'self-assess')).toBe('self-assess')
  })

  it('fills CMP-12 from v0.3.1 Student builds / says anchors', () => {
    const outline =
      '构建「中国人」: Kai: Let\'s try. Screen shows China. Student builds: 中国 + 人 Student says: 中国人 Kai: 中国人。'
    const dt = fillDisplayTextTemplate('CMP-12', outline, '练习构建"国家人"词汇')
    expect(dt).toMatch(/【题目】\s*Let's try to build/)
    expect(dt).toMatch(/【字块】\s*中国，人/)
    expect(dt).toMatch(/【答案】\s*中国人/)
    expect(dt).not.toMatch(/【答案】\s*构建/)
    expect(dt).not.toMatch(/\[待补/)
  })

  it('fills CMP-12 when Student builds a full sentence (no + chunks)', () => {
    const outline =
      '词块造句 / 句型建构: Student builds:** 她是哪国人？ **Kai:** Perfect. You already knew 他 and 她. Now you can use them in a new question.'
    const dt = fillDisplayTextTemplate('CMP-12', outline, '学习用他/她问国籍')
    expect(dt).toMatch(/【题目】\s*Build: 她是哪国人？/)
    expect(dt).toMatch(/【字块】\s*她，是，哪国人/)
    expect(dt).toMatch(/【答案】\s*她是哪国人？/)
    expect(dt).not.toMatch(/【答案】\s*词块造句/)
    expect(dt).not.toMatch(/\[待补/)
  })

  it('fills 的 discovery trio from v0.3.1-style anchors', () => {
    const dt13 = fillDisplayTextTemplate(
      'CMP-13',
      '发现「的」表所属: **Highlight:** 的 **Kai:** Something changed. What do you think 的 is doing? **Choices:** A. Shows who someone belongs or connects to B. Makes a question C. Says no Student chooses A.',
      '发现的',
    )
    expect(dt13).toMatch(/【焦点】\s*的/)
    expect(dt13).toMatch(/【题目】\s*What do you think 的 is doing\?/)
    expect(dt13).toMatch(/【答案】\s*A/)

    const dt12 = fillDisplayTextTemplate(
      'CMP-12',
      '构建「他的 / 她的」: Student builds:** 他的 她的 **Kai:** You found it.',
      '发现的',
    )
    expect(dt12).toMatch(/【字块】\s*他，她，的/)
    expect(dt12).toMatch(/【答案】\s*他的，她的/)

    const dt11 = fillDisplayTextTemplate(
      'CMP-11',
      '句型观察：我/你/他/她 → 的: Screen:\n我 → 我的\n你 → 你的\n他 → 他的\n她 → 她的',
      '发现的',
    )
    expect(dt11).toMatch(/\[顶标\]\s*Pattern/)
    expect(dt11).toMatch(/【例句】\s*我 → 我的/)
    expect(dt11).toMatch(/【例句】\s*她 → 她的/)
    expect(dt11).not.toMatch(/【例句】\s*她 → 的\n/)
  })

  it('fills CMP-08 from 汉字 — pinyin — gloss (not activity title)', () => {
    const dt = fillDisplayTextTemplate(
      'CMP-08',
      '听音跟读“朋友”: 朋友 — péng you — friend.\nAudio.\nStudent repeats. CMP-08 听音跟读\nKai:\nEmma is Tom’s classmate.\nShe is also his friend.',
      '理解朋友',
    )
    expect(dt).toMatch(/【汉字】\s*朋友/)
    expect(dt).toMatch(/【拼音】\s*péng you/)
    expect(dt).toMatch(/\[重读\]\s*朋 péng/)
    expect(dt).not.toMatch(/【汉字】\s*听音跟读/)
  })

  it('fills CMP-07 pattern formula from Screen + [PERSON] line', () => {
    const dt = fillDisplayTextTemplate(
      'CMP-07',
      '**Screen:** 她是我的朋友。 **Kai:** Look at the pattern. **Screen:** [PERSON] + 是 + [MY/YOUR/HIS/HER] + 朋友 **',
      '掌握句型',
    )
    expect(dt).toMatch(/\[顶标\]\s*Pattern/)
    expect(dt).toMatch(/【左侧】\s*她是我的朋友/)
    expect(dt).toMatch(/【右侧】\s*\[PERSON\] \+ 是 \+ \[MY\/YOUR\/HIS\/HER\] \+ 朋友/)
    expect(dt).toMatch(/【符号】\s*\+/)
    expect(dt).toMatch(/【高亮】\s*是/)
  })

  it('fills CMP-35 from Student line + Kai English cue (not F example)', () => {
    const dt = fillDisplayTextTemplate(
      'CMP-35',
      'Kai shows Emma.** **Kai:** Emma is my friend. **Student:** 她是我的朋友。 **',
      '指人说',
    )
    expect(dt).toMatch(/【汉字】\s*她是我的朋友/)
    expect(dt).toMatch(/\[英文\]\s*Emma is my friend/)
    expect(dt).not.toMatch(/对不起/)
  })

  it('fills CMP-15 role-play turns from Emma welcome outline', () => {
    const outline = `Story
Kai:Great!
Now you know how to ask where someone is from.
Let’s go and meet your new friends.
Some students have just arrived at the International Chinese School.
Can you help welcome them?

Friend 1 (Full Support)
Kai:
Let’s do the first one together.
Emma walks over.
Emma:
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
Great!
Now ask where she is from.
On Screen
请问，你是哪国人？
Student
请问，你是哪国人？
Emma
我是美国人。
Kai
Excellent.
Now tell me…
Is Emma your friend?
On Screen
她是你的朋友吗？
Student
是。她是我的朋友。
Emma smiles.`
    const dt = fillDisplayTextTemplate('CMP-15', outline, '综合练习')
    expect(dt).toMatch(/\[场景\].*International Chinese School/)
    expect(dt).toMatch(/\[顶标\]\s*Role Play/)
    expect(dt).toMatch(/【Emma】\s*你好！/)
    expect(dt).toMatch(/【user】\s*请问，你叫什么名字？/)
    expect(dt).toMatch(/【Emma】\s*我叫 Emma。/)
    expect(dt).toMatch(/【user】\s*是。她是我的朋友。/)
    expect(dt).not.toMatch(/对不起，我不是老师/)
  })

  it('parses table-based runtime v0.3', () => {
    const path = resolve(
      process.cwd(),
      '../../missions/runtime/2592b1d2-9275-4eae-a34b-f611de986a94/v0.3_step_component_map.md',
    )
    const md = readFileSync(path, 'utf8')
    const steps = parseSteppedScript(md)
    expect(steps.length).toBeGreaterThan(5)
    const s2 = steps.find((s) => s.scriptStep === 2)
    expect(s2?.components.map((c) => c.id)).toEqual(['CMP-03', 'CMP-33'])
  })
})
