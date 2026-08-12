import { z } from 'zod'

export const NODE_IDS = ['N0', 'N1', 'N2', 'N3', 'N4', 'N5'] as const
export type NodeId = (typeof NODE_IDS)[number]
export const NodeIdSchema = z.enum(NODE_IDS)

export const NODE_LABELS: Record<NodeId, string> = {
  N0: '准备',
  N1: 'Phase 框架',
  N2: 'Component 映射',
  N3: 'Content 填充',
  N4: 'Spec 导出',
  N5: '产品喂入',
}

/** Version + semantic short name shown in UI */
export const ARTIFACT_KIND = {
  N0: {
    version: 'v0.1',
    shortName: 'colloquial script',
    description: '口语化 mission 原文',
  },
  N1: {
    version: 'v0.2',
    shortName: 'phased script',
    description: '按 P1–P4 切分、带教学目的的 phased 脚本',
  },
  N2: {
    version: 'v0.3',
    shortName: 'stepped script',
    description:
      'N2 两段：先 v0.3.1 活动分析选组件，再定稿 v0.3（1 component = 1 mission step）',
  },
  N3: {
    version: 'v0.4',
    shortName: 'component content',
    description: '按 18 字段填好的 mission step 内容（P1–P4 共 4 个文件）',
  },
  N4: {
    version: 'v0.5',
    shortName: 'mission spec',
    description: '可喂产品的结构化课表（xlsx/csv/json，Runner 可下载）',
  },
  N5: {
    version: 'product',
    shortName: 'product preview',
    description: '产品端课程预览 + 走读 Checkpoint',
  },
} as const

export const NODE_RUN_STATUSES = [
  'pending',
  'running',
  'awaiting_activity_selection',
  'awaiting_review',
  'approved',
  'failed',
  'stale',
] as const
export type NodeRunStatus = (typeof NODE_RUN_STATUSES)[number]
export const NodeRunStatusSchema = z.enum(NODE_RUN_STATUSES)

export const MISSION_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived',
] as const
export type MissionStatus = (typeof MISSION_STATUSES)[number]
export const MissionStatusSchema = z.enum(MISSION_STATUSES)

export function nextNode(node: NodeId): NodeId | null {
  const i = NODE_IDS.indexOf(node)
  if (i < 0 || i >= NODE_IDS.length - 1) return null
  return NODE_IDS[i + 1]!
}

export function prevNode(node: NodeId): NodeId | null {
  const i = NODE_IDS.indexOf(node)
  if (i <= 0) return null
  return NODE_IDS[i - 1]!
}

export function artifactLabel(node: NodeId): string {
  const a = ARTIFACT_KIND[node]
  return `${a.version} ${a.shortName}`
}
