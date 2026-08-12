/** Key fields shown in v0.3 tables — shared by N2 render + editor */

export function keyFieldsFor(cmp: string): string {
  switch (cmp) {
    case 'CMP-01':
      return 'backgroundVideo, topicTitle'
    case 'CMP-02':
      return 'badge, quiz.question.prompt, options[]'
    case 'CMP-03':
      return 'video.objectKey'
    case 'CMP-04':
      return 'missionTitle, goals[], startButtonLabel'
    case 'CMP-05':
      return 'video.objectKey, ended.subtitle'
    case 'CMP-06':
      return 'badge, TARGET, SOURCE, renderMode'
    case 'CMP-07':
      return 'badge, sentences[], formula[], revealPattern'
    case 'CMP-08':
      return 'audio.objectKey, targetText, pinyin'
    case 'CMP-09':
      return 'imageUrl / asset'
    case 'CMP-10':
      return 'badge, card.zh/pinyin/native, audio'
    case 'CMP-11':
      return 'badge, sentences[], revealPattern'
    case 'CMP-12':
      return 'quiz.question.prompt, options[]'
    case 'CMP-13':
      return 'question, options[], answer'
    case 'CMP-14':
      return 'quiz.question.items[], options[]'
    case 'CMP-15':
      return 'scenario, lines[], badge'
    case 'CMP-16':
      return 'badge, text.zh/pinyin, highlights[]'
    case 'CMP-17':
      return 'threadLines[], TARGET, SOURCE'
    case 'CMP-18':
      return 'missionTitle, goals[], startButtonLabel'
    case 'CMP-19':
      return 'questionEn, assistance, modelAnswer'
    case 'CMP-20':
      return 'ctaLabel, skipLabel'
    case 'CMP-21':
      return 'title, items[].zh/pinyin/native'
    case 'CMP-22':
      return 'nextClassLabel, topicTitle, exitButtonLabel'
    case 'CMP-23':
      return 'image / concept asset'
    case 'CMP-24':
      return 'prompt, placeholder, highlight'
    case 'CMP-25':
      return 'image options / oral target'
    case 'CMP-26':
      return 'title, items[] (short words)'
    case 'CMP-27':
      return 'badge, items[].zh/pinyin/native'
    case 'CMP-28':
      return 'promptText, options[].label'
    case 'CMP-29':
      return 'zh/pinyin/native, radicals, example'
    case 'CMP-30':
      return 'zh/pinyin/native, partOfSpeech, example'
    case 'CMP-31':
      return 'title, structure, explanation, examples[]'
    case 'CMP-32':
      return 'headerTitle, goals[].en/zh'
    case 'CMP-33':
      return 'question, options[], answer'
    case 'CMP-34':
      return 'badge, promptEn, hints[]'
    case 'CMP-35':
      return 'audio, target pronunciation'
    case 'CMP-36':
      return 'summary / celebration fields'
    case 'CMP-37':
      return 'question, options[], multi-select'
    default:
      return 'display text / assets'
  }
}
