# 中文教学课程制作 Pipeline · 产品需求文档 (PRD)

> **版本**: v1.1
> **日期**: 2026-08-10
> **作者**: Mavis (Course Pipeline Team)
> **配套**: `pipeline_design.md` (技术设计) · `pipeline_nodes_table.md` (节点对照) · `pipeline_nodes_detail.md` (完整 spec)
> **v1.1 焦点**: Web **Pipeline Runner** 为主入口；节点级 I/O 可视化；**硬门禁 HITL**；节点内 **Decision Card**；产物命名对齐（v0.5 = **mission spec**）

为了保证 mission 体验，最重要的需求是保证 phase 中每一个 script_step 以及其选用的 component 排布合理。老师输入初始的口语化 script，需要 AI 流水线来更好地完成对应的 learning journey 设计。最终的每一行（每一个 learning_step / mission step）的**教学目的**，比对应的 component 更重要。

## TODO

### 人机协作 · script_step 活动设计

- **未来每一个 `script_step` 中**：由内容专家（CD）控制和设计 **primary** 活动；由 AI 补充建议 **secondary** 活动；内容专家审核 AI 建议后，再定稿 **primary + secondary** 的完整结果。
- 对齐开篇主旨：教学目的优先于具体 component；专家锁 primary 意图，AI 扩 secondary，人审合稿。
- **已落地（N2 V0.3.1）**：Run N2 先产出活动分析过程文档；CD 为每个 activity 选 1 个 component 后 Confirm → 生成 v0.3（详见 design spec）。

### REAL-WORLD PERFORMANCE MISSION · 剧目分析

- 针对 **REAL-WORLD PERFORMANCE MISSION**：探究是否可基于 `script_step` 内容，由 AI 生成 **mission 剧目分析信息**（场景、角色、冲突、表演要点等）。
- 前提：此类 mission 的 `script_step` **后续均以剧目 + role play 形式呈现**；分析产物需服务排演与课堂表演，而非普通讲解型步骤。
- 后续，需要生成视频以及对应component的内容

---

## 1. 项目背景

### 1.1 现状

目前中文教学课程制作流程：

1. CD (Content Designer) 收到口语化 script (`v0.1`)
2. CD 手动拆 phase、写教学目的 → `v0.2` (Markdown)
3. CD 选 component、写内容 → `v0.3` + `v0.4` (Markdown)
4. CD 手工填 13 字段进 xlsx → `v0.5` (Excel)
5. 工程师导入产品 → 上线

**痛点**:
- **效率低**: 1 个 mission (~45 mission step) 人工 ~2 小时
- **易错**: Display Text 模版规则、Phase 限制、Knowledge Point 字段等容易漏
- **难协作**: CD/TD/PM 都在不同 Markdown 文件上改, 缺 review 流程
- **难复用**: 没有 pipeline 化, 知识散落在人脑中
- **难验证**: 校验靠人眼, 不通过往往上线后才暴露
- **难观察**: 过程在本地文件里，看不到每节点输入/输出与待决策项

### 1.2 Mission 4 实战数据（基线）

| 维度 | 现状 |
|---|---|
| 1 个 mission 产出 | v0.1 → v0.5 共 9 个文件 |
| 人工时长 | ~2h (CD 主操作 + TD 2 次 review) |
| LLM token | ~200K |
| Mission step 数 | 45（1 component = 1 mission step） |
| Component 使用率 | 22 / 37 (60%) |
| 校验错误 | Display Text 模版、空值约定、Phase 限制等 |

### 1.3 目标

把口语化 mission script **在 Web 上可视化跑通 N0→N5**：每节点可见输入/输出，跑完进入硬门禁由人检查，节点运行中可抛出需人决策的内容；校验自动化；协作可观测。

**产品一句话**：CD 粘贴口语化 script → Pipeline Canvas 逐步 Run → 审 Output / 处理 Decision → Approve → 下一节点 → 导出 **mission spec**。

---

## 2. 用户与场景

### 2.1 用户角色

