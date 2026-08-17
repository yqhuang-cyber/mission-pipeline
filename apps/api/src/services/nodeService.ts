import {
  ARTIFACT_KIND,
  NODE_IDS,
  artifactLabel,
  nextNode,
  type NodeId,
} from '@mission-pipeline/shared'
import type { DecisionCreate } from '@mission-pipeline/shared'
import { prisma } from '../db.js'
import { runN1, type NodeEngineResult } from '../nodes/n1.js'
import { renderV03 } from '../nodes/n2.js'
import {
  applyV031Selections,
  renderV031,
  runN2ActivityAnalysis,
  validateV031Selections,
  v031ToMappedSteps,
  activityTitlesFromV031,
  type V031Document,
} from '../nodes/n2ActivityAnalysis.js'
import { runN3, parseV04BundleToEditRows, rebuildV04FromEditRows, type N3EditRow, type N3Row, N3_FIELD_ORDER, sanitizeKaiSpeech } from '../nodes/n3.js'
import {
  runN4,
  n4ExportPaths,
  writeN4Exports,
  parseV04ToRows,
  type MissionSpecRow,
} from '../nodes/n4.js'
import { runN5 } from '../nodes/n5.js'
import { keyFieldsFor } from '../master/keyFields.js'
import {
  parseSteppedScript,
  validateN2,
  type MappedStep,
} from '../validators/n2.js'
import {
  writeArtifactToDisk,
  writePhaseContentFiles,
  writeRuntimeJson,
} from './artifactFs.js'
import { existsSync, readFileSync } from 'node:fs'

const KIND_V031 = 'v0.3.1'
const KIND_V03 = 'v0.3'
const KIND_V04 = 'v0.4'
const LABEL_V031 = 'v0.3.1 activity analysis'
const FILE_V031_MD = 'v0.3.1_activity_analysis.md'
const FILE_V031_JSON = 'v0.3.1_activity_analysis.json'

function parseV031Document(content: string): V031Document | null {
  try {
    const data = JSON.parse(content) as V031Document
    if (data?.version === 'v0.3.1' && Array.isArray(data.steps)) return data
  } catch {
    /* not json */
  }
  return null
}

async function getLatestArtifactByKind(
  missionId: string,
  node: NodeId,
  kind: string,
) {
  return prisma.artifact.findFirst({
    where: { missionId, node, kind },
    orderBy: { version: 'desc' },
  })
}

class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export { HttpError }

async function getLatestRun(missionId: string, node: NodeId) {
  return prisma.nodeRun.findFirst({
    where: { missionId, node },
    orderBy: { attempt: 'desc' },
  })
}

function assertNodeId(node: string): NodeId {
  if (!(NODE_IDS as readonly string[]).includes(node)) {
    throw new HttpError(400, `Invalid node: ${node}`)
  }
  return node as NodeId
}

export async function getNodeDetail(missionId: string, nodeParam: string) {
  const node = assertNodeId(nodeParam)
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')

  const run = await getLatestRun(missionId, node)
  const inputNode = NODE_IDS[NODE_IDS.indexOf(node) - 1]
  const inputArtifact = inputNode
    ? await prisma.artifact.findFirst({
        where: { missionId, node: inputNode },
        orderBy: { version: 'desc' },
      })
    : null
  let outputArtifact = await prisma.artifact.findFirst({
    where: { missionId, node },
    orderBy: { version: 'desc' },
  })
  if (node === 'N2') {
    if (run?.status === 'awaiting_activity_selection') {
      outputArtifact =
        (await getLatestArtifactByKind(missionId, 'N2', KIND_V031)) ||
        outputArtifact
    } else {
      outputArtifact =
        (await getLatestArtifactByKind(missionId, 'N2', KIND_V03)) ||
        outputArtifact
    }
  }
  const decisions = await prisma.decision.findMany({
    where: { missionId, node },
    orderBy: { createdAt: 'asc' },
  })

  const outputDescription =
    node === 'N2' && outputArtifact?.kind === KIND_V031
      ? 'script_step 教学活动分析 + 候选 component（Confirm 后生成 v0.3）'
      : ARTIFACT_KIND[node].description

  return {
    missionId,
    node,
    status: run?.status ?? 'pending',
    attempt: run?.attempt ?? 0,
    input: inputArtifact
      ? {
          label: inputArtifact.label,
          description: ARTIFACT_KIND[inputNode as NodeId].description,
          content: inputArtifact.content,
        }
      : node === 'N0'
        ? {
            label: 'Mission 元信息 + 主数据版本',
            description: '创建时填写',
            content: JSON.stringify(
              {
                name: mission.name,
                topic: mission.topic,
                masterDataVersion: mission.masterDataVersion,
              },
              null,
              2,
            ),
          }
        : null,
    output: outputArtifact
      ? {
          label: outputArtifact.label,
          description: outputDescription,
          content:
            outputArtifact.kind === KIND_V031 &&
            parseV031Document(outputArtifact.content)
              ? renderV031(parseV031Document(outputArtifact.content)!)
              : outputArtifact.content,
          kind: outputArtifact.kind,
        }
      : null,
    decisions: decisions.map((d) => ({
      id: d.id,
      type: d.type,
      severity: d.severity,
      question: d.question,
      options: JSON.parse(d.optionsJson || '[]'),
      aiRationale: d.aiRationale,
      resolved: d.resolved,
      resolution: d.resolutionJson ? JSON.parse(d.resolutionJson) : null,
    })),
  }
}

