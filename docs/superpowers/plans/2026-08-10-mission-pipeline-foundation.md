# Mission Pipeline Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 workspace 落地可运行的 monorepo 骨架：Nuxt/Vue Pipeline Runner + Node.js Pipeline Engine API + PostgreSQL，对齐 PRD v1.1 的节点状态机与 Mission 模型。

**Architecture:** pnpm workspace。`apps/web`（Nuxt 3）为 CD 主入口；`apps/api`（Fastify + Prisma）承载节点 Run/Approve/Decision；共享类型在 `packages/shared`；本地 Postgres 用 Docker Compose。现有 `master/`、`missions/` 作为主数据与样例产物，API 只读引用。

**Tech Stack:** Nuxt 3 · Vue 3 · TypeScript · Node.js 20+ · Fastify · Prisma · PostgreSQL 16 · pnpm · Zod · Docker Compose

## Global Constraints

- CD 主入口必须是 Web Pipeline Runner（非 CLI）
- 节点间硬门禁：未 Approve 不可进下一节点
- 术语：v0.3 = stepped script（1 component = 1 mission step）；v0.5 = mission spec
- 主数据 schema 文件：`master/mission_spec_schema.csv`
- 不引入 Python 运行时；xlsx 导出后续用 Node 库（exceljs）
- 包管理：pnpm；Node ≥ 20

## File Structure

```
mission_workspace/
├── apps/
│   ├── web/                 # Nuxt 3 Pipeline Runner UI
│   └── api/                 # Fastify Pipeline Engine
├── packages/
│   └── shared/              # Zod schemas + TS types (NodeId, Decision, …)
├── docker-compose.yml       # postgres:16
├── package.json             # pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example
├── master/                  # existing master data (unchanged location)
├── missions/                # existing mission samples
└── docs/PRD.md
```

---

### Task 1: Monorepo + Postgres scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `docker-compose.yml`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`
- Create: `apps/web/` via `pnpm dlx nuxi@latest init`

**Interfaces:**
- Produces: workspace scripts `dev`, `dev:api`, `dev:web`, `db:up`
- Produces: shared package name `@mission-pipeline/shared`

- [ ] **Step 1: Create root workspace files**

Root `package.json`:
```json
{
  "name": "mission-pipeline",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel --filter @mission-pipeline/api --filter @mission-pipeline/web dev",
    "dev:api": "pnpm --filter @mission-pipeline/api dev",
    "dev:web": "pnpm --filter @mission-pipeline/web dev",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:migrate": "pnpm --filter @mission-pipeline/api prisma migrate dev",
    "typecheck": "pnpm -r typecheck"
  },
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9.15.0"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`docker-compose.yml`: Postgres 16 on `5432`, db/user/password `mission`/`mission`/`mission`, volume `pgdata`.

`.env.example`:
```
DATABASE_URL=postgresql://mission:mission@localhost:5432/mission?schema=public
NUXT_PUBLIC_API_BASE=http://localhost:3001
API_PORT=3001
```

- [ ] **Step 2: Scaffold shared + api packages and Nuxt web**

- [ ] **Step 3: `pnpm install` and `docker compose up -d postgres`**

- [ ] **Step 4: Commit** `chore: scaffold mission-pipeline monorepo`

---

### Task 2: Shared domain types (nodes, decisions, artifacts)

**Files:**
- Create: `packages/shared/src/nodes.ts`
- Create: `packages/shared/src/decision.ts`
- Create: `packages/shared/src/mission.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `NODE_IDS`, `NodeId`, `NodeRunStatus`, `ArtifactKind`, `DecisionSeverity`, Zod schemas

- [ ] **Step 1: Define node constants and Zod schemas** matching PRD §4/§5/§8

```ts
export const NODE_IDS = ['N0','N1','N2','N3','N4','N5'] as const
export type NodeId = typeof NODE_IDS[number]
export const ARTIFACT_KIND = {
  N0: 'v0.1_colloquial_script',
  N1: 'v0.2_phased_script',
  N2: 'v0.3_stepped_script',
  N3: 'v0.4_component_content',
  N4: 'v0.5_mission_spec',
  N5: 'product_preview',
} as const
```

- [ ] **Step 2: Export from index; typecheck shared package**

