import {
  ARTIFACT_KIND,
  CreateMissionSchema,
  NODE_IDS,
  NODE_LABELS,
  artifactLabel,
  type CreateMissionInput,
  type NodeId,
} from '@mission-pipeline/shared'
import type { Mission, NodeRun, NodeRunStatus } from '@prisma/client'
import { prisma } from '../db.js'
import { writeArtifactToDisk } from './artifactFs.js'

const LABEL_V031_CANVAS = 'v0.3.1 activity analysis'

export async function createMission(input: CreateMissionInput) {
  const data = CreateMissionSchema.parse(input)

  const mission = await prisma.$transaction(async (tx) => {
    const mission = await tx.mission.create({
      data: {
        name: data.name,
        topic: data.topic,
        // Single active catalog: master/component_catalog.json (v0729)
        masterDataVersion: 'v0729',
        ownerName: data.ownerName,
        currentNode: 'N0',
        status: 'draft',
      },
    })

    await tx.artifact.create({
      data: {
        missionId: mission.id,
        node: 'N0',
        kind: ARTIFACT_KIND.N0.version,
        label: artifactLabel('N0'),
        content: data.scriptMd,
        mimeType: 'text/markdown',
      },
    })

    // Seed node runs: N0 starts awaiting_review (script already provided)
    for (const node of NODE_IDS) {
      const status: NodeRunStatus =
        node === 'N0' ? 'awaiting_review' : 'pending'
      await tx.nodeRun.create({
        data: {
          missionId: mission.id,
          node,
          status,
          attempt: 1,
          finishedAt: node === 'N0' ? new Date() : undefined,
        },
      })
    }

    await tx.auditEvent.create({
      data: {
        missionId: mission.id,
        actor: data.ownerName,
        action: 'mission.created',
        payload: JSON.stringify({ name: data.name }),
      },
    })

    return mission
  })

  await writeArtifactToDisk({
    missionId: mission.id,
    missionName: mission.name,
    node: 'N0',
    content: data.scriptMd,
    version: 1,
  })

  return mission
}

export async function listMissions() {
  const missions = await prisma.mission.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      decisions: {
        where: { resolved: false, severity: 'blocking' },
        select: { id: true },
      },
    },
  })

  return missions.map((m) => ({
    id: m.id,
    name: m.name,
    topic: m.topic,
    status: m.status,
    currentNode: m.currentNode,
    masterDataVersion: m.masterDataVersion,
    ownerName: m.ownerName,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    openBlockingDecisions: m.decisions.length,
  }))
}

export async function getMission(id: string) {
  const mission = await prisma.mission.findUnique({
    where: { id },
    include: {
      artifacts: { orderBy: { createdAt: 'desc' } },
      decisions: { where: { resolved: false } },
    },
  })
  if (!mission) return null
  return mission
}

function latestRunsByNode(runs: NodeRun[]): Record<string, NodeRun> {
  const map: Record<string, NodeRun> = {}
  for (const run of runs) {
    const prev = map[run.node]
    if (!prev || run.attempt > prev.attempt) map[run.node] = run
  }
  return map
}

export async function getCanvas(missionId: string) {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: {
      nodeRuns: true,
      decisions: { where: { resolved: false } },
    },
  })
  if (!mission) return null

  const latest = latestRunsByNode(mission.nodeRuns)

  return {
    mission: {
      id: mission.id,
      name: mission.name,
      topic: mission.topic,
      status: mission.status,
      currentNode: mission.currentNode,
      masterDataVersion: mission.masterDataVersion,
    },
    nodes: NODE_IDS.map((node) => {
      const run = latest[node]
      const status = run?.status ?? 'pending'
      const openBlocking = mission.decisions.filter(
        (d) => d.node === node && d.severity === 'blocking',
      ).length
      const prev = NODE_IDS[NODE_IDS.indexOf(node) - 1]
      const prevApproved =
        node === 'N0' || latest[prev!]?.status === 'approved'
      const canRun =
        prevApproved &&
        (status === 'pending' || status === 'failed' || status === 'stale')
      const canApprove =
        status === 'awaiting_review' && openBlocking === 0
      const canSelectActivities =
        node === 'N2' && status === 'awaiting_activity_selection'
      const canReject =
        status === 'awaiting_review' ||
        status === 'awaiting_activity_selection'

      return {
        node,
        label: NODE_LABELS[node as NodeId],
        status,
        artifactLabel:
          node === 'N2' && status === 'awaiting_activity_selection'
            ? LABEL_V031_CANVAS
            : artifactLabel(node as NodeId),
        artifactDescription: ARTIFACT_KIND[node as NodeId].description,
        openBlockingDecisions: openBlocking,
        canRun,
        canApprove,
        canSelectActivities,
        canReject,
      }
    }),
  }
}

export type { Mission }
