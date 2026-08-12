import { marked } from 'marked'
import { slugHeading } from './headingIds'

/** Render markdown with stable ids for Phase / script_step headings */
export function renderArtifactMarkdown(md: string): string {
  const renderer = new marked.Renderer()

  renderer.heading = ({ text, depth }) => {
    const plain = text.replace(/<[^>]+>/g, '')
    const id = slugHeading(plain)
    return `<h${depth} id="${id}">${text}</h${depth}>\n`
  }

  marked.setOptions({
    gfm: true,
    breaks: false,
  })

  return marked.parse(md, { renderer, async: false }) as string
}
