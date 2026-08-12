# V0.4 Component Content Editor — Design

> **Date**: 2026-08-12  
> **Status**: Approved  
> **Related**: N3 `v0.4_component_content_p{1–4}.md` · V0.3 editor pattern

## Goal

CD can edit V0.4 while N3 is `awaiting_review`, with **draft save (暂存)** that does not Approve.

## Scope (option A)

Per `mission_step` editable:

- DisplayText (code fence)
- Step, Display Image, Video Play, Kai Script 1/2, Feedback Correct/Wrong, Transition Script, Knowledge point

**Read-only**: Phase, Script Step, Component (identity for N4).

## Behavior

| Action | Effect |
|---|---|
| Open「编辑 v0.4」 | Load structured rows from latest N3 artifact |
| 暂存 | PUT structured → rewrite P1–P4 md + bundle; stay `awaiting_review` |
| Approve | Unchanged existing N3 Approve → unlock N4 |

Editable only when N3 `awaiting_review`.

## API

- `GET /api/missions/:id/artifacts/N3/structured`
- `PUT /api/missions/:id/artifacts/N3/structured` body: `{ rows: EditRow[] }`

## Implementation notes

- Parse: extend/reuse `parseV04ToRows` (+ missionStepId / cmpId)
- Render: existing `renderPhaseFile` / bundle write path used by `runN3`
- UI: `V04EditorModal.vue` (phase sidebar + field form); mission page button when N3 awaiting_review
