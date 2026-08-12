# Mission Pipeline M1b — N1–N3 Nodes Implementation Plan

> **For agentic workers:** Use executing-plans / continue inline. Checkbox tracking.

**Goal:** Replace stub runners for N1–N3 with real node engines: LLM (OpenAI) + heuristic fallback, validators, Decision Card emission.

**Architecture:** `apps/api/src/nodes/*` produce `{ content, decisions[], traces[] }`. `nodeService.runNode` dispatches by node id, persists artifact + decisions, enters `awaiting_review`. No API key → deterministic heuristic so local demo works.

**Tech Stack:** OpenAI Chat Completions API · Zod · existing Prisma Decision model

## Tasks

### Task 1: LLM client + fallback
- Create `apps/api/src/llm/client.ts` with `completeMarkdown({ system, user })`
- Env: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o`)
- Without key: throw `LlmUnavailableError` so callers use heuristic

### Task 2: Master eligibility + N2 validator
- Create `apps/api/src/master/eligibility.ts` (allowed CMP per P1–P4 + enforcement)
- Create `apps/api/src/validators/n2.ts` → errors/warnings + DecisionCreate[]

### Task 3: N1 engine
- Parse / LLM → v0.2 phased script markdown
- Validate phase order, purposes; emit decisions for TBD purposes / empty phases

### Task 4: N2 engine
- LLM or heuristic map → v0.3 stepped script
- Run enforcement; auto-fix out-of-phase CMP; blocking decisions for P1 missing CMP-04 etc.

### Task 5: N3 engine
- Expand each mission step into 18-field skeleton markdown split by P1–P4 sections
- Optional LLM polish later; Display Text template NA for 无-template comps

### Task 6: Wire + UI resolve
- `nodeService` dispatch; clear unresolved decisions on rerun
- Web: resolve blocking decisions (choose/skip)

### Task 7: Verify
- Unit tests validators + N1 parse
- API smoke N0→N3 with heuristic path