/** Stub runner: copies/transforms lightly until LLM nodes land */
export async function runNode(missionId: string, nodeParam: string) {
  const node = assertNodeId(nodeParam)
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')

  if (node === 'N0') {
    throw new HttpError(400, 'N0 is created with the script; approve to continue')
  }

  const prev = NODE_IDS[NODE_IDS.indexOf(node) - 1] as NodeId
  const prevRun = await getLatestRun(missionId, prev)
  if (!prevRun || prevRun.status !== 'approved') {
    throw new HttpError(409, `Hard gate: approve ${prev} before running ${node}`)
  }

  const current = await getLatestRun(missionId, node)
  if (current && current.status === 'awaiting_activity_selection') {
    throw new HttpError(
      409,
      `${node} is awaiting activity selection; confirm or reject first`,
    )
  }
  if (current && current.status === 'awaiting_review') {
    throw new HttpError(409, `${node} is awaiting review; approve or reject first`)
  }
  if (current && current.status === 'approved') {
    throw new HttpError(409, `${node} already approved; reject/rerun to change`)
  }
  if (current && current.status === 'running') {
    throw new HttpError(409, `${node} is already running`)
  }

  let run
  if (
    current &&
    (current.status === 'pending' ||
      current.status === 'failed' ||
      current.status === 'stale')
  ) {
    run = await prisma.nodeRun.update({
      where: { id: current.id },
      data: {
        status: 'running',
        startedAt: new Date(),
        error: null,
      },
    })
  } else {
    run = await prisma.nodeRun.create({
      data: {
        missionId,
        node,
        status: 'running',
        attempt: (current?.attempt ?? 0) + 1,
        startedAt: new Date(),
      },
    })
  }

  try {
    const inputArtifact = await prisma.artifact.findFirst({
      where: { missionId, node: prev },
      orderBy: { version: 'desc' },
    })
    if (!inputArtifact) throw new HttpError(400, `Missing input artifact from ${prev}`)

    // Clear previous unresolved decisions for this node on rerun
    await prisma.decision.deleteMany({
      where: { missionId, node, resolved: false },
    })

    const engine = await executeNodeEngine({
      missionId,
      node,
      missionName: mission.name,
      topic: mission.topic,
      inputContent: inputArtifact.content,
    })

    const version =
      (await prisma.artifact.count({ where: { missionId, node } })) + 1

    const isN2Analysis = node === 'N2'
    const artifactKind = isN2Analysis ? KIND_V031 : ARTIFACT_KIND[node].version
    const artifactLabelText = isN2Analysis
      ? LABEL_V031
      : artifactLabel(node)
    const artifactContent =
      isN2Analysis && engine.document
        ? JSON.stringify(engine.document)
        : engine.content

    await prisma.artifact.create({
      data: {
        missionId,
        node,
        kind: artifactKind,
        label: artifactLabelText,
        content: artifactContent,
        mimeType: isN2Analysis ? 'application/json' : 'text/markdown',
        version,
      },
    })

    const diskPath = await writeArtifactToDisk({
      missionId,
      missionName: mission.name,
      node,
      content: isN2Analysis ? engine.content : engine.content,
      version,
      fileName: isN2Analysis ? FILE_V031_MD : undefined,
    })

    if (isN2Analysis && engine.document) {
      await writeRuntimeJson({
        missionId,
        fileName: FILE_V031_JSON,
        data: engine.document,
      })
    }

    if (engine.phaseFiles) {
      await writePhaseContentFiles(missionId, engine.phaseFiles)
    }

    if (engine.decisions.length) {
      await prisma.decision.createMany({
        data: engine.decisions.map((d: DecisionCreate) => ({
          missionId,
          nodeRunId: run.id,
          node,
          targetType: d.targetType,
          targetId: d.targetId,
          type: d.type,
          severity: d.severity,
          question: d.question,
          optionsJson: JSON.stringify(d.options || []),
          aiRationale: d.aiRationale,
        })),
      })
    }

    const nextStatus =
      node === 'N2' ? 'awaiting_activity_selection' : 'awaiting_review'

    const updated = await prisma.nodeRun.update({
      where: { id: run.id },
      data: {
        status: nextStatus,
        finishedAt: new Date(),
      },
    })

    await prisma.mission.update({
      where: { id: missionId },
      data: { currentNode: node, status: 'in_review' },
    })

    await prisma.auditEvent.create({
      data: {
        missionId,
        actor: 'system',
        action: 'node.run.completed',
        payload: JSON.stringify({
          node,
          attempt: updated.attempt,
          meta: engine.meta,
          decisions: engine.decisions.length,
          diskPath,
        }),
      },
    })

    return getNodeDetail(missionId, node)
  } catch (err) {
    await prisma.nodeRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      },
    })
    throw err
  }
}

