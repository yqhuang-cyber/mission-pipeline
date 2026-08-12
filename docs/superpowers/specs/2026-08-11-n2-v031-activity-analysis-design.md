# N2 V0.3.1 Activity Analysis — Design

> **Date**: 2026-08-11  
> **Status**: Approved for implementation  
> **Related**: `pipeline_design.md` N2 · PRD「script_step 活动设计」

## Goal

N2 becomes a two-phase hard gate: Run produces **V0.3.1** (activity analysis + candidate components); CD selects 1 component per activity and Confirms; system generates **V0.3**; CD may still edit V0.3 before Approve → N3.

## Decisions

| Topic | Choice |
|---|---|
| Gate | Hard gate inside N2 (not optional sidecar) |
| Selection | 1 activity → 1 component |
| Activity edit | Tweak title/intent only; no add/merge/split |
| After Confirm | Full V0.3 editor remains available |
| Topology | Single N2 node (not N2a/N2b) |
| V0.3 outline source | **Each activity's 原文锚点 (`sourceAnchor`)** — never re-slice full v0.2 step body via `outlineFromBody` |

## State machine

```
Run N2 → awaiting_activity_selection (+ v0.3.1 artifact)
  → Confirm selections → awaiting_review (+ v0.3 artifact)
  → edit v0.3 (optional, repeat) → Approve → N3 unlocked

Reject @ selection → pending (rerun analysis)
Reject @ review (N2) → awaiting_activity_selection (keep v0.3.1)
```

## Artifacts

| Kind | File | When |
|---|---|---|
| `v0.3.1` | `v0.3.1_activity_analysis.md` (+ `.json`) | After Run N2 |
| `v0.3` | `v0.3_step_component_map.md` | After Confirm |

N3 input must resolve latest **v0.3** (not v0.3.1).

## Analysis rules

- Input: v0.2 purpose + body + phase + catalog (+ N1 suggestions as hints)
- Split each script_step into 1–5 teaching activities
- Per activity: title, intent, source anchor, 3–5 candidate CMPs (phase-allowed), one recommended
- CD may tweak title/intent; must pick exactly one CMP per activity

## APIs

- `GET/PUT /api/missions/:id/artifacts/N2/v031`
- `POST /api/missions/:id/nodes/N2/confirm-activities`

## Out of scope

- Primary/secondary dual-track selection in V0.3.1
- DisplayText / Kai fill (N3)
- Splitting N2 into two pipeline nodes
- Collaborative multi-user selection
