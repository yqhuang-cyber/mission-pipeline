# Plan: Replay / 聚焦知识点 activity regroup

> **Spec**: `docs/superpowers/specs/2026-08-12-replay-focus-activity-regroup-design.md`  
> **Date**: 2026-08-12

## Files

- `apps/api/src/nodes/n2ActivityAnalysis.ts` — regroup + naming + scoring bumps
- `apps/api/src/nodes/n2ActivityAnalysis.test.ts` — step5 gold fixture
- Spec already written

## Tasks

1. Add `expandReplayFocusCluster(text)` → `RawChunk[] | null`
2. Wire into `splitBodyIntoChunks`; raise cap 5→10
3. Title/score hooks for 情境回放 / 聚焦知识点
4. Test: 5 activities in expected order; run full n2ActivityAnalysis tests
