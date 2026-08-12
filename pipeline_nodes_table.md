# Pipeline 节点对照表（v1.0 · 表格版）

> **配套**: `pipeline_design.md` (整体) + `pipeline_nodes_detail.md` (完整 spec)
> **本文件**: 节点级快速对照，纯表格，可直接当工程任务卡

---

## 0. 总览（6 节点）

| 节点 | ID | 名称 | 核心动作 | AI 参与 | 时长 | LLM token |
|---|---|---|---|---|---|---|
| **N0** | N0_pre_mission | 准备 | 创建 mission + 上传 v0.1 + 绑主数据版本 | 无 | 5 min | 0 |
| **N1** | N1_phase_framework | Phase 框架 (v0.1→v0.2) | 切片 + 标 phase + 写教学目的 | 高 | 10 min | 6K |
| **N2** | N2_component_mapping | Component 映射 (v0.2→v0.3) | 选 component + 标角色 + 写 outline | 高 | 10 min | 11K |
| **N3** | N3_content_filling | Content 填充 (v0.3→v0.4) | 18 字段填充 + Display Text 按模版 | 极高 | 45 min | 180K |
| **N4** | N4_spec_export | Spec 导出 (v0.4→v0.5) | 转换 + 校验 + 导出 xlsx | 无 | 5 min | 0 |
| **N5** | N5_product_ingest | 产品喂入 (v0.5→产品) | 导入 + 走读 + 验证 | 无 | 30 min | 0 |
| **合计** | | | | | **~2h** | **~200K** |

---

## 1. 节点详细对照

| 节点 | 输入 | 输出 | 关键校验 | 主数据读 | 主数据写 | 工具 |
|---|---|---|---|---|---|---|
| **N0** | mission_name, v0.1.md, master_data_version | mission_id, v0.1_input.md, status=draft | 文本 1-50K；元信息正则 | - | missions 表 | Web form / CLI |
| **N1** | v0.1_input.md | v0.2_script_phased.md, llm_trace | P1→P2→P3→P4 顺序；每 phase ≥1 step；script_step 编号连续；教学目的非空 | - | v0.2_script_phased.md | LLM (gpt-4o) + Markdown editor |
| **N2** | v0.2_script_phased.md | v0.3_step_component_map.md | 见 §3 enforcement 规则（11 条）| phase_component_eligibility_v0.2.md, component_catalog.json (v0729) | v0.3_step_component_map.md | LLM + Table editor + 自动校验 |
| **N3** | v0.3 + v0.1 + v0.2 | v0.4_component_content_p{1,2,3,4}.md | 见 §3 v0809.3 规则（6 条 Display Text 校验）| component_catalog.json (v0729), mission_phase_step_meta_model.md (v0.2) | v0.4_component_content_p{1,2,3,4}.md | LLM + Form editor |
| **N4** | **v0.4 component content（P1–P4 共 4 个文件）** | **v0.5 mission spec**（xlsx/json）+ preview_compare/index.html | 18 字段对齐 schema；主键唯一；Display Text 校验（复用 N3 规则）| mission_spec_schema.csv, mission_phase_step_meta_model.md, component_images/ | v0.5_mission_spec.xlsx, preview_compare/ | Python (openpyxl + PIL + base64 + playwright) |
| **N5** | v0.5.xlsx | 课程预览 URL, 走读报告 | 字段对齐产品；资产完整；component 行为正确；Display Text 与 compare HTML 一致 | - | (产品 DB) | 产品端 |

---

## 2. 节点间数据流

```
v0.1.md 5-10K            v0.2.md 5-10K           v0.3.md 5-10K              v0.4.md × 4 files 80K        v0.5.xlsx 18K + html 1.8MB
─────────────►  N1  ─────────────►  N2  ─────────────►  N3 (LLM × 45)  ─────────────►  N4 (Python)  ─────────────►  N5 (产品)
              LLM 6K tokens        LLM 11K tokens     LLM 180K tokens             0 tokens                  0 tokens
              10 min               10 min              45 min                       5 min                     30 min
```

---

## 3. 校验规则全集

### 3.1 Component 映射（N2 · v0.2.3 enforcement · 11 条）

| # | 规则 | 级别 | 校验方法 |
|---|---|---|---|
| 1 | script_step 落在 P1-P4 之一 | error | regex `^## Phase [1-4]` |
| 2 | Component 在 phase 允许列表 | error | 查 phase_component_eligibility |
| 3 | P1 至少包含 CMP-04 | error | 检查 P1 phase 包含 CMP-04 |
| 4 | P4 至少包含 CMP-21 或 CMP-26 | error | 检查 P4 phase |
| 5 | P3 用 CMP-19 必配 CMP-18 | error | 检查 P3 phase 同时包含 |
| 6 | CMP-13 P1 仅「含义推断」 | error | 检查 P1 CMP-13 用途 |
| 7 | CMP-02 不入 P1 | error | 检查 P1 phase |
| 8 | CMP-15 仅 P2 | error | 检查 P2/其他 |
| 9 | CMP-22 仅 P4 | error | 检查 P4/其他 |
| 10 | 1 script_step 选 1-5 component | warning | 检查每行 component 数 |
| 11 | CMP-03 每次独立 objectKey | warning | 检查 objectKey 不重复 |