| 角色 | 缩写 | 职责 | 使用频次 |
|---|---|---|---|
| **Content Designer** | CD | Web 主用户：上传 script、跑节点、审输出、处理决策、Approve | 每日 1-2 个 mission |
| **Tech Designer** | TD | 评论、调整校验/eligibility；不挡 CD 推进 | 每周 5-10 个 mission |
| **Product Manager** | PM | 创建 mission、看 dashboard、拍板规则变更 | 每周 |
| **Engineer** | Dev | Pipeline Engine / CLI / 产品接入 | 持续 |
| **AI/LLM Ops** | Ops | 调 prompt、监控 token、处理失败 | 持续 |

### 2.2 核心场景

**场景 1: CD 用 Web 完成 1 个 mission（主路径）**
```
CD 新建 Mission → 粘贴/上传口语化 script (v0.1) → 进入 Pipeline Canvas
→ Run N1 → 查看 v0.2 phased script I/O → 处理 Decision → Approve
→ Run N2 → 查看 v0.3 stepped script → Approve
→ Run N3 → 查看 v0.4 component content → Approve
→ Run N4 → 查看 v0.5 mission spec + 预览 → Approve
→ Run N5 → 产品预览走读 → Approve / 回写问题
```

**场景 2: 节点抛出决策，CD 当场处理**
```
N2 运行中发现「P1 缺 CMP-04」→ 抛出 blocking Decision Card
→ CD 选择补挂 CMP-04 或改 phase → 写回 Output → 方可 Approve
```

**场景 3: TD 调整校验规则**
```
TD 改 phase_component_eligibility → 系统标出受影响 in-flight mission
→ 红/黄/绿 → CD 在对应节点重跑/重审
```

**场景 4: PM 看 dashboard**
```
本周 mission 数、token、错误率、卡在哪一节点（含待决策数）
```

**场景 5: Engineer 调试**
```
用 CLI/API 调同一套 Pipeline Engine（非 CD 主路径）
```

---

## 3. 范围 (Scope)

### 3.1 In Scope（M1-M3）

| 模块 | 描述 |
|---|---|
| **Pipeline Engine** | N0–N5 节点执行、状态机、产物版本、校验、Decision Card |
| **Web Pipeline Runner** | Canvas + 节点工作台（Input / Output / Decisions / Actions） |
| **硬门禁 HITL** | 每节点 `awaiting_review` → CD Approve 后才解锁下一节点 |
| **Decision Card** | 节点运行中抛出；blocking 未清零不可 Approve |
| **口语化 script 入口** | 粘贴或上传 `.md` 作为 v0.1 |
| **LLM 集成** | OpenAI gpt-4o 默认 + Anthropic/国产 fallback |
| **校验引擎** | 11 条 component 映射 + 6 条 Display Text + 7 条 Spec schema |
| **主数据** | catalog / eligibility / meta model / **mission_spec_schema** 版本化 |
| **预览** | 3 件套对比 (UI 原型 + to-be + 重点信息) |
| **导出** | `v0.5_mission_spec.xlsx` / `.json` + 资产待补清单 |
| **CLI（工程面）** | 调试/自动化；能力对齐 Engine，非 CD 主入口 |
| **分析** | Token、错误率、节点时长、卡点（含 decision backlog）|

### 3.2 Out of Scope（暂不做）

| 项 | 原因 |
|---|---|
| 真实资产生成 (视频/音频/图) | 资产 pipeline 独立, 走 CMS |
| 多语言支持 | 当前专注中文 |
| 移动端 App | v1 仅 web |
| 实时协作 (Google Doc 风格) | v1 异步评论, v2 实时 |
| 离线模式 | 必须联网调 LLM |
| TD 强制门禁 | v1 CD 全程可 Approve；TD 不挡推进 |

---

## 4. 产品主路径：Pipeline Runner

### 4.1 界面结构

**Mission Pipeline Canvas**

- **顶栏**: mission 名、当前节点、状态、token/耗时、待决策数
- **中部**: N0–N5 节点图  
  状态：`pending` / `running` / `awaiting_review` / `approved` / `failed` / `stale`
- **右侧工作台**: **Input | Output | Decisions | Actions**
- **Actions**: `Run` · `Edit output` · `Resolve decisions` · `Approve & Continue` · `Reject & Rerun`

### 4.2 节点级状态机

```
pending → running → awaiting_review → approved → (解锁下一节点)
                ↘ failed
approved 回退 → pending；下游全部标 stale，需按序重跑/重审
```