async function executeNodeEngine(opts: {
  missionId: string
  node: NodeId
  missionName: string
  topic: string
  inputContent: string
}): Promise<
  NodeEngineResult & {
    phaseFiles?: Record<string, string>
    document?: V031Document
  }
> {
  if (opts.node === 'N1') {
    return runN1({
      missionName: opts.missionName,
      topic: opts.topic,
      scriptMd: opts.inputContent,
    })
  }
  if (opts.node === 'N2') {
    return runN2ActivityAnalysis({
      missionName: opts.missionName,
      phasedMd: opts.inputContent,
    })
  }
  if (opts.node === 'N3') {
    const v03 = await getLatestArtifactByKind(opts.missionId, 'N2', KIND_V03)
    if (!v03) throw new HttpError(400, 'Missing v0.3 artifact from N2 (Confirm activities first)')
    const v01 = await prisma.artifact.findFirst({
      where: { missionId: opts.missionId, node: 'N0' },
      orderBy: { version: 'desc' },
    })
    const v02 = await prisma.artifact.findFirst({
      where: { missionId: opts.missionId, node: 'N1' },
      orderBy: { version: 'desc' },
    })
    const v031Art = await getLatestArtifactByKind(
      opts.missionId,
      'N2',
      KIND_V031,
    )
    const v031 = v031Art ? parseV031Document(v031Art.content) : null
    return runN3({
      missionName: opts.missionName,
      steppedMd: v03.content,
      scriptMd: v01?.content,
      phasedMd: v02?.content,
      activityTitles: v031 ? activityTitlesFromV031(v031) : undefined,
    })
  }
  if (opts.node === 'N4') {
    return runN4({
      missionId: opts.missionId,
      missionName: opts.missionName,
      v04Md: opts.inputContent,
    })
  }
  if (opts.node === 'N5') {
    return runN5({
      missionName: opts.missionName,
      v05Summary: opts.inputContent,
    })
  }

  return {
    content: `# ${artifactLabel(opts.node)}\n\n（未知节点）\n`,
    decisions: [],
    meta: { provider: 'none' },
  }
}