### 3.2 Display Text（N3 · v0809.3 · 6 条）

| # | 规则 | 级别 | 校验方法 |
|---|---|---|---|
| 1 | 模版=`无`（CMP-01/03/09/23）→ `NA` | error | 查模版 = `无` |
| 2 | 模版有字段无值 → `NA` | error | 解析模版必填，对比 Display Text |
| 3 | 不用 `—` 当空值 | error | 整段不含 `\u2014` 当占位符 |
| 4 | 文本中保留 `—` / `-` 标点 | ok | 不视作违规 |
| 5 | Display Text 必填 | error | 不能为空 |
| 6 | Display Text 多行对齐模版 | error | 每行匹配 `【】` 或 `[]` 开头 |

### 3.3 Spec 导出（N4 · 7 条）

| # | 规则 | 级别 |
|---|---|---|
| 1 | 18 字段对齐 schema 列名 | error |
| 2 | 13 必填字段都填 | error |
| 3 | 主键 `(Phase, script_step, Component)` 唯一 | error |
| 4 | Display Text 校验（复用 3.2）| error |
| 5 | Knowledge Point ≥ 1 子字段 | error |
| 6 | Asset objectKey 格式 `Mission\d+/.+` | warning |
| 7 | 列宽合理 + 表头冻结 | info |

### 3.4 其他字段空值约定

| 字段 | 空值 |
|---|---|
| Display Text（模版=`无`）| `NA` |
| Display Text（有字段无值）| 该字段值 = `NA` |
| Display Text（文本标点）| 保留 `—` / `-` |
| 其他 17 字段（源未出现）| `—` |
| Asset 字段（无该 asset）| 留空 |
| Asset 占位 | `[待补: {说明}]` |

---

## 4. 错误处理

| 节点 | 错误类型 | 处理 |
|---|---|---|
| N0 | 文件 > 50K | 报错，提示分段 |
| N0 | 主数据版本不存在 | 报错，列可用版本 |
| N1 | LLM 输出格式错 | 重试 2 次 → fallback 按 `###` 切片 |
| N1 | Phase 标错 | 提示人工调整 |
| N1 | 原文改写 | 报错保留 v0.1 |
| N2 | Component 不在允许列表 | 替换为最相似 + 标 "auto-replaced" |
| N2 | 强制规则未满足 | 报错，阻断，必须人工补 |
| N3 | Display Text 不按模版 | 阻断，列具体违规字段 |
| N3 | 18 字段缺失 | 阻断，必须全填 |
| N3 | LLM 输出格式错 | 重试 2 次 + 标记需人工 |
| N4 | markdown 解析失败 | 报错具体位置，回退人工 |
| N4 | 主键冲突 | 自动加 `_1, _2, _3` 后缀 |
| N5 | 字段缺失 | 阻断，列缺失 |
| N5 | 资产未上传 | 阻断，列缺失资产 |
| N5 | 走读体验差 | 反馈到 v0.3 重选 component |

---

## 5. 主数据依赖

| 节点 | 读取主数据 | 用途 |
|---|---|---|
| N0 | (仅元信息) | version 校验 |
| N1 | (无) | - |
| N2 | `phase_component_eligibility_v0.2.md`, `component_catalog.json` (v0809) | 允许矩阵 + 教学目的 |
| N3 | `component_catalog.json` (v0809), `mission_phase_step_meta_model.md` (v0.2) | 模版 + 字段定义 |
| N4 | `mission_spec_schema.csv`, `mission_phase_step_meta_model.md` (v0.2), `component_images/` | 列定义 + 字段语义 + UI 原图 |
| N5 | (产品 schema) | - |

---

## 6. 技术栈

| 层 | 选型 | 用途 |
|---|---|---|
| Backend | Python (FastAPI) | 业务逻辑 + LLM 调用 |
| Frontend | Next.js + TypeScript | UI / review |
| DB | PostgreSQL | missions + versions + master data |
| LLM | OpenAI gpt-4o (默认) / Anthropic / 国产 | N1/N2/N3 |
| LLM SDK | litellm | 多 provider 抽象 |
| Validator | JSON Schema + 自定义 rule engine | §3 规则集 |
| Markdown | mistune 或 markdown-it-py | N4 解析 |
| xlsx | openpyxl | N4 写 |
| Image | PIL + base64 | N4 缩图 + 嵌入 |
| Browser | playwright (可选) | N4 截图 |
| Storage | S3 / OSS | v0.1 上传, v0.4 输出 |
| Background | Celery / Arq | N1/N2/N3 异步任务 |

---

## 7. CLI 命令规范

