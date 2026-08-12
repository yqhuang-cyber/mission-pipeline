import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHASE_ALLOWED, type PhaseId } from './eligibility.js'
import { keyFieldsFor } from './keyFields.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export type CatalogComponent = {
  id: string
  nameZh: string
  nameEn: string
  /** B 列：讲解/探索/练习/过渡（清单展示用；选型 UI 可不展示） */
  category: string
  techClass: string
  /** E 列：组件使用规范（模版） */
  template: string
  /** F 列：组件使用规范(示例) */
  example: string
  purpose: string
  interaction: string
  userInput: string
  designRule: string
  keyFields: string
  phases: PhaseId[]
  previewImages: string[]
}

type CatalogRow = {
  A?: string
  B?: string
  C?: string
  D?: string
  E?: string
  F?: string
  H?: string
  J?: string
  K?: string
  L?: string
  M?: string
}

function masterRoot(): string {
  return (
    process.env.MASTER_DATA_DIR ||
    resolve(__dirname, '../../../../master')
  )
}

export function catalogPath(): string {
  return resolve(masterRoot(), 'component_catalog.json')
}

export function componentImagesDir(): string {
  return resolve(masterRoot(), 'component_images')
}

/** List preview image filenames for a CMP */
export function listPreviewFiles(cmpId: string): string[] {
  const dir = componentImagesDir()
  if (!existsSync(dir)) return []
  const re = new RegExp(`^${cmpId}(_\\d+)?\\.(jpe?g|png)$`, 'i')
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .sort((a, b) => {
      const na = /_(\d+)\./.exec(a)?.[1]
      const nb = /_(\d+)\./.exec(b)?.[1]
      if (!na && nb) return -1
      if (na && !nb) return 1
      return Number(na || 0) - Number(nb || 0)
    })
}

let cached: CatalogComponent[] | null = null
let cachedById: Map<string, CatalogComponent> | null = null

function phasesFor(id: string): PhaseId[] {
  return (['P1', 'P2', 'P3', 'P4'] as PhaseId[]).filter((p) =>
    PHASE_ALLOWED[p].includes(id),
  )
}

export function loadCatalogComponents(): CatalogComponent[] {
  if (cached) return cached
  const path = catalogPath()
  if (!existsSync(path)) {
    throw new Error(`Missing master catalog: ${path}`)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    meta?: { version?: string; source?: string }
    components?: CatalogRow[]
  }
  const source = raw.components || []
  const seen = new Set<string>()
  cached = []
  for (const r of source) {
    if (!r.A || !/^CMP-\d+$/i.test(r.A)) continue
    const id = r.A.toUpperCase()
    if (seen.has(id)) continue
    seen.add(id)
    const files = listPreviewFiles(id)
    cached.push({
      id,
      nameZh: (r.C || id).trim(),
      // v0729: H = 英文名称；F = 示例（勿当英文名）
      nameEn: (r.H || '').trim(),
      category: (r.B || '').trim(),
      techClass: (r.D || '').trim(),
      template: (r.E || '').trim(),
      example: (r.F || '').trim(),
      purpose: (r.J || '').trim(),
      interaction: (r.K || '').trim(),
      userInput: (r.L || '').trim(),
      designRule: (r.M || '').trim(),
      keyFields: keyFieldsFor(id),
      phases: phasesFor(id),
      previewImages: files.map(
        (f) => `/api/master/component-images/${encodeURIComponent(f)}`,
      ),
    })
  }
  cachedById = new Map(cached.map((c) => [c.id, c]))
  return cached
}

export function getCatalogComponent(id: string): CatalogComponent | undefined {
  loadCatalogComponents()
  return cachedById?.get(id.toUpperCase())
}

export function getMasterComponentsPayload() {
  const path = catalogPath()
  let meta: { version?: string; source?: string } = {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      meta?: { version?: string; source?: string }
    }
    meta = raw.meta || {}
  } catch {
    /* ignore */
  }
  return {
    meta,
    components: loadCatalogComponents(),
    phaseAllowed: PHASE_ALLOWED as Record<PhaseId, string[]>,
  }
}

export function resolveSafeImagePath(file: string): string | null {
  if (!/^CMP-\d+(_\d+)?\.(jpe?g|png)$/i.test(file)) return null
  const full = resolve(componentImagesDir(), file)
  const root = componentImagesDir()
  if (!full.startsWith(root)) return null
  if (!existsSync(full)) return null
  return full
}

/** DisplayText fill — see displayTextFill.ts (component-family aware). */
export {
  fillDisplayTextTemplate,
  parseSingleChoice,
  extractMissionGoalsFromPhased,
  resolveComponentFamily,
  type FillDisplayTextContext,
  type ParsedChoice,
  type ComponentFamily,
} from './displayTextFill.js'