export async function approveNode(
  missionId: string,
  nodeParam: string,
  actor = 'CD',
) {
  const node = assertNodeId(nodeParam)
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')

  const run = await getLatestRun(missionId, node)
  if (!run || run.status !== 'awaiting_review') {
    throw new HttpError(409, `${node} is not awaiting review`)
  }

  const blocking = await prisma.decision.count({
    where: {
      missionId,
      node,
      severity: 'blocking',
      resolved: false,
    },
  })
  if (blocking > 0) {
    throw new HttpError(
      409,
      `Cannot approve ${node}: ${blocking} blocking decision(s) open`,
    )
  }

  await prisma.nodeRun.update({
    where: { id: run.id },
    data: {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: actor,
    },
  })

  const nxt = nextNode(node)
  await prisma.mission.update({
    where: { id: missionId },
    data: {
      currentNode: nxt ?? node,
      status: nxt ? 'in_review' : 'approved',
    },
  })

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'node.approved',
      payload: JSON.stringify({ node }),
    },
  })

  return getNodeDetail(missionId, node)
}

export async function rejectNode(
  missionId: string,
  nodeParam: string,
  actor = 'CD',
) {
  const node = assertNodeId(nodeParam)
  const run = await getLatestRun(missionId, node)
  if (!run) throw new HttpError(404, `${node} run not found`)

  let nextStatus: 'pending' | 'awaiting_activity_selection' = 'pending'
  if (run.status === 'awaiting_activity_selection') {
    nextStatus = 'pending'
  } else if (run.status === 'awaiting_review') {
    if (node === 'N2') {
      const v031 = await getLatestArtifactByKind(missionId, 'N2', KIND_V031)
      nextStatus = v031 ? 'awaiting_activity_selection' : 'pending'
    } else {
      nextStatus = 'pending'
    }
  } else {
    throw new HttpError(
      409,
      `${node} is not awaiting selection/review (status=${run.status})`,
    )
  }

  await prisma.nodeRun.update({
    where: { id: run.id },
    data: { status: nextStatus, approvedAt: null, approvedBy: null },
  })

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'node.rejected',
      payload: JSON.stringify({ node, nextStatus }),
    },
  })

  return getNodeDetail(missionId, node)
}

/** Structured v0.3.1 for activity selection UI */
export async function getN2V031(missionId: string) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N2')
  const artifact = await getLatestArtifactByKind(missionId, 'N2', KIND_V031)
  if (!artifact) throw new HttpError(404, 'N2 v0.3.1 artifact not found')
  const document =
    parseV031Document(artifact.content) ||
    analyzeFallbackFromMd(artifact.content, mission.name)
  if (!document) throw new HttpError(400, 'Invalid v0.3.1 document')
  const editable = run?.status === 'awaiting_activity_selection'
  return {
    missionName: mission.name,
    status: run?.status || 'pending',
    editable,
    document,
    markdown: renderV031(document),
  }
}

function analyzeFallbackFromMd(
  _content: string,
  _missionName: string,
): V031Document | null {
  return null
}

export async function saveN2V031(
  missionId: string,
  patch: {
    steps: Array<{
      scriptStep: number
      activities: Array<{
        id: string
        title?: string
        intent?: string
        sourceAnchor?: string
        selectedComponentId: string
        candidates?: Array<{
          id: string
          nameZh: string
          rationale: string
          recommended?: boolean
          fromN1?: boolean
        }>
      }>
    }>
  },
  actor = 'CD',
) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N2')
  if (!run || run.status !== 'awaiting_activity_selection') {
    throw new HttpError(409, 'N2 仅在 awaiting_activity_selection 时可保存 V0.3.1 选择')
  }
  const artifact = await getLatestArtifactByKind(missionId, 'N2', KIND_V031)
  if (!artifact) throw new HttpError(404, 'N2 v0.3.1 artifact not found')
  const base = parseV031Document(artifact.content)
  if (!base) throw new HttpError(400, 'Invalid v0.3.1 document')

  const document = applyV031Selections(base, patch)
  const version =
    (await prisma.artifact.count({ where: { missionId, node: 'N2' } })) + 1
  const md = renderV031(document)

  await prisma.artifact.create({
    data: {
      missionId,
      node: 'N2',
      kind: KIND_V031,
      label: LABEL_V031,
      content: JSON.stringify(document),
      mimeType: 'application/json',
      version,
    },
  })

  await writeArtifactToDisk({
    missionId,
    missionName: mission.name,
    node: 'N2',
    content: md,
    version,
    fileName: FILE_V031_MD,
  })
  await writeRuntimeJson({
    missionId,
    fileName: FILE_V031_JSON,
    data: document,
  })

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'artifact.n2.v031.saved',
      payload: JSON.stringify({ version }),
    },
  })

  return {
    missionName: mission.name,
    status: run.status,
    editable: true,
    document,
    markdown: md,
  }
}