- [ ] **Step 3: Commit** `feat(shared): add pipeline node and decision types`

---

### Task 3: Prisma schema + Mission/NodeRun/Decision tables

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/...`
- Create: `apps/api/src/db.ts`

**Interfaces:**
- Produces: Prisma models `Mission`, `NodeRun`, `Decision`, `Artifact`, `AuditEvent`
- Consumes: `DATABASE_URL`

- [ ] **Step 1: Write schema** with enums for node/status/severity; Mission has `currentNode`; NodeRun unique `(missionId, node, attempt)`

- [ ] **Step 2: Run migrate** `pnpm db:migrate` → expect tables created

- [ ] **Step 3: Commit** `feat(api): add prisma mission pipeline schema`

---

### Task 4: Fastify API — missions CRUD + canvas

**Files:**
- Create: `apps/api/src/app.ts`, `apps/api/src/routes/missions.ts`
- Create: `apps/api/src/services/missionService.ts`
- Test: `apps/api/src/routes/missions.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/missions` `{ name, topic, masterDataVersion, scriptMd }` → mission + N0 artifact
  - `GET /api/missions`
  - `GET /api/missions/:id`
  - `GET /api/missions/:id/canvas` → node statuses

- [ ] **Step 1: Write failing test** for create mission returns id + currentNode N0

- [ ] **Step 2: Implement routes + service** (store v0.1 text as Artifact)

- [ ] **Step 3: Tests pass; commit** `feat(api): missions CRUD and canvas`

---

### Task 5: Node run / approve hard-gate (N0 stub → unlock N1)

**Files:**
- Create: `apps/api/src/services/nodeService.ts`
- Create: `apps/api/src/routes/nodes.ts`
- Test: `apps/api/src/services/nodeService.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/missions/:id/nodes/:node/run`
  - `POST /api/missions/:id/nodes/:node/approve`
  - Hard gate: cannot run N{k+1} until N{k} approved
  - Blocking decisions > 0 → approve 409

- [ ] **Step 1: Failing tests** for gate + approve

- [ ] **Step 2: Implement state machine** `pending→running→awaiting_review→approved`

- [ ] **Step 3: Commit** `feat(api): node run/approve hard gates`

---

### Task 6: Nuxt Pipeline Runner shell UI

**Files:**
- Create: `apps/web/pages/index.vue`, `apps/web/pages/missions/index.vue`, `apps/web/pages/missions/[id]/index.vue`
- Create: `apps/web/components/pipeline/PipelineCanvas.vue`, `NodeWorkbench.vue`, `DecisionPanel.vue`
- Create: `apps/web/composables/useApi.ts`, `apps/web/nuxt.config.ts` (proxy/public api base)

**Interfaces:**
- Consumes: canvas + node endpoints
- Produces: list missions, create with script paste, open Canvas with N0–N5 + workbench tabs Input/Output/Decisions/Actions

- [ ] **Step 1: Wire API base and mission list/create pages**

- [ ] **Step 2: Canvas + workbench shell** (statuses from API; Run/Approve buttons call API)

- [ ] **Step 3: Commit** `feat(web): pipeline runner canvas shell`

---

### Task 7: PRD tech stack sync + smoke README

**Files:**
- Modify: `docs/PRD.md` §9 tech stack → Nuxt/Vue/Node/PG
- Modify: root `README.md` with `pnpm db:up && pnpm dev`

- [ ] **Step 1: Update PRD architecture diagram and stack table**

- [ ] **Step 2: Document local run; smoke check API health + web loads**

- [ ] **Step 3: Commit** `docs: align PRD stack with Nuxt/Node/PG`

---

## Later plans (out of this file)

- M1b: N1–N3 LLM node workers + validators + Decision emission
- M1c: N4 mission-spec export (exceljs) + preview
- M2 polish: full workbench editors, stale propagation, audit UI
- M3: admin, dashboard analytics, multi-LLM

## Spec coverage (foundation)

| PRD area | Task |
|---|---|
| Web as CD entry | Task 6 |
| Hard gate HITL | Task 5 |
| Mission / NodeRun / Decision models | Task 2–3 |
| Canvas + I/O shell | Task 6 |
| mission spec naming | Task 2 ARTIFACT_KIND |
| Full LLM nodes / export | Later plans |
