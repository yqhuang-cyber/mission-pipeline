# 课程内容制作 Pipeline 设计

> **版本**: v0.3 (Node 化 + Web Runner 对齐)
> **创建时间**: 2026-08-04
> **最后更新**: 2026-08-11
> **目标**: 把口语化课程 script 自动转化为可喂给产品的前端组件数据
> **配套**: `pipeline_nodes_detail.md` · `pipeline_nodes_table.md` · `docs/PRD.md`
> **配套主数据**:
> - `master/component_catalog.json`（v0729；E 列 = 组件使用规范（模版））
> - `master/phase_component_eligibility_v0.2.md`（v0.2.3，11 条 enforcement）
> - `master/mission_phase_step_meta_model.md`（v0.2，Display Text 模版规则）
> - `master/mission_spec_schema.csv`（18 字段 schema）

---

## 1. Pipeline 全景（6 节点 N0–N5）

> 工程与 PRD 统一用 **Node**（节点）。教学内容单位仍叫 **script_step** / **mission step**（≠ pipeline node）。

```
口语化 Script (v0.1)
    ↓
[N0] 准备：创建 mission + 上传 script + 绑主数据版本
    ↓
[N1] Phase 框架划分 + script_step 切片 + 建议 component
    ↓
Phased Script (v0.2)
    ↓
[N2] script_step → Component 映射（定稿）
    ↓
stepped script / step-component map (v0.3)
    （1 component = 1 mission step）
    ↓
[N3] Component Content 填充（18 字段 + Display Text 模版）
    ↓
Component Content (v0.4, P1–P4 共 4 文件)
    ↓
[N4] 结构化 + Excel / mission spec + Compare 预览
    ↓
Mission Spec (v0.5.xlsx)
    ↓
[N5] 喂入产品 → 课程预览走读
```

| 节点 | 转换 | 关键产物 | 表意短名 |
|---|---|---|---|
| **N0** | — | `v0.1_input.md`（锁定） | colloquial script |
| **N1** | v0.1 → v0.2 | `v0.2_script_phased.md` | phased script |
| **N2** | v0.2 → v0.3 | `v0.3_step_component_map.md` | stepped script |
| **N3** | v0.3 → v0.4 | `v0.4_component_content_p{1,2,3,4}.md` | component content |
| **N4** | v0.4 → v0.5 | `v0.5_mission_spec.xlsx` + compare HTML | mission spec |
| **N5** | v0.5 → 产品 | 预览 URL + 走读报告 | product preview |

**HITL**: 每个 Node 跑完进入 `awaiting_review`，CD **Approve** 后才解锁下一 Node（硬门禁）。Checkpoint 即 Approve 前必须人工确认的事项；节点可抛 Decision Card。

---

## 2. 各 Node 详细说明

### N0 · 准备（Pre-Mission）

**输入**: mission_name / topic / master_data_version / 口语化 script  
**操作**:
1. 创建 mission 记录
2. 保存 v0.1（不可就地改写原文）
3. 绑定主数据版本（如 v0809）
4. 初始化 N0–N5 节点状态（N0 = awaiting_review）

**输出**: mission_id + 锁定的 v0.1 colloquial script  

**Checkpoint**:
- script 长度与元信息是否够用（角色/分段/教学意图）
- 主数据版本是否正确

---

### N1 · Phase 框架（产出 v0.2）

**输入**: 口语化 script（`.md`）

**操作**:
1. 按已有编号/段落切片为 script_step
2. 判定每段所属 phase（P1/P2/P3/P4）
3. 给每个 script_step 写一句话教学目的
4. **保留原文**（不翻译、不改写、不删减）
5. 给每个 script_step **建议 component**（须落在 phase 允许列表；**不能连续三个及以上互动形式都为「观看」**）
6. 产出打样结构：`## 元信息` + `## Phase 框架总览` + `## 词汇清单` + `# Phase N` + `## script_step N.`

**输出**: `v0.2_script_phased.md` — 在原 script 上叠加 phase / purpose / 建议 component  
**Gold format**: `missions/mission_4/v0.2_script_phased.md`