export async function confirmN2Activities(
  missionId: string,
  patch:
    | {
        steps: Array<{
          scriptStep: number
          activities: Array<{
            id: string
            title?: string
            intent?: string
            sourceAnchor?: string
            selectedComponentId: string
            candidates?: Array<{
              id: string
              nameZh: string
              rationale: string
              recommended?: boolean
              fromN1?: boolean
            }>
          }>
        }>
      }
    | undefined,
  actor = 'CD',
) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N2')
  if (!run || run.status !== 'awaiting_activity_selection') {
    throw new HttpError(409, 'N2 仅在 awaiting_activity_selection 时可 Confirm')
  }

  const artifact = await getLatestArtifactByKind(missionId, 'N2', KIND_V031)
  if (!artifact) throw new HttpError(404, 'N2 v0.3.1 artifact not found')
  let document = parseV031Document(artifact.content)
  if (!document) throw new HttpError(400, 'Invalid v0.3.1 document')
  if (patch?.steps?.length) {
    document = applyV031Selections(document, patch)
  }

  const selectionErrors = validateV031Selections(document)
  if (selectionErrors.length) {
    throw new HttpError(400, selectionErrors.join('; '))
  }

  const v02 = await prisma.artifact.findFirst({
    where: { missionId, node: 'N1' },
    orderBy: { version: 'desc' },
  })
  if (!v02) throw new HttpError(400, 'Missing v0.2 from N1')

  // Persist latest selections as v0.3.1 before generating v0.3
  const v031Version =
    (await prisma.artifact.count({ where: { missionId, node: 'N2' } })) + 1
  await prisma.artifact.create({
    data: {
      missionId,
      node: 'N2',
      kind: KIND_V031,
      label: LABEL_V031,
      content: JSON.stringify(document),
      mimeType: 'application/json',
      version: v031Version,
    },
  })
  const md031 = renderV031(document)
  await writeArtifactToDisk({
    missionId,
    missionName: mission.name,
    node: 'N2',
    content: md031,
    version: v031Version,
    fileName: FILE_V031_MD,
  })
  await writeRuntimeJson({
    missionId,
    fileName: FILE_V031_JSON,
    data: document,
  })

  const mapped = v031ToMappedSteps(document, v02.content)
  const validated = validateN2(mapped)
  const hard = validated.issues.filter(
    (i) => i.level === 'error' && i.code === 'N2_NOT_ALLOWED',
  )
  if (hard.length) {
    throw new HttpError(
      400,
      hard.map((i) => i.message).join('; ') || '校验失败',
    )
  }

  const content = renderV03(mission.name, validated.steps)
  const version =
    (await prisma.artifact.count({ where: { missionId, node: 'N2' } })) + 1

  await prisma.artifact.create({
    data: {
      missionId,
      node: 'N2',
      kind: KIND_V03,
      label: artifactLabel('N2'),
      content,
      mimeType: 'text/markdown',
      version,
    },
  })

  const diskPath = await writeArtifactToDisk({
    missionId,
    missionName: mission.name,
    node: 'N2',
    content,
    version,
  })

  await prisma.nodeRun.update({
    where: { id: run.id },
    data: {
      status: 'awaiting_review',
      finishedAt: new Date(),
    },
  })

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'node.n2.activities.confirmed',
      payload: JSON.stringify({
        version,
        diskPath,
        activities: document.steps.reduce(
          (n, s) => n + s.activities.length,
          0,
        ),
      }),
    },
  })

  return getNodeDetail(missionId, 'N2')
}

/** Structured v0.3 for editor */
export async function getN2Structured(missionId: string) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N2')
  const artifact = await getLatestArtifactByKind(missionId, 'N2', KIND_V03)
  if (!artifact) throw new HttpError(404, 'N2 v0.3 artifact not found（请先 Confirm 活动选组件）')
  const steps = parseSteppedScript(artifact.content)
  const editable = run?.status === 'awaiting_review'
  return {
    missionName: mission.name,
    status: run?.status || 'pending',
    editable,
    steps: steps.map((s) => ({
      ...s,
      components: s.components.map((c) => ({
        ...c,
        keyFields: keyFieldsFor(c.id),
      })),
    })),
  }
}