**硬门禁（默认）**:
1. 节点成功结束后进入 `awaiting_review`，**必须** CD Approve 才能进下一节点
2. Approve 前置：校验无 **error**；所有 **blocking** Decision 已处理（warning 可带病通过并留痕）
3. Reject：可改 Output 后重审，或 Rerun（保留上一版对比）
4. CD 对 N1–N5 均可 Approve；TD 可评论/改规则，**不挡** CD 推进

### 4.3 产物命名（表意 + 版本号）

| 版本 | 表意短名 | 含义 |
|---|---|---|
| **v0.1** | colloquial script | 口语化 mission 原文 |
| **v0.2** | phased script | 按 P1–P4 切分、带教学目的的脚本 |
| **v0.3** | stepped script | 每个 **component = 一个 mission step** 的 stepped 映射脚本 |
| **v0.4** | component content | 按 13 字段填好的 mission step 内容（**P1–P4 共 4 个文件**） |
| **v0.5** | mission spec | 可喂产品的结构化课表（xlsx/json） |

UI 同时显示版本号与表意短名（例：`v0.2 phased script`），禁止只显示裸文件名。

### 4.4 节点工作台 I/O

| 节点 | Input 展示 | Output 展示 | 主编辑器 |
|---|---|---|---|
| **N0** | Mission 元信息 + 主数据版本选择 | **v0.1 colloquial script** — 口语化 mission 原文（上传后锁定） | 表单 + 粘贴/上传 |
| **N1** | v0.1 colloquial script（口语化原文） | **v0.2 phased script** — 按 P1–P4 切分、带教学目的的 phased 脚本 | 左原文 / 右 phase 树 |
| **N2** | v0.2 phased script + Phase×Component 允许矩阵摘要 | **v0.3 stepped script** — 每个 component 对应一个 mission step 的映射脚本 | 表格 + 规则红黄灯 |
| **N3** | v0.3 stepped script + component 模版 | **v0.4 component content** — 按 13 字段填好的 mission step 内容（P1–P4 共 4 个文件） | 13 字段表单 + Display Text 校验 |
| **N4** | **v0.4 component content（P1–P4 共 4 个文件）** — 各 phase 的 mission step 内容合集 | **v0.5 mission spec** — 可喂产品的结构化课表（xlsx/json）+ 3 件套预览 | 只读表格 + compare HTML |
| **N5** | v0.5 mission spec（结构化课表） | **product preview** — 产品端课程预览 URL + 走读报告 | 外链预览 + 问题回写 |

运行中展示进度（如 N3 `12/45`）、token、可取消；完成后自动进入 `awaiting_review`。

---

## 5. Human-in-the-loop · Decision Card

### 5.1 Decision Card 模型

| 字段 | 说明 |
|---|---|
| `id` / `node` / `target` | 卡片 ID、节点、作用对象（script_step / mission step / 字段） |
| `type` | `choice` / `confirm` / `edit_required` / `warning_ack` |
| `severity` | `blocking`（挡 Approve）/ `deferrable`（可 Defer）/ `info` |
| `question` + `options` | 问题与选项（含 AI 推荐） |
| `ai_rationale` | 为何卡住 / 为何推荐 |
| `resolution` | chosen / edited_value / skipped / deferred + 操作人/时间 |

### 5.2 典型抛出点

| 节点 | 示例 |
|---|---|
| N1 | 边界 phase（Context Story 归 P1/P2）、空号 script_step、教学目的 TBD |
| N2 | 强制规则未满足、多 component 挂载确认、auto-replaced 组件确认 |
| N3 | Display Text 模版冲突、`[待补]` 资产、文案语气不确定 |
| N4 | 主键冲突自动后缀确认、资产清单未齐 |
| N5 | 走读问题：是否退回 N2/N3 |

### 5.3 交互

- Decisions 面板与 Output 并列；blocking 未清零时 `Approve` 禁用
- 动作：`Choose` / `Edit` / `Defer` / `Skip`（仅 info/非强制）→ 写回 Output + audit log

---

## 6. 功能需求 (Functional Requirements)

### FR-1: Mission 管理

| ID | 描述 | 优先级 |
|---|---|---|
| FR-1.1 | 创建 mission（name, topic, master_data_version, v0.1 粘贴/上传） | P0 |
| FR-1.2 | Mission 列表 + 筛选 (status, owner, date, stuck_node) | P0 |
| FR-1.3 | 打开即进入 Pipeline Canvas | P0 |
| FR-1.4 | Mission 复制 | P1 |
| FR-1.5 | Mission 删除/归档 | P1 |
| FR-1.6 | Mission 状态机 (draft / in-review / approved / published) | P0 |

