# N2 V0.3.1 Activity Analysis — Implementation Plan

> **For agentic workers:** Spec: `docs/superpowers/specs/2026-08-11-n2-v031-activity-analysis-design.md`

**Goal:** N2 two-phase gate: V0.3.1 activity analysis → CD selects 1 CMP/activity → Confirm → V0.3.

**Status:** Implemented 2026-08-11

## Files

| File | Role |
|---|---|
| `packages/shared/src/nodes.ts` | `awaiting_activity_selection` status |
| `apps/api/prisma/schema.prisma` | enum |
| `apps/api/src/nodes/n2ActivityAnalysis.ts` | analyze / render / confirm flatten |
| `apps/api/src/services/nodeService.ts` | Run→v031, confirm, reject, APIs |
| `apps/api/src/routes/missions.ts` | GET/PUT v031, POST confirm-activities |
| `apps/web/components/pipeline/V031ActivityModal.vue` | selection UI |
| `apps/web/pages/missions/[id]/index.vue` | wire buttons |

## Verify

1. Approve N1 → Run N2 → status `awaiting_activity_selection`, output V0.3.1
2. Open 审选活动 → pick CMPs → Confirm → `awaiting_review` + v0.3
3. Edit v0.3 → Approve → Run N3