**Checkpoint**（Approve 前）:
- review phase 切分是否合理
- review 每 script_step 教学目的是否准确
- review 边界 case（如 script_step 9 "Context Story" 归 **P2** 而非 P1）
- review 建议 component 是否合理、有无连续「观看」

**判定规则**（P1/P2 区分关键）:
- **P1**: Warm Up / Opening Story / **首次** Context Story / Mission Setup
- **P2**: Connect / Discovery / Practice / Pattern / Use Before Memory；**后续** Context Story（脚手架）
- **P3**: Mission Ready / Wo Hui 故事回放 / 真实任务执行
- **P4**: Today You Can / Wo Hui 收束 / Key Takeaways / 下集预告

**特殊 case**（v0.2.4）: script_step 9 "Context Story — IS SHE YOUR FRIEND?" → **P2**  
**空缺 script_step**: 保留空号；v0.5 再决策是否补 CMP-32 Goals 重显

---

### N2 · Component 映射定稿（产出 v0.3.1 → v0.3）

**输入**:
- v0.2_script_phased.md（含建议 component）
- `master/phase_component_eligibility_v0.2.md` / catalog

**操作（两段硬门禁）**:
1. **Run N2** → 产出 **v0.3.1** 教学活动分析：按 script_step 拆 activity + 候选 CMP；状态 `awaiting_activity_selection`
2. CD 微调活动描述、为每个 activity **选 1 个** component → **Confirm**
3. 系统生成 **v0.3** stepped script（1 activity → 1 component → 1 mission step）；状态 `awaiting_review`
4. CD 可用现有编辑器反复改 v0.3 → **Approve** 解锁 N3
5. N3 产出 v0.4 后，CD 可在 `awaiting_review` 下打开「编辑 v0.4」改 DisplayText + 文案字段并 **暂存**（不 Approve）→ 再 Approve 解锁 N4

**输出**:
- `v0.3.1_activity_analysis.md` (+ `.json`) — 过程文档
- `v0.3_step_component_map.md` — Confirm 后定稿

详见 `docs/superpowers/specs/2026-08-11-n2-v031-activity-analysis-design.md`。

**Content outline 切分规则（硬）**:
- 一个 `script_step` 可挂 **1–N** 个 component（N 建议 ≤ 5）；每个 component 各自有一行 Content outline
- 当 **N > 1** 时：必须把该步口语化正文 **按组件职责合理切分** 到各行 outline，**禁止**把整段 script 原样复制给每一个 component
- 切分原则：只写该 component 要承载的内容（如视频段 / 选择题干与选项 / 跟读目标句 / Mission 卡文案）
- **允许适量冗余**：衔接句、共用语境提示可在相邻 component 间少量重复，但主体内容不得雷同
- 例：Opening Story → CMP-03 outline = 视频故事段；CMP-33 outline =「听到几个国家？」+ A/B/C，而不是两行都贴整段 Video+Choices

**Checkpoint**:
- review V0.3.1 活动拆分与候选 CMP
- Confirm 后 review 每个 script_step 选用的 component
- review 一 step 挂多 component 是否合理
- **review 多挂时各行 Content outline 是否已按职责切分（非互相同文）**
- review enforcement 是否过严/过松

**硬约束**（必须 100% 通过）:
- component ∈ phase allowed
- P1 ⊇ CMP-04；P4 ⊇ CMP-21|CMP-26；P3 有 CMP-19 ⇒ 有 CMP-18
- 选择题：有要放大的焦点词/语素用 **CMP-13**（左侧【焦点】框）；直接理解题（无焦点词，如「老师在问什么」）用 **CMP-33**；CMP-02 不入 P1；CMP-15 仅 P2；CMP-22 仅 P4
- 1 script_step 选 1–N component，N 建议 ≤ 5
- **N>1 时 Content outline 必须按 component 切分（可少量冗余，不可整段同文）**

---

### N3 · Content 填充（产出 v0.4）