### FR-2: 节点流水线 (N0–N5)

| ID | 步骤 | 描述 | 优先级 |
|---|---|---|---|
| FR-2.1 | N0 准备 | 创建 + v0.1 colloquial script + 绑主数据版本 | P0 |
| FR-2.2 | N1 | → v0.2 phased script | P0 |
| FR-2.3 | N2 | → v0.3 stepped script（1 component = 1 mission step） | P0 |
| FR-2.4 | N3 | → v0.4 component content（P1–P4 共 4 文件） | P0 |
| FR-2.5 | N4 | → v0.5 mission spec + 预览 | P0 |
| FR-2.6 | N5 | 产品喂入 + 走读 | P0 |

### FR-3: Pipeline Runner UI

| ID | 描述 | 优先级 |
|---|---|---|
| FR-3.1 | Canvas 展示 N0–N5 及节点状态 | P0 |
| FR-3.2 | 每节点 Input / Output 完整可查（含表意短名） | P0 |
| FR-3.3 | Run / 进度 / 取消 | P0 |
| FR-3.4 | Edit output（结构化编辑，非纯裸文件） | P0 |
| FR-3.5 | Approve / Reject / Rerun | P0 |
| FR-3.6 | 上游回退后下游标 stale | P0 |
| FR-3.7 | 上一版 Output 对比（Rerun 后） | P1 |

### FR-4: HITL / Decision

| ID | 描述 | 优先级 |
|---|---|---|
| FR-4.1 | 硬门禁：未 Approve 不可进下一节点 | P0 |
| FR-4.2 | Decision Card 抛出与列表 | P0 |
| FR-4.3 | blocking 未处理禁止 Approve | P0 |
| FR-4.4 | Resolve 写回 Output + audit | P0 |
| FR-4.5 | Defer / Skip 规则按 severity | P0 |
| FR-4.6 | CD 全程可 Approve；TD 不挡推进 | P0 |

### FR-5: LLM 集成

| ID | 描述 | 优先级 |
|---|---|---|
| FR-5.1 | litellm 多 provider | P0 |
| FR-5.2 | gpt-4o 默认 | P0 |
| FR-5.3 | Anthropic fallback | P1 |
| FR-5.4 | 国产 LLM | P2 |
| FR-5.5 | Token/cost 记录 | P0 |
| FR-5.6 | Prompt 版本管理 | P1 |
| FR-5.7 | 重试 2 次 + fallback | P0 |
| FR-5.8 | 异步执行 (Celery/Arq) | P0 |

### FR-6: 校验引擎

| ID | 描述 | 优先级 |
|---|---|---|
| FR-6.1 | 11 条 Component 映射 enforcement | P0 |
| FR-6.2 | 6 条 Display Text v0809.3 | P0 |
| FR-6.3 | 7 条 mission spec schema 校验 | P0 |
| FR-6.4 | 生成/编辑后自动校验 | P0 |
| FR-6.5 | 错误定位到行/字段 + 可转 Decision | P0 |
| FR-6.6 | warning vs error | P0 |
| FR-6.7 | TD 自定义规则 | P1 |

### FR-7: 主数据

| ID | 描述 | 优先级 |
|---|---|---|
| FR-7.1 | Component catalog 读 | P0 |
| FR-7.2 | catalog 编辑 (admin) | P1 |
| FR-7.3 | Phase eligibility 读/编辑 | P0 / P1 |
| FR-7.4 | Meta model 读 | P0 |
| FR-7.5 | **mission_spec_schema** 读 | P0 |
| FR-7.6 | 主数据版本化不可变 | P0 |
| FR-7.7 | 变更影响分析 | P1 |

### FR-8: 预览 / 导出 / 集成

| ID | 描述 | 优先级 |
|---|---|---|
| FR-8.1 | 3 件套对比预览 | P0 |
| FR-8.2 | 导出 `v0.5_mission_spec.xlsx` | P0 |
| FR-8.3 | 导出 `v0.5_mission_spec.json` | P0 |
| FR-8.4 | 资产 `[待补]` 清单 | P0 |
| FR-8.5 | 推送产品 webhook | P1 |

