import ExcelJS from 'exceljs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DecisionCreate } from '@mission-pipeline/shared'
import { runtimeMissionDir } from '../services/artifactFs.js'
import type { NodeEngineResult } from './n1.js'

/** Align with master/mission_spec_schema.csv (13 fields) */
export type MissionSpecRow = {
  Phase: string
  'Script Step': string
  Step: string
  Component: string
  DisplayText: string
  'Display Image': string
  'Video Play': string
  'Kai Script 1': string
  'Kai Script 2': string
  'Kai Feedback Script - Correct': string
  'Kai Feedback Script - Wrong': string
  'Transition Script': string
  'Knowledge point': string
}

const COLUMNS: (keyof MissionSpecRow)[] = [
  'Phase',
  'Script Step',
  'Step',
  'Component',
  'DisplayText',
  'Display Image',
  'Video Play',
  'Kai Script 1',
  'Kai Script 2',
  'Kai Feedback Script - Correct',
  'Kai Feedback Script - Wrong',
  'Transition Script',
  'Knowledge point',
]

function columnHeader(key: keyof MissionSpecRow): string {
  return key === 'DisplayText' ? 'Display Text' : key
}

function cell(fieldMap: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (fieldMap[k] != null && fieldMap[k] !== '') return fieldMap[k]!
  }
  return ''
}

