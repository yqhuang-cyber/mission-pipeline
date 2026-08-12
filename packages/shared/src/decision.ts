import { z } from 'zod'
import { NodeIdSchema } from './nodes.js'

export const DECISION_TYPES = [
  'choice',
  'confirm',
  'edit_required',
  'warning_ack',
] as const
export type DecisionType = (typeof DECISION_TYPES)[number]

export const DECISION_SEVERITIES = ['blocking', 'deferrable', 'info'] as const
export type DecisionSeverity = (typeof DECISION_SEVERITIES)[number]

export const DecisionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  recommended: z.boolean().optional(),
})

export const DecisionCreateSchema = z.object({
  node: NodeIdSchema,
  targetType: z.enum(['script_step', 'mission_step', 'field', 'mission']),
  targetId: z.string().optional(),
  type: z.enum(DECISION_TYPES),
  severity: z.enum(DECISION_SEVERITIES),
  question: z.string().min(1),
  options: z.array(DecisionOptionSchema).default([]),
  aiRationale: z.string().optional(),
})

export type DecisionCreate = z.infer<typeof DecisionCreateSchema>

export const DecisionResolveSchema = z.object({
  action: z.enum(['choose', 'edit', 'defer', 'skip']),
  value: z.string().optional(),
  optionId: z.string().optional(),
})

export type DecisionResolve = z.infer<typeof DecisionResolveSchema>