export async function saveN2Structured(
  missionId: string,
  stepsInput: MappedStep[],
  actor = 'CD',
) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N2')
  if (!run || run.status !== 'awaiting_review') {
    throw new HttpError(409, 'N2 仅在 awaiting_review 时可保存；请先 Reject 后再改')
  }

  const steps: MappedStep[] = stepsInput.map((s) => ({
    phase: s.phase,
    scriptStep: s.scriptStep,
    name: s.name,
    purpose: s.purpose || '',
    components: (s.components || []).map((c) => ({
      id: String(c.id).toUpperCase(),
      role: c.role === 'secondary' ? 'secondary' : 'primary',
      outline: c.outline || '',
    })),
  }))

  const validated = validateN2(steps)
  const hard = validated.issues.filter(
    (i) => i.level === 'error' && i.code === 'N2_NOT_ALLOWED',
  )
  if (hard.length) {
    throw new HttpError(
      400,
      hard.map((i) => i.message).join('; ') || '校验失败',
    )
  }

  const content = renderV03(mission.name, validated.steps)
  const version =
    (await prisma.artifact.count({ where: { missionId, node: 'N2' } })) + 1

  await prisma.artifact.create({
    data: {
      missionId,
      node: 'N2',
      kind: KIND_V03,
      label: artifactLabel('N2'),
      content,
      mimeType: 'text/markdown',
      version,
    },
  })

  const diskPath = await writeArtifactToDisk({
    missionId,
    missionName: mission.name,
    node: 'N2',
    content,
    version,
  })

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'artifact.n2.saved',
      payload: JSON.stringify({
        version,
        diskPath,
        steps: validated.steps.length,
      }),
    },
  })

  return {
    content,
    version,
    diskPath,
    issues: validated.issues,
    steps: validated.steps.map((s) => ({
      ...s,
      components: s.components.map((c) => ({
        ...c,
        keyFields: keyFieldsFor(c.id),
      })),
    })),
  }
}

export async function getN3Structured(missionId: string) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N3')
  const artifact =
    (await getLatestArtifactByKind(missionId, 'N3', KIND_V04)) ||
    (await prisma.artifact.findFirst({
      where: { missionId, node: 'N3' },
      orderBy: { version: 'desc' },
    }))
  if (!artifact) throw new HttpError(404, 'N3 v0.4 artifact not found')
  const rows = parseV04BundleToEditRows(artifact.content)
  const editable = run?.status === 'awaiting_review'
  return {
    missionName: mission.name,
    status: run?.status || 'pending',
    editable,
    fieldOrder: N3_FIELD_ORDER,
    rows,
  }
}

export async function saveN3Structured(
  missionId: string,
  rowsInput: N3EditRow[],
  actor = 'CD',
) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')
  const run = await getLatestRun(missionId, 'N3')
  if (!run || run.status !== 'awaiting_review') {
    throw new HttpError(
      409,
      'N3 仅在 awaiting_review 时可暂存；请先 Run N3 或 Reject 后再改',
    )
  }
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) {
    throw new HttpError(400, 'body.rows required')
  }

  const rows: N3EditRow[] = rowsInput.map((r, i) => {
    const cmpId = String(r.cmpId || '').toUpperCase()
    const phaseKey = (['P1', 'P2', 'P3', 'P4'] as const).includes(
      r.phaseKey as 'P1',
    )
      ? (r.phaseKey as 'P1' | 'P2' | 'P3' | 'P4')
      : 'P1'
    const incoming = r.row || ({} as N3Row)
    const row: N3Row = {
      Phase: String(incoming.Phase || ''),
      'Script Step': String(incoming['Script Step'] || ''),
      Step: String(incoming.Step || ''),
      Component: String(incoming.Component || cmpId),
      DisplayText: String(incoming.DisplayText ?? 'NA'),
      'Display Image': String(incoming['Display Image'] ?? ''),
      'Video Play': String(incoming['Video Play'] ?? ''),
      'Kai Script 1': sanitizeKaiSpeech(String(incoming['Kai Script 1'] ?? '')),
      'Kai Script 2': sanitizeKaiSpeech(String(incoming['Kai Script 2'] ?? '')),
      'Kai Feedback Script - Correct': sanitizeKaiSpeech(
        String(incoming['Kai Feedback Script - Correct'] ?? ''),
      ),
      'Kai Feedback Script - Wrong': sanitizeKaiSpeech(
        String(incoming['Kai Feedback Script - Wrong'] ?? ''),
      ),
      'Transition Script': sanitizeKaiSpeech(
        String(incoming['Transition Script'] ?? ''),
      ),
      'Knowledge point': String(incoming['Knowledge point'] ?? ''),
    }
    return {
      missionStepId: String(r.missionStepId || `${i + 1}.1`),
      cmpId,
      phaseKey,
      row,
    }
  })

  const { content, phaseFiles, total } = rebuildV04FromEditRows(
    mission.name,
    rows,
  )
  const version =
    (await prisma.artifact.count({ where: { missionId, node: 'N3' } })) + 1

  await prisma.artifact.create({
    data: {
      missionId,
      node: 'N3',
      kind: KIND_V04,
      label: artifactLabel('N3'),
      content,
      mimeType: 'text/markdown',
      version,
    },
  })

  const diskPath = await writeArtifactToDisk({
    missionId,
    missionName: mission.name,
    node: 'N3',
    content,
    version,
  })
  await writePhaseContentFiles(missionId, phaseFiles)

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'artifact.n3.draft_saved',
      payload: JSON.stringify({ version, diskPath, rows: total }),
    },
  })

  return {
    content,
    version,
    diskPath,
    editable: true,
    rows: parseV04BundleToEditRows(content),
  }
}