### FR-9: 协作 / 监控 / CLI

| ID | 描述 | 优先级 |
|---|---|---|
| FR-9.1 | 变更 history + audit | P0 |
| FR-9.2 | 评论/@mention | P1 |
| FR-9.3 | Dashboard（含卡点节点、decision backlog） | P0 |
| FR-9.4 | LLM trace | P0 |
| FR-9.5 | CLI 调试（工程面，非 CD 主路径） | P1 |

---

## 7. 非功能需求 (Non-Functional Requirements)

### 7.1 性能

| ID | 指标 | 目标 |
|---|---|---|
| NFR-1.1 | 1 mission 全流程（含 HITL，不含 N5 走读） | CD 操作墙钟 ≤ 45 min |
| NFR-1.2 | N1 / N2 LLM | ≤ 30s / ≤ 60s |
| NFR-1.3 | N3 LLM（并行） | ≤ 5 min |
| NFR-1.4 | N4 转换+校验 | ≤ 10s |
| NFR-1.5 | Canvas / 工作台加载 | ≤ 2s |
| NFR-1.6 | 校验 | ≤ 1s / mission |

### 7.2 可靠性 / 安全 / 可观测

沿用 v1.0：重试、状态可恢复、主数据不可变、导出幂等、RBAC、audit、Sentry、LLM trace、业务事件。

新增：
- NFR-HITL-1: Approve 操作必须落 audit（who/when/node/decision resolutions）
- NFR-HITL-2: Decision 与 Output 版本绑定，Rerun 后旧 Decision 归档

### 7.3 可维护 / 可扩展

- 新增 component / phase / 规则 / LLM provider / 导出格式不改核心 Runner
- Decision type 可扩展注册

---

## 8. 数据模型

### 8.1 Mission

```yaml
mission:
  id: uuid
  name: str
  topic: str
  status: enum            # draft / in-review / approved / published / archived
  current_node: enum      # N0..N5
  master_data_version: str
  owner_id: user_id
  created_at / updated_at: datetime
  artifacts:
    v01_colloquial_script: file
    v02_phased_script: file
    v03_stepped_script: file
    v04_component_content_p1..p4: file
    v05_mission_spec_xlsx: file
    v05_mission_spec_json: file
  metrics:
    total_script_steps: int
    total_mission_steps: int   # = component 实例数
    total_llm_tokens: int
    total_cost_cny: float
    open_blocking_decisions: int
```

### 8.2 Node Run

```yaml
node_run:
  id: uuid
  mission_id: uuid
  node: enum              # N0..N5
  status: enum            # pending/running/awaiting_review/approved/failed/stale
  input_ref: artifact_ref
  output_ref: artifact_ref
  validation: { errors: [], warnings: [] }
  llm_trace_ids: [uuid]
  approved_by / approved_at: optional
```

### 8.3 Decision Card

```yaml
decision:
  id: uuid
  mission_id / node_run_id: uuid
  target: { type, id }    # script_step | mission_step | field
  type: enum
  severity: enum          # blocking / deferrable / info
  question: str
  options: [ { id, label, recommended: bool } ]
  ai_rationale: str
  resolution: optional { action, value, by, at }
```

### 8.4 Mission Step（原 lesson_step 行）

```yaml
mission_step:
  mission_id: uuid
  primary_key: (phase, script_step, component_序号)
  # 13 字段同 mission_spec_schema.csv
```

> 术语：UI/产品称 **mission step**；历史文档中的 `lesson_step` 与其同义（1 component = 1 mission step）。

---

