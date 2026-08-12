import { z } from 'zod'
import { MissionStatusSchema, NodeIdSchema } from './nodes.js'

export const CreateMissionSchema = z.object({
  name: z.string().min(1).max(100),
  topic: z.string().min(1).max(200),
  masterDataVersion: z.string().min(1).default('v0729'),
  scriptMd: z.string().min(1).max(50_000),
  ownerName: z.string().min(1).default('CD'),
})

export type CreateMissionInput = z.infer<typeof CreateMissionSchema>

export const MissionSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  topic: z.string(),
  status: MissionStatusSchema,
  currentNode: NodeIdSchema,
  masterDataVersion: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  openBlockingDecisions: z.number().int().nonnegative(),
})

export type MissionSummary = z.infer<typeof MissionSummarySchema>

export const CanvasNodeSchema = z.object({
  node: NodeIdSchema,
  label: z.string(),
  status: z.string(),
  artifactLabel: z.string(),
  artifactDescription: z.string(),
  openBlockingDecisions: z.number().int().nonnegative(),
  canRun: z.boolean(),
  canApprove: z.boolean(),
})

export type CanvasNode = z.infer<typeof CanvasNodeSchema>