/** RFC4180 CSV cell */
export function csvEscape(value: string): string {
  const s = String(value ?? '')
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Rows → UTF-8 CSV (BOM for Excel). Headers match mission_spec_schema. */
export function rowsToCsv(rows: MissionSpecRow[], withBom = true): string {
  const header = COLUMNS.map((c) => csvEscape(columnHeader(c))).join(',')
  const body = rows
    .map((r) => COLUMNS.map((c) => csvEscape(String(r[c] ?? ''))).join(','))
    .join('\n')
  const text = `${header}\n${body}\n`
  return withBom ? `\uFEFF${text}` : text
}

/** Parse v0.4 bundle / phase files into rows (13-field + legacy 18-field tolerant) */
export function parseV04ToRows(md: string): MissionSpecRow[] {
  const rows: MissionSpecRow[] = []
  const chunks = md.split(/^## mission_step\s+/m).slice(1)
  for (const chunk of chunks) {
    const header = chunk.split('\n')[0] || ''
    const cmpMatch = /CMP-\d+/i.exec(header)
    const fieldMap: Record<string, string> = {}
    const tableRows = chunk.matchAll(
      /^\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|\s*(.*?)\s*\|?\s*$/gm,
    )
    for (const m of tableRows) {
      const key = m[1]!.trim()
      const val = m[2]!.trim()
      if (key === '字段' || key.includes('---')) continue
      if (/见上方/.test(val)) continue
      fieldMap[key] = val.replace(/\\n/g, '\n')
    }
    // Heading is "### Display Text" (schema); also accept "DisplayText"
    const dtBlock =
      /### Display\s*Text[\s\S]*?```(?:[^\n]*)\r?\n([\s\S]*?)\r?\n```/.exec(
        chunk,
      ) || /### Display\s*Text[\s\S]*?```([\s\S]*?)```/.exec(chunk)
    const displayText =
      dtBlock?.[1]?.trim() ||
      fieldMap['Display Text'] ||
      fieldMap['DisplayText'] ||
      'NA'

    const component =
      cell(fieldMap, 'Component', 'Component 序号') ||
      (cmpMatch?.[0] ? cmpMatch[0].toUpperCase() : '')

    rows.push({
      Phase: cell(fieldMap, 'Phase') || 'Phase 1 - Mission Intro',
      'Script Step': cell(fieldMap, 'Script Step', 'script_step'),
      Step: cell(fieldMap, 'Step') || '',
      Component: component,
      DisplayText: displayText,
      'Display Image': cell(fieldMap, 'Display Image'),
      'Video Play': cell(fieldMap, 'Video Play'),
      'Kai Script 1': cell(fieldMap, 'Kai Script 1'),
      'Kai Script 2': cell(fieldMap, 'Kai Script 2'),
      'Kai Feedback Script - Correct': cell(
        fieldMap,
        'Kai Feedback Script - Correct',
        'Kai Feedback (Correct)',
      ),
      'Kai Feedback Script - Wrong': cell(
        fieldMap,
        'Kai Feedback Script - Wrong',
        'Kai Feedback (Wrong)',
      ),
      'Transition Script': cell(fieldMap, 'Transition Script'),
      'Knowledge point': cell(fieldMap, 'Knowledge point', 'Knowledge Point'),
    })
  }

  // disambiguate duplicate Phase + Script Step + Component
  const seen = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.Phase}|${r['Script Step']}|${r.Component}`
    const n = (seen.get(key) || 0) + 1
    seen.set(key, n)
    if (n > 1 && r.Step) {
      // Step label should already differ; if identical, suffix Script Step
      r['Script Step'] = `${r['Script Step']}__${n}`
    }
  }
  return rows
}

export function n4ExportPaths(missionId: string) {
  const dir = runtimeMissionDir(missionId)
  return {
    dir,
    xlsx: resolve(dir, 'v0.5_mission_spec.xlsx'),
    csv: resolve(dir, 'v0.5_mission_spec.csv'),
    json: resolve(dir, 'v0.5_mission_spec.json'),
  }
}

export async function writeN4Exports(
  missionId: string,
  rows: MissionSpecRow[],
): Promise<{ xlsxPath: string; csvPath: string; jsonPath: string }> {
  const paths = n4ExportPaths(missionId)
  await mkdir(paths.dir, { recursive: true })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('mission_spec')
  ws.addRow(COLUMNS.map(columnHeader))
  ws.getRow(1).font = { bold: true }
  for (const r of rows) {
    ws.addRow(COLUMNS.map((c) => r[c]))
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  await wb.xlsx.writeFile(paths.xlsx)

  await writeFile(paths.csv, rowsToCsv(rows), 'utf8')
  await writeFile(paths.json, JSON.stringify(rows, null, 2), 'utf8')

  return {
    xlsxPath: paths.xlsx,
    csvPath: paths.csv,
    jsonPath: paths.json,
  }
}

export async function runN4(input: {
  missionId: string
  missionName: string
  v04Md: string
}): Promise<NodeEngineResult & { xlsxPath?: string; csvPath?: string }> {
  const rows = parseV04ToRows(input.v04Md)
  const decisions: DecisionCreate[] = []

  if (rows.length === 0) {
    decisions.push({
      node: 'N4',
      targetType: 'mission',
      type: 'edit_required',
      severity: 'blocking',
      question: '未能从 v0.4 解析出任何行。请回到 N3。',
      options: [{ id: 'back', label: '回到 N3', recommended: true }],
      aiRationale: 'N4 依赖 v0.4 mission_step 块',
    })
    return {
      content: `# ${input.missionName} — v0.5 mission spec\n\n（空）\n`,
      decisions,
      meta: { provider: 'exceljs', rows: 0 },
    }
  }

  const { xlsxPath, csvPath, jsonPath } = await writeN4Exports(
    input.missionId,
    rows,
  )

  const pendingAssets = rows.flatMap((r) =>
    COLUMNS.filter((c) => String(r[c]).includes('[待补')).map(
      (c) => `${r.Phase}/${r['Script Step']}/${r.Component}.${c}`,
    ),
  )

  const summary = [
    `# ${input.missionName} — v0.5 mission spec`,
    ``,
    `> **行数**: ${rows.length}`,
    `> **字段**: 13（mission_spec_schema）`,
    `> **xlsx**: \`${xlsxPath}\``,
    `> **csv**: \`${csvPath}\``,
    `> **json**: \`${jsonPath}\``,
    `> **待补（含 DisplayText 槽位）**: ${pendingAssets.length}`,
    ``,
    `## 下载`,
    `- 在 Runner N4 页点击 **下载 CSV** / **下载 XLSX**`,
    `- 或直接打开上列路径`,
    ``,
    `## Checkpoint`,
    `- [ ] 字段对齐 mission_spec_schema（13 列）`,
    `- [ ] DisplayText 模版 / 【】非 NA`,
    `- [ ] Image / Video 由 CD 后补（可空）`,
    `- [ ] Kai / Feedback / Transition / KP`,
    ``,
    pendingAssets.length
      ? `## 待补清单\n\n${pendingAssets.map((x) => `- ${x}`).join('\n')}`
      : `## 待补清单\n\n（无）`,
    ``,
    `## 预览`,
    `前 5 行 Component: ${rows
      .slice(0, 5)
      .map((r) => r.Component)
      .join(', ')}`,
  ].join('\n')

  decisions.push({
    node: 'N4',
    targetType: 'mission',
    type: 'confirm',
    severity: 'info',
    question: `Checkpoint：已导出 ${rows.length} 行 mission spec（13 字段）到 xlsx/csv。请下载核对后 Approve。`,
    options: [{ id: 'ack', label: '已下载核对', recommended: true }],
    aiRationale: 'pipeline_design N4 Checkpoint',
  })

  if (pendingAssets.length) {
    decisions.push({
      node: 'N4',
      targetType: 'mission',
      type: 'warning_ack',
      severity: 'deferrable',
      question: `仍有 ${pendingAssets.length} 处 [待补]。Image/Video 预期由 CD 补；DisplayText 待补请回 N3。`,
      options: [
        { id: 'later', label: '已知晓，稍后补', recommended: true },
        { id: 'block', label: '我回去 N3 改' },
      ],
      aiRationale: 'N4 asset checklist',
    })
  }

  return {
    content: summary,
    decisions,
    meta: {
      provider: 'exceljs',
      rows: rows.length,
      xlsxPath,
      csvPath,
      pendingAssets: pendingAssets.length,
    },
    xlsxPath,
    csvPath,
  }
}