## 9. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                 Course Pipeline (本项目)                      │
├─────────────────────────────────────────────────────────────┤
│  Web Pipeline Runner (Nuxt 3 / Vue 3)  ← CD 主入口            │
│       ↕                                                         │
│  API (Node.js / Fastify)  ↔  Workers (BullMQ)  ↔  LLM        │
│       ↕                                                         │
│  DB (PostgreSQL) + Prisma: missions / node_runs / decisions   │
│  Storage: artifacts (v0.1..v0.5)                               │
│  Master Data: catalog / eligibility / meta / mission_spec_schema│
│  CLI (Node) ← 工程调试面                                       │
│  External: Product API / S3/OSS / Sentry                       │
└─────────────────────────────────────────────────────────────┘
```

### 9.1 技术栈（已定稿）

| 层 | 选型 | 说明 |
|---|---|---|
| Frontend | **Nuxt 3 + Vue 3 + TypeScript** | Pipeline Runner UI |
| Backend | **Node.js + Fastify + TypeScript** | Pipeline Engine API |
| ORM | **Prisma** | PostgreSQL 访问 |
| DB | **PostgreSQL 16** | missions / node_runs / decisions |
| Monorepo | **pnpm workspace** | `apps/web` · `apps/api` · `packages/shared` |
| Queue（后续） | BullMQ + Redis | N1–N3 异步 LLM |
| xlsx（后续） | exceljs | v0.5 mission spec 导出 |

---

## 10. API / CLI（高层）

### 10.1 REST（Runner 核心）

```
POST   /api/missions
GET    /api/missions/{id}
GET    /api/missions/{id}/canvas          # 节点状态汇总
POST   /api/missions/{id}/nodes/{node}/run
GET    /api/missions/{id}/nodes/{node}    # input/output/validation/decisions
PATCH  /api/missions/{id}/nodes/{node}/output
POST   /api/missions/{id}/nodes/{node}/decisions/{did}/resolve
POST   /api/missions/{id}/nodes/{node}/approve
POST   /api/missions/{id}/nodes/{node}/reject
POST   /api/missions/{id}/nodes/{node}/rerun
POST   /api/missions/{id}/export          # mission spec
GET    /api/missions/{id}/preview
GET    /api/dashboard
```

### 10.2 CLI（工程面）

```bash
course-pipeline init mission --name=... --script=...
course-pipeline node run|approve|reject|rerun --mission=X --node=N2
course-pipeline export --mission=X --format=xlsx|json|html
course-pipeline validate --mission=X --node=N4
```

---

## 11. 交付里程碑

| 阶段 | 内容 | 时长 | 验收 |
|---|---|---|---|
| **M1** | Pipeline Engine：节点 API、状态机、校验、Decision 模型、最小 CLI | 2 周 | Mission 4 可 API/CLI 跑通；产物为 mission spec |
| **M2** | **Web Pipeline Runner**：Canvas、I/O 工作台、硬门禁、Decision 面板、预览 | 3 周 | CD 仅用 Web 完成 1 mission；blocking 未处理无法 Approve |
| **M3** | 评论协作、主数据 Admin、多 LLM、Dashboard 分析 | 2 周 | 卡点/决策 backlog 可见；2 人并行协作 |

**总估时**: 7 周（1 backend + 1 frontend + 0.5 PM）

---

## 12. 验收标准

### 12.1 Runner / HITL

- [ ] CD 仅用 Web：口语化 script → N0–N5 硬门禁跑通
- [ ] 每节点可查看完整 Input / Output，且带表意短名
- [ ] blocking Decision 未处理时无法 Approve
- [ ] 回退上游后下游标 stale
- [ ] Approve / Decision resolve 有 audit

### 12.2 数据

- [ ] Mission 4 重跑，与基线 `v0.5_mission_spec.xlsx` 字段一致（允许命名迁移）
- [ ] Display Text 0 违规；13 字段全填
- [ ] 主数据引用 `mission_spec_schema.csv`

### 12.3 性能 / 可观测

- [ ] N3 LLM ≤ 5 min；校验 ≤ 1s；Canvas ≤ 2s
- [ ] LLM trace + token 按 mission/node 可聚合
- [ ] 可定位卡在哪一节点、有多少 open blocking decisions

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| HITL 过重拖慢吞吐 | 效率 | Decision 分级；warning 可带病；模版化常见决策 |
| LLM 输出不稳定 | 质量 | 重试 + Decision 抛出 + 人工 Edit |
| 主数据频繁变更 | 维护 | 版本化 + 影响分析 + stale |
| 术语混用 (lesson/mission) | 沟通 | PRD/UI 统一 mission step / mission spec；旧名仅兼容 |
| LLM 成本 | 财务 | token 上限 + alert |

---

## 14. 未来 Roadmap

| 季度 | 内容 |
|---|---|
| 2026 Q4 | 实时协作；可选 TD 强制门禁（N2/N4） |
| 2027 Q1 | AI 主动建议（推荐 component / 预填 Decision）；**primary/secondary 人机分工**（见文首 TODO） |
| 2027 Q2 | 多语言 |
| 2027 Q3 | A/B + 教学效果回流 |
| 2027 Q4 | 资产自动生成 |

---

## 15. 决策记录

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-08-10 | 用 v0809 作为主数据 active 版本 | E 列更详细 |
| 2026-08-10 | Display Text 用 `NA` 不是 `—` | 区分空值/标点 |
| 2026-08-10 | v0.4 按 phase 拆 4 文件 | 单文件过长 |
| 2026-08-10 | **Web Pipeline Runner 为 CD 主入口** | 可视化跑流水线 |
| 2026-08-10 | 技术栈：**Nuxt 3 + Vue 3 + Node/Fastify + PostgreSQL/Prisma** | 前后端统一 TS |
| 2026-08-10 | **节点间硬门禁 HITL** | 每步可审、可回滚 |
| 2026-08-10 | **CD 全程可 Approve；TD 不挡推进** | 先跑顺流程 |
| 2026-08-10 | 节点可抛 **Decision Card** | 显式人机决策 |
| 2026-08-10 | **v0.3 = stepped script**；1 component = 1 mission step | 与课堂步骤对齐 |
| 2026-08-10 | **v0.5 = mission spec**（原 lesson spec） | 命名与 Mission 对齐 |
| 2026-08-10 | `master/mission_spec_schema.csv` 取代 `lesson_spec_schema.csv` | 主数据同步 |
| 2026-08-11 | `lesson_step_meta_model.md` → **`mission_phase_step_meta_model.md`** | 命名与 Mission / Phase 对齐 |
| 2026-08-11 | mission_spec_schema **18→17 字段**；meta model **v0.3** | 新表头：Step / Kai appears / Display Layout；去掉 Component 序号等 |
| 2026-08-11 | mission_spec_schema **17→12 字段**；meta model **v0.4** | 移除 Audio / Kai appears / Display Layout / Iteractive Flow |
| 2026-08-11 | mission_spec_schema **12→13 字段**；meta model **v0.4.2** | Step 后新增 Component（1 Step = 1 CMP） |

---

## 16. 附录

### A. 术语表

| 术语 | 含义 |
|---|---|
| Mission | 一节课 / 一个完整教学内容 |
| Phase | 教学阶段 (P1–P4) |
| script_step | 教学设计视角的步骤（v0.2） |
| **mission step** | 课堂视角一步 = **一个 component 的具体使用** = mission spec 一行 |
| lesson_step | mission step 的历史同义名 |
| Component | 教学组件（37 个） |
| colloquial / phased / stepped script | v0.1 / v0.2 / v0.3 表意短名 |
| **mission spec** | v0.5 结构化课表（原 lesson spec） |
| Decision Card | 节点抛出的待人决策项 |
| Pipeline Runner | Web 可视化跑流水线主界面 |
| Hard gate | 节点 Approve 前不可进入下一节点 |

### B. 参考文档

- `pipeline_design.md` — 整体设计
- `pipeline_nodes_detail.md` — 节点完整 spec
- `pipeline_nodes_table.md` — 节点对照表
- `master/mission_spec_schema.csv` — 13 字段 schema
- `master/mission_phase_step_meta_model.md` — 字段语义（mission step）
- `master/component_catalog.json`（v0729）
- `master/phase_component_eligibility_v0.2.md`
- `missions/mission_4/v0.5_mission_spec.xlsx` — 基线产物
- `visuals/mission-4-preview-compare/` — 3 件套预览

### C. 修改历史

| 版本 | 日期 | 作者 | 变更 |
|---|---|---|---|
| v1.0 | 2026-08-10 | Mavis | 初稿 |
| v1.1 | 2026-08-10 | Mavis | Pipeline Runner 主路径；硬门禁 HITL；Decision Card；I/O 表意命名；lesson spec → **mission spec**；1 component = 1 mission step |
| v1.1.1 | 2026-08-10 | Mavis | 技术栈定稿为 **Nuxt 3 / Vue 3 / Node.js(Fastify) / PostgreSQL(Prisma)**；工程落在 monorepo |
| v1.1.2 | 2026-08-11 | Mavis | M1b：N1–N3 节点引擎（LLM+heuristic）、eligibility 校验、Decision Card、Web 决策处理 |