**输入**:
- v0.3_step_component_map.md
- 原 v0.1 script（可选，增强 Kai 语气）
- `mission_phase_step_meta_model.md`（v0.4.5）+ `mission_spec_schema.csv`（13 列）+ `component_catalog`（E/F/J/K/L/N/O）

**操作**:
1. 每个 Component = 1 Step = 1 行（13 字段）
2. Phase 写全称；Script Step 继承 v0.3；**Step = v0.3.1 activity 标题**（无则回退短标签）；Component = `CMP-XX · 简称`
3. **Display Text** 严格按 E 列模版：`【】` 缺料 → `[待补]`（禁 NA）；`[]` → 可 NA；模版=`无` → `NA`
4. **Display Image / Video Play** 从 catalog N/O 带出：`NA` 或不需要；需要则 `前端字段+TBC`（CD 后补 objectKey）
5. Kai Script 1（开场）+ Transition（收尾）；有互动（catalog K/L）才填 Script 2 / Feedback
   - **观/图/提示**（CMP-03/05/07/09）：Script2+Feedback 留空；Script1/Transition 从 Replay/Freeze/Visual/Kai 锚点提炼，禁止组件名入稿
   - **听音跟读 CMP-08**：从 `汉字 — 拼音 — gloss` 填 DT / Script1，不取 activity 标题
   - **句型 CMP-07**：左侧=Screen 例句，右侧=`[PERSON]+是+…` 公式
   - **发音 CMP-35**：汉字=Student 句；英文=Kai cue；禁止抄 F 示例「对不起…」
   - **角色扮演 CMP-15**：从 Emma/Student/On Screen 回合生成对话行
6. Knowledge point 从 content outline 提炼
7. 可选 `N3_USE_LLM=1` 用 LLM 润色；失败则启发式
8. **按 phase 拆 4 个文件** 写出

**输出**: `v0.4_component_content_p{1,2,3,4}.md`  
主键 `(Phase, Script Step, Step)`  

**Checkpoint**:
- Display Text 模版 / 【】非 NA
- Kai 时间线与互动字段
- Image/Video 可空；其余文案可审

---

### N4 · Spec 导出（产出 v0.5）

**输入**: v0.4 四个文件 + `mission_spec_schema.csv`（13 列）

**操作**:
1. 合并为 xlsx + **csv** + json（列 = schema 13 字段）
2. 兼容解析旧 18 字段产物中的别名列
3. Runner N4 页提供 **下载 CSV / 下载 XLSX**（`GET …/artifacts/N4/download?format=csv|xlsx`）

**输出**: `v0.5_mission_spec.xlsx` + `.csv` (+ json)

**Checkpoint**:
- 字段名对齐 schema
- DisplayText / [待补]
- Image/Video 允许空（CD 后补）
- 可在 UI 下载 csv/xlsx 核对

---

### N5 · 产品喂入

**输入**: v0.5_mission_spec.xlsx  

**操作**: 导入产品 → 渲染 → Web 预览 → 走读整课  

**Checkpoint**:
- 教学体验流畅；资产齐全；component 行为正确；Display Text 与 compare 一致  
- 问题可回写到 N2/N3

---

## 3. 命名规范

### 3.1 层级术语

| 概念 | 名称 | 视角 |
|---|---|---|
| **Mission** | 一门课 | 业务 |
| **Node (N0–N5)** | Pipeline 节点 | 工程/产品 Runner |
| **script_step** | 教学设计的 1 个步骤 | 教学设计（v0.2/v0.3） |
| **mission step** | 1 个 component 的具体使用（= 旧 lesson_step） | 课堂 / mission spec 一行 |
| **Content** | mission step 的 18 字段值 | 数据 |

### 3.2 文件命名

- 版本号 v0.1…v0.5 随 **Node** 推进
- `v0.X_script` / `v0.X_step_component_map` / `v0.X_component_content` / `v0.X_mission_spec`
- 运行时镜像：`missions/runtime/<missionId>/`

### 3.3 主键

`(Phase, script_step, Component 序号)` — 唯一标识一个 mission step

---

## 4. 目录结构

