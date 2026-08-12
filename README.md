# Mission Pipeline

中文教学课程制作流水线：**口语化 script → 可视化 N0–N5 → 硬门禁 HITL → mission spec**。

## 技术栈

| 层 | 选型 |
|---|---|
| Web | Nuxt 3 + Vue 3 |
| API | Node.js + Fastify |
| DB | PostgreSQL 16 + Prisma |
| Monorepo | pnpm workspace |

## 目录

```
apps/web          Pipeline Runner UI
apps/api          Pipeline Engine API
packages/shared   共享类型 / Zod
master/           主数据（已有）
missions/         样例 mission（已有）
docs/PRD.md       产品需求
```

## 本地启动

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/health

## 当前能力

- 创建 mission（粘贴 v0.1 colloquial script）
- Pipeline Canvas：N0–N5 + Input / Output / Decisions / Actions
- 硬门禁 Approve；blocking Decision 未处理不可 Approve
- **N1** phased script：OpenAI（有 key）或 heuristic 切片
- **N2** stepped script：component 映射 + eligibility enforcement + Decision
- **N3** component content：按 mission step 展开 18 字段骨架（P1–P4 合集）
- N4/N5 仍为 placeholder

可选环境变量（见 `.env.example`）：

```bash
LLM_PROVIDER=minimax
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimaxi.com/v1   # 国内站；国际站为 api.minimax.io
MINIMAX_MODEL=MiniMax-M2.5
```

无 key 或 LLM 失败时，N1/N2 自动降级 heuristic，并在 Decisions 里提示原因。
