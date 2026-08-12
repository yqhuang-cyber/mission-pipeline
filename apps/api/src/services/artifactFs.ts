import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NodeId } from '@mission-pipeline/shared'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Workspace missions/runtime/<missionId>/… for IDE viewing */
export function runtimeMissionDir(missionId: string): string {
  const root =
    process.env.MISSIONS_RUNTIME_DIR ||
    resolve(__dirname, '../../../../missions/runtime')
  return resolve(root, missionId)
}

const FILE_BY_NODE: Record<NodeId, string> = {
  N0: 'v0.1_colloquial_script.md',
  N1: 'v0.2_phased_script.md',
  N2: 'v0.3_step_component_map.md',
  N3: 'v0.4_component_content.md',
  N4: 'v0.5_mission_spec.md',
  N5: 'product_preview.md',
}

export async function writePhaseContentFiles(
  missionId: string,
  phaseFiles: Record<string, string>,
): Promise<string[]> {
  const dir = runtimeMissionDir(missionId)
  await mkdir(dir, { recursive: true })
  const paths: string[] = []
  for (const [phase, content] of Object.entries(phaseFiles)) {
    const path = resolve(
      dir,
      `v0.4_component_content_${phase.toLowerCase()}.md`,
    )
    await writeFile(path, content, 'utf8')
    paths.push(path)
  }
  return paths
}

export async function writeArtifactToDisk(opts: {
  missionId: string
  missionName?: string
  node: NodeId
  content: string
  version?: number
  /** Override default FILE_BY_NODE filename (e.g. v0.3.1) */
  fileName?: string
}): Promise<string> {
  const dir = runtimeMissionDir(opts.missionId)
  await mkdir(dir, { recursive: true })

  const file = opts.fileName || FILE_BY_NODE[opts.node]
  const path = resolve(dir, file)
  const header = [
    `<!--`,
    `  mission_id: ${opts.missionId}`,
    opts.missionName ? `  mission_name: ${opts.missionName}` : null,
    `  node: ${opts.node}`,
    `  file: ${file}`,
    opts.version != null ? `  version: ${opts.version}` : null,
    `  written_at: ${new Date().toISOString()}`,
    `-->`,
    ``,
  ]
    .filter(Boolean)
    .join('\n')

  await writeFile(path, `${header}${opts.content}\n`, 'utf8')

  // Also keep versioned copy so reruns don't lose history
  if (opts.version != null && opts.version > 1) {
    const stamped = resolve(dir, file.replace(/\.md$/, `.v${opts.version}.md`))
    await writeFile(stamped, `${header}${opts.content}\n`, 'utf8')
  }

  return path
}

export async function writeRuntimeJson(opts: {
  missionId: string
  fileName: string
  data: unknown
}): Promise<string> {
  const dir = runtimeMissionDir(opts.missionId)
  await mkdir(dir, { recursive: true })
  const path = resolve(dir, opts.fileName)
  await writeFile(path, `${JSON.stringify(opts.data, null, 2)}\n`, 'utf8')
  return path
}
