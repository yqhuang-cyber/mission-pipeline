/**
 * CMP-13 左侧有【焦点】放大框。
 *
 * 用 13：题干里有要标出的知识点，选项是在答「这一点是什么意思 / 问的是什么」。
 * 新旧知一视同仁——旧知复习也要标（【焦点】名字），不只是新词。
 *   例：Kai asks 你叫什么名字？ → A Name / B Country（旧知「名字」）
 *   例：Kai asks 你是哪国人？ → A Name / B Country（新知「哪国人」）
 *   例：What do you think 人 is doing here?（焦点=人）
 *   例：What do you think 朋友 means?
 *
 * 用 33：直接理解题，题干是英文情境问，没有要单独放大的汉字。
 *   例：What is the teacher trying to find out? → Where Tom is from
 */
const ENGLISH_SITUATION_Q =
  /What is the teacher trying to find out|How many countries did you hear|Where is (?:Tom|everyone) from/i

const GLOSS_OPTION =
  /^(?:A|B|C|D)[.)]?\s*(Name|Country|Friend|Teacher)\s*$/i

export function hasFocusLemma(title: string, text: string): boolean {
  const hay = `${title}\n${text}`
  if (/【焦点】|焦点[：:]|Highlight\s*\**:/i.test(hay)) return true
  if (/What do you think\s+[「"“]?[\u4e00-\u9fff]/i.test(hay)) return true
  if (/What does\s+[「"“]?[\u4e00-\u9fff]/i.test(hay)) return true
  if (/你觉得.{0,6}[「"“][\u4e00-\u9fff]/i.test(hay)) return true
  if (
    /探索「[\u4e00-\u9fff]+」|发现「的」|理解[「"][\u4e00-\u9fff]+[」"]的含义/.test(
      title,
    )
  ) {
    return true
  }
  if (isLemmaGlossMcq(title, text)) return true
  return false
}

/** 中文问句/目标词是题目本身，选项是对该知识点的含义或交际功能作答。 */
export function isLemmaGlossMcq(title: string, text: string): boolean {
  const hay = `${title}\n${text}`
  if (ENGLISH_SITUATION_Q.test(hay) && !/What do you think\s+[\u4e00-\u9fff]/i.test(hay)) {
    return false
  }
  if (!hasShortGlossOptions(hay)) return false
  if (/听辨练习|问国籍|问名字/.test(title)) return true
  // 旧知复习：「You already know … 你叫什么名字？」+ Name/Country
  if (/You already know/i.test(hay) && /[\u4e00-\u9fff]/.test(hay)) return true
  if (/Kai asks:\s*[\u4e00-\u9fff]/.test(hay)) return true
  if (/你是哪国人|你叫什么名字|她是你的朋友/.test(hay) && /Choices:|Student chooses/i.test(hay)) {
    return true
  }
  return false
}

function hasShortGlossOptions(text: string): boolean {
  const lines = text.split(/\n/).map((l) =>
    l
      .replace(/\*+/g, '')
      .replace(/^\s*(?:Student chooses:?\s*)/i, '')
      .trim(),
  )
  if (lines.some((l) => GLOSS_OPTION.test(l) || /^(Name|Country|Friend|Teacher)$/i.test(l))) {
    return true
  }
  // Compact: "A. Name B. Country" on one line
  return /A\.?\s*Name\b[\s\S]{0,80}?\bCountry\b/i.test(text)
}
