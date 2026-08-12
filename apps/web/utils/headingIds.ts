/** Shared heading → id so TOC scroll targets match rendered markdown */

export function headingAnchorId(plainText: string): string | null {
  const plain = plainText.replace(/<[^>]+>/g, '').trim()
  const phase = /^Phase\s+([1-4])\b/i.exec(plain)
  if (phase) return `phase-${phase[1]}`

  const step = /^script_step\s+(\d+)(?:\.\s*|\s+)(.+)$/i.exec(plain)
  if (step) {
    const index = step[1]!
    const rest = step[2]!.trim()
    const isCanonical = /^script_step\s+\d+\./i.test(plain)
    if (isCanonical) return `step-${index}`
    const slug = rest
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    return `step-${index}-${slug || 'extra'}`
  }
  return null
}

export function slugHeading(plainText: string): string {
  return (
    headingAnchorId(plainText) ||
    plainText
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
  )
}