```
/workspace/
├── master/                 # 主数据
├── missions/
│   ├── mission_4/          # Gold baseline（打样）
│   └── runtime/<id>/       # Web Runner 实时产物（IDE 可看）
├── apps/web · apps/api     # Pipeline Runner
├── pipeline_design.md      # 本文档
├── pipeline_nodes_detail.md
└── docs/PRD.md
```

---

## 5. 关键 Checkpoint 清单（= 硬门禁 Approve 焦点）

| CP | 节点后 | 用户 review | 时长 |
|---|---|---|---|
| 0 | N0 | script/主数据版本 | 2 min |
| 1 | N1 | phase + 教学目的 + 建议 component + 边界 case | 5–10 min |
| 2 | N2 | 定稿 component 映射 + enforcement | 5–10 min |
| 3 | N3 | 文案、Display Text、待补素材 | 15–20 min |
| 4 | N4 | mission spec 字段 + 预览 | 5 min |
| 5 | N5 | 产品走读体验 | 30 min |

---

## 6. 设计原则

1. **每 Node 可独立 review / 回滚** — 硬门禁 HITL
2. **主数据分离** — catalog / eligibility / schema 不混进 mission
3. **人 review 多、AI 跑得少** — phase / component / Display Text 人拍板
4. **可解释** — Decision Card + reasoning
5. **模版驱动 Display Text** — v0809.3
6. **空值明确** — Display Text 用 `NA`；其他字段 `—` / 空 / `[待补]`
7. **打样优先** — Mission 4 产物为 gold format，生成物必须对齐结构

---

## 7. 已知风险与缓解

| 风险 | 缓解 |
|---|---|
| mapping 过严/过松 | allowed list + Decision + CP2 |
| Display Text 不按模版 | v0809.3 自动校验阻断 |
| Context Story 误标 P1 | N1 规则 + CP1 决策卡 |
| 连续观看组件 | N1/N2 检测 ≥3 连续观看 → Decision |
| LLM 不稳定 | 重试 + heuristic 降级 + 人工 Edit |
| 素材缺失 | N3 `[待补]` 清单 |

---

## 8. v0809.3 核心规则（固化）

### 8.1 Display Text 模版规则

1. 模版=`无` → `NA`（CMP-01/03/09/23）
2. 有字段有值 → 按模版填
3. 有字段无值 → 该字段 `NA`
4. 多 placeholder 未填全部 `NA`
5. 不用 `—` 当 Display Text 空值
6. 文本标点 `—`/`-` 保留

### 8.2 其他字段空值

| 字段 | 空值 |
|---|---|
| Display Text（模版无/缺值）| `NA` |
| 其他 17 字段源未出现 | `—` |
| Asset 无 | 留空 |
| Asset 占位 | `[待补: {说明}]` |

---

## 9. 实战数据：Mission 4（Baseline）

| 维度 | 数据 |
|---|---|
| script_step | 17（14 空缺）|
| mission step (lesson_step) | 45 |
| component | 22 / 37 |
| P1/P2/P3/P4 mission steps | 7 / 25 / 8 / 5 |

产物见 `missions/mission_4/`。

---

## 10. 工具 & 资源

- Runner: `apps/web` (Nuxt) + `apps/api` (Fastify/Prisma)
- LLM: MiniMax（OpenAI 兼容）· 失败降级 heuristic
- 导出: exceljs → `v0.5_mission_spec.xlsx`
- 镜像: `missions/runtime/<missionId>/`

---

## 11. 修订记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| v0.1 | 2026-08-04 | 初稿 | Mavis |
| v0.2 | 2026-08-10 | v0809.3 + Mission 4 实战 | Mavis |
| **v0.3** | **2026-08-11** | **Step→Node（N0–N5）**；对齐 Web Runner HITL/Checkpoint；明确 gold format；N1 含建议 component + 连续观看约束；mission step 术语 | Mavis |

---

## 12. 下一步

1. 各 Node 引擎输出严格对齐 Mission 4 gold
2. N4 compare HTML 自动化
3. N5 产品 webhook
4. 主数据 Admin UI