```bash
# 初始化
course-pipeline init mission --name="..." --script=script.md [--data-version=v0809]
course-pipeline init mission --from-existing=mission-4  # 复制

# 5 步流程
course-pipeline v0.2 generate --mission=X    # 调 LLM
course-pipeline v0.2 edit --mission=X        # 打开编辑器
course-pipeline v0.2 validate --mission=X    # 校验
course-pipeline v0.2 submit --mission=X      # 推进

course-pipeline v0.3 generate --mission=X
course-pipeline v0.3 edit --mission=X
course-pipeline v0.3 validate --mission=X
course-pipeline v0.3 submit --mission=X

course-pipeline v0.4 generate --mission=X --phase=1
course-pipeline v0.4 edit --mission=X --lesson-step=1.2
course-pipeline v0.4 validate --mission=X    # v0809.3 校验
course-pipeline v0.4 submit --mission=X

course-pipeline v0.5 export --mission=X --format=xlsx
course-pipeline v0.5 preview --mission=X --format=html  # 3 件套
course-pipeline v0.5 export --mission=X --format=json

# 产品端
course-pipeline push --mission=X  # 推送到产品

# 主数据
course-pipeline components list
course-pipeline components show CMP-13
course-pipeline components edit CMP-13
course-pipeline eligibility show --phase=P1
course-pipeline data list-versions

# 校验
course-pipeline validate --mission=X --stage=v0.4 --level=strict
```

---

## 8. Mission 4 实战 benchmark

| 维度 | 数据 |
|---|---|
| script_step 数 | 17 (14, 15 缺失) |
| lesson_step 数 | **45** |
| 使用的 component | **22 / 37** |
| Phase 分布 | P1: 7 / P2: 25 / P3: 8 / P4: 5 |
| LLM token 总消耗 | ~200K |
| 人工时长（CD 主操作 + TD 2 次 review）| ~2h |
| 产出文件 | 4 × v0.4.md + 1 × v0.5.xlsx + 1 × compare.html |

**22 个用到 component**: CMP-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 15, 18, 19, 21, 22, 24, 28, 29, 36
**未用到**: CMP-14, 16, 17, 20, 23, 25, 26, 27, 30, 31, 32, 33, 34, 35, 37

---

## 9. 决策记录（v0.2 固化）

| 决策点 | 结论 | 来源 |
|---|---|---|
| CMP-02 不入 P1 | P1 含义推断走 CMP-13 | Mission 4 v0.3 |
| CMP-13 P1 用途 | 仅「含义推断」型选择题 | Mission 4 v0.3 |
| CMP-15 仅 P2 | P3 自由对话改用 CMP-19 | Mission 4 v0.3 |
| CMP-22 仅 P4 | 下集预告只在 P4 | Mission 4 v0.3 |
| CMP-28 集中 P3 末 / P4 自评 | 不挂其他 step | Mission 4 v0.3 |
| CMP-19 1 vs 4 lesson_step | 4 个（Emma/Tom/Jayden/Anna 各自独立）| Mission 4 v0.3 |
| Board 拖拽归 CMP-19 内部 | 不另挂 component | Mission 4 v0.3 |
| CMP-03 独立 objectKey | 即使同源剧情，objectKey 必须不同 | Mission 4 v0.3 |
| v0.4 拆 4 文件 | 按 phase 拆，便于 review | v0.2 design |
| Display Text 用 `NA` 不是 `—` | v0809.2 修正 | v0.2 design |
| 文本中 `—` `-` 保留 | v0809.3 修正 | v0.2 design |

---

## 10. 交付里程碑

| 阶段 | 内容 | 时长 |
|---|---|---|
| M1 | CLI 工具 + 5 步流程 + xlsx 导出 + 单元测试 | 2 周 |
| M2 | Web UI + Mission Dashboard + Review/Comment + 预览 | 3 周 |
| M3 | 多 LLM + 主数据 admin UI + 协作 + 数据分析 | 2 周 |

**总估时**: 7 周（一个工程师 + 一个前端 + 一个 PM 协作）

---

## 11. 文件清单

| 文件 | 用途 |
|---|---|
| `pipeline_design.md` (v0.2) | 整体设计 · 5 步全景 · 9 节 |
| `pipeline_nodes_detail.md` (v1.0) | 节点级完整 spec · 32KB |
| **`pipeline_nodes_table.md` (v1.0)** | **本文件 · 表格版 · 工程任务卡** |
| `master/component_catalog.json` (v0809) | 37 components + 模版 |
| `master/phase_component_eligibility_v0.2.md` | Phase × Component 矩阵 + 11 条 enforcement |
| `master/mission_phase_step_meta_model.md` (v0.2) | 18 字段 + v0809.3 规则 |
| `master/mission_spec_schema.csv` | xlsx 列定义 |
| `missions/mission_4/v0.{2,3,4,5}_*` | Mission 4 实战 benchmark |
| `visuals/mission-4-preview-compare/` | 3 件套预览 |