export async function resolveDecision(
  missionId: string,
  decisionId: string,
  body: { action: string; value?: string; optionId?: string },
  actor = 'CD',
) {
  const decision = await prisma.decision.findFirst({
    where: { id: decisionId, missionId },
  })
  if (!decision) throw new HttpError(404, 'Decision not found')
  if (decision.resolved) throw new HttpError(409, 'Decision already resolved')

  await prisma.decision.update({
    where: { id: decisionId },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: actor,
      resolutionJson: JSON.stringify(body),
    },
  })

  await prisma.auditEvent.create({
    data: {
      missionId,
      actor,
      action: 'decision.resolved',
      payload: JSON.stringify({ decisionId, ...body }),
    },
  })

  return getNodeDetail(missionId, decision.node)
}

export type N4DownloadFormat = 'csv' | 'xlsx' | 'json'

/** Ensure v0.5 export file exists on disk (rebuild from N3 if needed). */
export async function ensureN4ExportFile(
  missionId: string,
  format: N4DownloadFormat,
): Promise<{ path: string; filename: string; contentType: string }> {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new HttpError(404, 'Mission not found')

  const paths = n4ExportPaths(missionId)
  const meta = {
    csv: {
      path: paths.csv,
      filename: 'v0.5_mission_spec.csv',
      contentType: 'text/csv; charset=utf-8',
    },
    xlsx: {
      path: paths.xlsx,
      filename: 'v0.5_mission_spec.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    json: {
      path: paths.json,
      filename: 'v0.5_mission_spec.json',
      contentType: 'application/json; charset=utf-8',
    },
  }[format]

  if (existsSync(meta.path)) return meta

  // Prefer existing json → rewrite missing csv/xlsx
  if (existsSync(paths.json)) {
    try {
      const rows = JSON.parse(readFileSync(paths.json, 'utf8')) as MissionSpecRow[]
      if (Array.isArray(rows) && rows.length) {
        await writeN4Exports(missionId, rows)
        if (existsSync(meta.path)) return meta
      }
    } catch {
      /* fall through */
    }
  }

  const v04 =
    (await getLatestArtifactByKind(missionId, 'N3', KIND_V04)) ||
    (await prisma.artifact.findFirst({
      where: { missionId, node: 'N3' },
      orderBy: { version: 'desc' },
    }))
  if (!v04?.content) {
    throw new HttpError(404, 'No mission spec yet — run N4 first')
  }
  const rows = parseV04ToRows(v04.content)
  if (!rows.length) {
    throw new HttpError(404, 'Empty mission spec — check N3 output')
  }
  await writeN4Exports(missionId, rows)
  if (!existsSync(meta.path)) {
    throw new HttpError(500, 'Failed to write export file')
  }
  return meta
}

