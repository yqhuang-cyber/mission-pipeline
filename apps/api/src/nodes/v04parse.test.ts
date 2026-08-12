import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseV04BundleToEditRows } from './n3.js'
import { parseV04ToRows } from './n4.js'

describe('v04 displaytext parse', () => {
  it('parses ### Display Text code blocks (schema heading with space)', () => {
    const md = readFileSync(
      resolve(
        process.cwd(),
        '../../missions/runtime/7194dded-5388-4159-8df8-8142dcae0e18/v0.4_component_content.md',
      ),
      'utf8',
    )
    const edit = parseV04BundleToEditRows(md)
    const rows = parseV04ToRows(md)
    const nonNa = edit.filter((r) => r.row.DisplayText !== 'NA')
    expect(edit.length).toBeGreaterThan(0)
    expect(nonNa.length).toBeGreaterThan(0)
    const cmp04 = edit.find((r) => r.cmpId === 'CMP-04')
    expect(cmp04?.row.DisplayText).toMatch(/任务标题|YOUR MISSION|Meeting Friends/i)
    expect(rows.filter((r) => r.DisplayText !== 'NA').length).toBe(nonNa.length)
  })
})