# 课程制作 Pipeline · 节点级详细规范

> **版本**: v1.0
> **创建时间**: 2026-08-10
> **配套**: `pipeline_design.md` (v0.2) — 整体设计
> **目的**: 把 5 步流水线拆到「节点」粒度，每节点都有明确的输入/输出/校验/工具，可直接指导工程实现

---

## 0. 节点总览

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  N0 输入  │ ──→│  N1 v0.2  │ ──→│  N2 v0.3  │ ──→│  N3 v0.4  │ ──→│  N4 v0.5  │ ──→│  N5 产品  │
│  准备    │    │ Phase    │    │ Comp     │    │ Content  │    │ Spec     │    │ 喂入     │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
   上传           切片+标        选择+映射       填字段          转换+导出       渲染
```

| 节点 | 名称 | 核心动作 | 主要工具 | 时长预估 |
|---|---|---|---|---|
| **N0** | 准备 | 上传 script + 选择主数据版本 | Web UI / CLI | 5 min |
| **N1** | Phase 框架 (v0.1→v0.2) | 切片 + 标 phase + 写教学目的 | LLM + 人工 | 10-15 min |
| **N2** | Component 映射 (v0.2→v0.3) | 选 component + 标角色 + 写 outline | LLM + 主数据校验 | 10-15 min |
| **N3** | Content 填充 (v0.3→v0.4) | 18 字段填充 + Display Text 按模版 | LLM + v0809.3 校验 | 30-45 min |
| **N4** | Spec 导出 (v0.4→v0.5) | 转换 + 校验 + 导出 xlsx | Python 脚本 | 5 min |
| **N5** | 产品喂入 (v0.5→产品) | 上传产品 + 渲染测试 | 产品端 | 30 min |

**总时长**: 约 1.5-2 小时（CD 主操作 + TD 2 次 review）

---

## N0 · 准备（Pre-Mission Setup）

### 0.1 节点定义

| 项 | 内容 |
|---|---|
| **节点 ID** | N0_pre_mission |
| **目的** | 创建 mission，绑定主数据版本，上传 v0.1 script |
| **负责人** | PM 创建 / CD 上传 |
| **可逆性** | 完全可逆（删除 mission 即可重做） |

### 0.2 输入

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| mission_name | string | ✅ | 1-100 字符 |
| mission_topic | string | ✅ | 1-200 字符 |
| v0.1_script | text/markdown | ✅ | 1-50K 字符，含教学目的/角色/分段 |
| master_data_version | string | ✅ | 必须是已发布版本（如 v0809） |
| owner | user | ✅ | 必须是 CD 或 PM |

### 0.3 输出

| 字段 | 类型 | 说明 |
|---|---|---|
| mission_id | uuid | 系统生成 |
| v0.1_input_md | file | 原文保存，不可修改 |
| mission_status | enum | `draft` (默认) |
| current_stage | enum | `v0.1` |

### 0.4 输出质量检查

| 检查项 | 级别 | 检查方法 |
|---|---|---|
| v0.1 文本长度 | error | 1 < len < 50,000 字符 |
| 必含元信息 | warning | 正则匹配：`角色:` + 至少 1 个 phase 关键词 |
| 至少 1 个 script_step 暗示 | warning | 包含对话或场景描述 |
| 主数据版本存在 | error | 查 master_data 表 |

### 0.5 使用的文件

| 类别 | 文件 | 用途 |
|---|---|---|
| 写 | `missions/{mission_id}/v0.1_input.md` | 保存原文 |
| 读 | `master/component_catalog.json` | 主数据版本元信息 |
| 读 | `master/phase_component_eligibility_v0.2.md` | 主数据版本元信息 |
| 读 | `master/mission_phase_step_meta_model.md` | 主数据版本元信息 |

### 0.6 技术 & 工具

- **Web UI**: 表单（mission_name, mission_topic, master_data_version, file upload）
- **CLI**: `course-pipeline init mission --name=... --script=...`
- **Storage**: Object storage (S3/OSS) 存 .md 文件，DB 存元信息
- **DB**: `missions` 表

### 0.7 错误处理

| 错误 | 处理 |
|---|---|
| script 超过 50K | 报错，让用户分段或简化 |
| 主数据版本不存在 | 报错，列出可用版本 |
| 文件上传失败 | 重试 3 次，转人工 |

---

## N1 · Phase 框架 (v0.1 → v0.2)

### 1.1 节点定义

| 项 | 内容 |
|---|---|
| **节点 ID** | N1_phase_framework |
| **目的** | 把口语化 script 切分为 script_step，标 phase，写教学目的 |
| **负责人** | CD |
| **可逆性** | 可回退到 N0 |
| **AI 参与度** | 高（LLM 切片 + 标 phase） |

### 1.2 输入

| 字段 | 类型 | 来源 |
|---|---|---|
| mission_id | uuid | N0 |
| v0.1_input_md | file | N0 产出 |
| phase_keywords | object | 内置（hardcoded in prompt） |
| teaching_purpose_template | string | 内置 |

### 1.3 输出

| 字段 | 类型 | 说明 |
|---|---|---|
| v0.2_script_phased.md | file | 结构化 phased script |
| llm_trace | object | LLM 输入/输出/耗时/token 消耗 |

**v0.2 文件结构**:
```markdown
# Mission X — Phased Script

## 元信息
- 教学对象 / 核心词汇 / 核心句型 / 角色

## Phase 1 — Mission Intro
### script_step 1. NAME
> 教学目的: [一句话]
> [原文保留]

### script_step 2. NAME
...

## Phase 2 — Knowledge Discovery
### script_step 4. NAME
...
```

### 1.4 输出质量检查

| 检查项 | 级别 | 检查方法 |
|---|---|---|
| Phase 顺序 | error | 必须是 P1 → P2 → P3 → P4 |
| 每 Phase ≥ 1 script_step | error | regex `^## Phase` 计数 ≥ 1 |
| script_step 编号连续 | error | 检查 1, 2, 3, ... 中间允许缺失但需保留空号注释 |
| 教学目的不为空 | error | 每 `### script_step` 后必须有 `> 教学目的: ` |
| Phase 标签正确 | error | 必须是 P1/P2/P3/P4 之一 |
| 原文保留 | warning | 提取 v0.1 关键对话，验证 v0.2 含 ≥ 80% |
| 时长预估合理 | info | script_step 数 × 平均 1.5 min |

**Mission 4 实测**:
- 17 script_step（14, 15 缺失保留空号）
- 4 phase（P1: 3 step, P2: 10 step, P3: 3 step, P4: 1 step）
- 通过所有检查

### 1.5 使用的文件

| 类别 | 文件 | 用途 |
|---|---|---|
| 读 | `missions/{mission_id}/v0.1_input.md` | 输入原文 |
| 写 | `missions/{mission_id}/v0.2_script_phased.md` | 输出 |

### 1.6 技术 & 工具

- **LLM Provider**: 默认 OpenAI gpt-4o, 可选 Anthropic/国产
- **Prompt**: 详见 §1.8
- **Parser**: Markdown regex parser
- **Validator**: §1.4 规则集
- **CLI**: `course-pipeline v0.2 generate --mission=X`
- **人工 review UI**: 左 markdown / 右结构化预览

### 1.7 错误处理

| 错误 | 处理 |
|---|---|
| LLM 输出格式错 | 重试 2 次 → fallback 规则切片（按 `###` 标题） |
| Phase 标错 | 提示用户手动调整 |
| 教学目的为空 | 标记为 `TBD`，要求人工补 |
| 原文大幅改写 | 报错，保留 v0.1 原文 |
| script_step 数 < 3 | 警告 mission 太小，询问是否合并 |

### 1.8 LLM Prompt 骨架

```markdown
你是一个中文教学课程设计专家。

# Mission 元信息
- 名称: {mission_name}
- 主题: {mission_topic}
- 教学对象: 中文初学者

# 当前输入 (v0.1 原文)
{v0.1_input_md}

# Task
将上述 v0.1 script 切分为 script_step：
1. 识别自然段落（按场景/对话/教学动作切分）
2. 为每段标注 phase (P1-P4):
   - P1: Warm Up / Opening Story / 首次 Context Story / Mission Setup
   - P2: Connect / Discovery / Practice / Pattern / Use Before Memory
   - P3: Mission Ready / Wo Hui 故事回放 / 真实任务执行
   - P4: Today You Can / Wo Hui 收束 / Key Takeaways / 下集预告
3. 为每段写 1 句话教学目的（中文）
4. 保留原文（不翻译、不改写、不删减）

# Output Format
## Phase X — [Phase Name]
### script_step N. [Step Name]
> 教学目的: [一句话]
> [原文]

# Constraints
- script_step 编号从 1 开始连续
- Phase 顺序: P1 → P2 → P3 → P4
- 缺失的 script_step 保留空号注释
- 边界 case 规则: P1 首次 Context Story 可放 P1，后续 Context Story 放 P2

# Example Output
## Phase 1 — Mission Intro
### script_step 1. MISSION ENTRY
> 教学目的: 建立关系、激活注意、明确任务
> Welcome back. Last mission, you learnt how to find the right person...
```

### 1.9 Token 成本估算

| 输入 | Token |
|---|---|
| System prompt | ~800 |
| v0.1 script（5-10K 字符）| ~2,500 |
| 输出（v0.2）| ~3,000 |
| **总计** | **~6,300 tokens / mission** |

---

## N2 · Component 映射 (v0.2 → v0.3)

### 2.1 节点定义

| 项 | 内容 |
|---|---|
| **节点 ID** | N2_component_mapping |
| **目的** | 为每个 script_step 选 1-N 个 component，标角色，写 content outline |
| **负责人** | CD + TD review |
| **可逆性** | 可回退到 N1 |
| **AI 参与度** | 高（LLM 选 component + 标角色） |

### 2.2 输入

| 字段 | 类型 | 来源 |
|---|---|---|
| mission_id | uuid | N0 |
| v0.2_script_phased.md | file | N1 产出 |
| phase_component_eligibility | matrix | 主数据 v0.2.3 |
| component_catalog | object | 主数据 v0809 |
| component_scaffolding_notes | text | 经验库（如 CMP-15 仅 P2） |

### 2.3 输出

| 字段 | 类型 | 说明 |
|---|---|---|
| v0.3_step_component_map.md | file | script_step → component 映射表 |
| llm_trace | object | LLM 调用记录 |

**v0.3 文件结构**:
```markdown
# Mission X — script_step → Component 映射

## 总览
| Phase | script_step | lesson_step 数 | Component(s) | 关键决策点 |

## Phase 1 — Mission Intro
### script_step 1. MISSION ENTRY
| Component | 角色 | 关键字段 | Content outline |
| CMP-01 课前寒暄 | primary | backgroundVideo, topicTitle | Kai 数字人开场 |
| CMP-04 Mission 发布 | primary | missionTitle, goals[], startButtonLabel | YOUR MISSION + 5 goals |

### script_step 2. OPENING STORY
| Component | 角色 | 关键字段 | Content outline |
| CMP-03 视频播放 | primary | video.objectKey | 完整开场故事 |
| CMP-13 单项选择 | secondary | question, options[], answer | "几个国家？" |
```

### 2.4 输出质量检查

| 检查项 | 级别 | 检查方法 |
|---|---|---|
| Component 在 phase 允许列表 | **error** | 查 phase_component_eligibility |
| P1 包含 CMP-04 | **error** | 检查 P1 phase 是否有 CMP-04 |
| P4 包含 CMP-21 或 CMP-26 | **error** | 检查 P4 phase |
| P3 用 CMP-19 必配 CMP-18 | **error** | 检查 P3 phase 同时包含 |
| CMP-13 在 P1 仅「含义推断」 | **error** | 检查 P1 CMP-13 用途 |
| CMP-02 不入 P1 | **error** | 检查 P1 phase |
| CMP-15 仅 P2 | **error** | 检查 P2/其他 |
| CMP-22 仅 P4 | **error** | 检查 P4/其他 |
| 1 script_step 选 1-5 component | warning | 检查每行 component 数 |
| 同 phase component 分散 | info | 高频 component（>3 次）警告集中度 |
| CMP-03 独立 objectKey | warning | 即使同源剧情，objectKey 必须不同 |
| Board 拖拽归 CMP-19 | **error** | P3 CMP-19 必须在 Interactive Flow 描述 board 拖拽 |

**v0.3 Enforcement 规则全集** (v0.2.3 主数据):
1. 每个 script_step 落在 P1-P4 之一
2. 选用的 component 在 phase 允许列表内
3. P1 至少包含 CMP-04
4. P4 至少包含 CMP-21 或 CMP-26
5. P3 用 CMP-19 必配 CMP-18
6. (跳过 - 关于 God 模式)
7. P3 末尾 CMP-28 只能放最后 1 个 script_step
8. (跳过)
9. CMP-03 每次独立素材
10. P1 内 CMP-13 仅限含义推断
11. P1 内不允许 CMP-02

### 2.5 使用的文件

| 类别 | 文件 | 用途 |
|---|---|---|
| 读 | `missions/{mission_id}/v0.2_script_phased.md` | 输入 |
| 读 | `master/phase_component_eligibility_v0.2.md` | 允许矩阵 |
| 读 | `master/component_catalog.json` (v0809) | component 详情 + E 列模版 |
| 写 | `missions/{mission_id}/v0.3_step_component_map.md` | 输出 |

### 2.6 技术 & 工具

- **LLM Prompt**: 详见 §2.8
- **Validator**: 自动查 phase × component 矩阵
- **CLI**: `course-pipeline v0.3 generate --mission=X`
- **人工 review UI**: 表格编辑器，可改 component 选 + 角色

### 2.7 错误处理

| 错误 | 处理 |
|---|---|
| LLM 选出的 component 不在允许列表 | 替换为允许列表中的最相似 component，标记 "auto-replaced" |
| 强制规则未满足（如 P1 缺 CMP-04）| 报错，必须人工添加 |
| 同一 script_step 选 > 10 component | 警告，让人工精简 |
| component 数 = 0 | 报错，必须至少 1 个 |

### 2.8 LLM Prompt 骨架

```markdown
你是一个中文教学课程设计专家。

# Mission 元信息
- {mission_name} / {mission_topic}

# Phase 允许矩阵
{P1: [CMP-01, CMP-04, CMP-03, ...], P2: [...], P3: [...], P4: [...]}

# 强制规则
- P1 至少包含 CMP-04
- P4 至少包含 CMP-21 或 CMP-26
- P3 用 CMP-19 必配 CMP-18
- CMP-13 P1 仅「含义推断」
- CMP-02 不入 P1
- CMP-15 仅 P2
- CMP-22 仅 P4

# Component 详情
[for each component in catalog, 给出 name + 教学目的 + 互动方式]

# 当前输入 (v0.2)
{v0.2_script_phased.md}

# Task
为每个 script_step 选 1-N 个 component:
1. 必选 (必含强制规则要求的)
2. 推荐 (根据教学目的选)
3. 标角色: primary (核心) / secondary (辅助)
4. 写 content outline (1-2 句话描述本 step 该 component 装什么内容)

# Output Format
| Component | 角色 | 关键字段 | Content outline |
| CMP-XX name | primary/secondary | field1, field2 | description |
```

### 2.9 Token 成本估算

| 输入 | Token |
|---|---|
| System + 强制规则 | ~1,500 |
| 37 components 详情 | ~3,000 |
| v0.2（5-10K 字符）| ~2,500 |
| 输出（v0.3 表）| ~4,000 |
| **总计** | **~11,000 tokens / mission** |

---

## N3 · Content 填充 (v0.3 → v0.4)

### 3.1 节点定义

| 项 | 内容 |
|---|---|
| **节点 ID** | N3_content_filling |
| **目的** | 为每个 component lesson_step 填 18 字段，Display Text 严格按 component 模版 |
| **负责人** | CD |
| **可逆性** | 可回退到 N2 |
| **AI 参与度** | 极高（LLM 主操作，人工 review 为主） |

### 3.2 输入

| 字段 | 类型 | 来源 |
|---|---|---|
| mission_id | uuid | N0 |
| v0.3_step_component_map.md | file | N2 产出 |
| v0.1_input.md | file | N0（原文）|
| v0.2_script_phased.md | file | N1（教学目的参考）|
| component_templates | object | 主数据 v0809 E 列 |
| mission_phase_step_meta_model | object | 主数据 v0.2 |
| phase_knowledge_context | object | 主数据（可选，v0.2 知识点库）|

### 3.3 输出

| 字段 | 类型 | 说明 |
|---|---|---|
| v0.4_component_content_p1.md | file | P1 lesson_step × 18 字段 |
| v0.4_component_content_p2.md | file | P2 |
| v0.4_component_content_p3.md | file | P3 |
| v0.4_component_content_p4.md | file | P4 |
| llm_trace | object | LLM 调用记录（含每 lesson_step 的 trace）|

**v0.4 文件结构** (per lesson_step):
```markdown
## lesson_step 1.2: CMP-04 Mission 发布

### Component 模版（来自 component_catalog.json v0809）
```
【任务标题】{标题}
[开始按钮] {按钮文案}
```

### Display Text
```
【任务标题】Meeting Friends from Around the World
[开始按钮] START MISSION
```

### 其他 17 字段
| 字段 | 值 |
| Phase | P1 |
| script_step | 1 |
| Screen Display Category | mission-card |
| ... |

### 修订
- v0.4.3: 应用 v0809.3 规则
```

### 3.4 输出质量检查

| 检查项 | 级别 | 检查方法 |
|---|---|---|
| Display Text 必填 | **error** | 不能为空 / undefined |
| 模版=`无` → `NA` | **error** | 查模版 = `无` 的 component，Display Text 必须 = `NA` |
| 模版有字段无值 → `NA` | **error** | 解析模版 fields，对比 Display Text 行 |
| 不用 `—` 当空值 | **error** | Display Text 整段不含 `\u2014` 当作占位符 |
| 文本中保留 `—` / `-` 标点 | **info** | OK |
| 主键唯一 | **error** | `(Phase, script_step, Component)` 唯一 |
| 18 字段全填 | **error** | schema 校验 |
| 源未出现字段 → `—` | warning | 其他字段用 `—` 不用 NA |
| Asset objectKey 格式 | warning | 匹配 `Mission\d+/.+` |
| Asset 占位 | info | `[待补: ...]` 显式标注 |
| Display Text 多行对齐模版 | error | 每行匹配模版结构（`【】` 或 `[]` 开头）|
| Kai Script 1/2 trigger 必填 | error | 不能为空 |
| Feedback Correct/Wrong 必填 | error | 不能为空 |
| Knowledge Point 至少 1 子字段 | error | word/grammar/phrase/pattern/socialExpression 至少 1 个 |

**v0809.3 规则详解**:
```python
# 校验算法
def validate_display_text(step, component_template):
    if component_template == '无':
        assert step.display_text == 'NA', f'{step.id}: 模版=无 但 Display Text != NA'
        return
    template_lines = parse_template(component_template)
    actual_lines = step.display_text.split('\n')
    
    for tline in template_lines:
        matched = False
        for aline in actual_lines:
            if aline.startswith(tline['key']):  # 【题干】/【A】/etc
                value = aline[len(tline['key'])+1:].strip()
                if not value or value == '—':
                    assert False, f'{step.id}: 模版字段 {tline["key"]} 为空但没填 NA'
                if not value or value == 'N/A':
                    assert False, f'{step.id}: 模版字段 {tline["key"]} 填了 N/A 应该用 NA'
                matched = True
                break
        # 没匹配到 - 允许 (如果该 lesson_step 不用这个字段)
```

### 3.5 使用的文件

| 类别 | 文件 | 用途 |
|---|---|---|
| 读 | `missions/{mission_id}/v0.3_step_component_map.md` | 选定的 component |
| 读 | `missions/{mission_id}/v0.1_input.md` | 原文 |
| 读 | `missions/{mission_id}/v0.2_script_phased.md` | 教学目的 |
| 读 | `master/component_catalog.json` (v0809) | 模版 + 教学目的 |
| 读 | `master/mission_phase_step_meta_model.md` (v0.2) | 18 字段定义 + 填表规则 |
| 写 | `missions/{mission_id}/v0.4_component_content_p{1,2,3,4}.md` | 输出（4 文件） |

### 3.6 技术 & 工具

- **LLM Prompt**: 详见 §3.8
- **Validator**: v0809.3 规则 + 18 字段 schema 校验
- **CLI**: `course-pipeline v0.4 generate --mission=X --phase=1`
- **人工 review UI**: 表单编辑器（每 lesson_step 一张卡，含 Display Text 多行编辑器）

### 3.7 错误处理

| 错误 | 处理 |
|---|---|
| Display Text 不按模版 | 阻断，列出具体缺失/错误字段 |
| 18 字段有缺失 | 阻断，必须全填 |
| Knowledge Point 子字段缺失 | 阻断，必须至少 1 个 |
| LLM 输出格式错 | 重试 2 次，标记需要人工编辑 |
| 同一 (Phase, script_step, Component) 出现 2 次 | 阻断，必须修改 Component 后缀 |

### 3.8 LLM Prompt 骨架

```markdown
你是一个中文教学课程内容设计专家。

# Mission 元信息
- {mission_name} / {mission_topic}

# Component 模版（v0809）
{for each component in this script_step:
  - {component_id}: {template}
  - Example: {example}
  - Purpose: {use_case}
}

# 18 字段 Schema
{for each field:
  - {field_name}: {type} {required/optional} {description}
}

# v0809.3 Display Text 规则
- 模版=`无` → Display Text = `NA`
- 模版有字段无值 → 该字段值 = `NA`
- 不用 `—` 当空值
- 文本中保留 `—` / `-` 作标点

# 当前输入
v0.3 选择: {component selections with content outlines}
v0.1 原文: {script}

# Task
为每个 lesson_step 填 18 字段:
1. Display Text 按模版结构填
2. Kai Script 1/2 用 v0.1 原文
3. Knowledge Point 从 v0.2 教学目的提取
4. Interactive Flow 按 component 教学动作描述
5. 其他字段从 v0.1/v0.2 抽取或合理生成

# Output Format (per lesson_step)
## lesson_step {id}: {component_name}

### Component 模版
{template}

### Display Text
{filled_template}

### 其他 17 字段
| 字段 | 值 |
...
```

### 3.9 Token 成本估算

| 输入 | Token |
|---|---|
| System + 规则 | ~2,000 |
| 1 个 component 模版 + 详情 | ~500 |
| v0.1 原文（per step 切分）| ~500 |
| v0.2 教学目的 | ~200 |
| 输出（1 个 lesson_step）| ~800 |
| **总计 per step** | **~4,000 tokens** |
| **总计 per mission (45 steps)** | **~180,000 tokens** |

**Mission 4 实测**: ~180K tokens (主成本)

---

## N4 · Spec 导出 (v0.4 → v0.5)

### 4.1 节点定义

| 项 | 内容 |
|---|---|
| **节点 ID** | N4_spec_export |
| **目的** | 把 v0.4 markdown 转成结构化 xlsx + compare HTML |
| **负责人** | CD (一键) |
| **可逆性** | 完全可逆（v0.4 文件不动）|
| **AI 参与度** | 无（纯转换）|

### 4.2 输入

| 字段 | 类型 | 来源 |
|---|---|---|
| mission_id | uuid | N0 |
| v0.4_component_content_p{1,2,3,4}.md | 4 files | N3 产出 |
| mission_spec_schema.csv | file | 主数据 v1 |
| mission_phase_step_meta_model.md | file | 主数据 v0.2 |

### 4.3 输出

| 字段 | 类型 | 说明 |
|---|---|---|
| v0.5_mission_spec.xlsx | file | 45 行 × 18 列 |
| v0.5_mission_spec.json | file | 备份（结构化）|
| preview_compare_html | file | 3 件套对比预览（单文件自包含）|
| preview_png/*.png | files | 代表性 step 截图 |

**xlsx 18 列**:
1. Phase
2. script_step
3. Screen Display Category
4. Display Format
5. Component 序号
6. Display Text
7. Display Image
8. Video Play
9. Audio - 字幕
10. Audio - 音色
11. Interactive Flow
12. Kai Script 1
13. Kai Script 2
14. Possible Student Response
15. Kai Feedback (Correct)
16. Kai Feedback (Wrong)
17. Transition Script
18. Knowledge Point

**特殊处理**:
- `Kai Script 1/2`: `trigger + script` 合并为 `trigger: ...\nscript: ...`
- `Transition Script`: 同上
- `Possible Student Response`: `trigger + feedback` 合并
- `Knowledge Point`: 5 子字段解析为多行
- 同 Phase + script_step 多 Component: 自动加 `_1, _2, _3` 后缀

### 4.4 输出质量检查

| 检查项 | 级别 | 检查方法 |
|---|---|---|
| 18 字段对齐 schema | **error** | 用 mission_spec_schema.csv 校验列名 |
| 主键唯一 | **error** | `(Phase, script_step, Component)` 唯一 |
| Display Text 校验规则 | **error** | 复用 §3.4 规则集 |
| 必填字段都填 | **error** | 13 必填字段不能空 |
| Asset objectKey 格式 | warning | `Mission\d+/.+` |
| Display Text 多行保留 | info | 单元格 wrap text |
| 列宽合理 | info | Display Text 列宽 50 |
| 冻结表头 | info | A2 freeze |

**Mission 4 实测**:
- 45 行 × 18 列
- 810 cell 全部有值
- 主键无重复
- Display Text 校验 0 违规

### 4.5 使用的文件

| 类别 | 文件 | 用途 |
|---|---|---|
| 读 | `missions/{mission_id}/v0.4_component_content_p{1,2,3,4}.md` | 4 个 markdown |
| 读 | `master/mission_spec_schema.csv` | 列定义 |
| 读 | `master/mission_phase_step_meta_model.md` (v0.2) | 字段语义 |
| 读 | `master/component_images/*.jpeg` | UI 原图（嵌入到 compare HTML）|
| 写 | `missions/{mission_id}/v0.5_mission_spec.xlsx` | 主输出 |
| 写 | `missions/{mission_id}/v0.5_mission_spec.json` | 备份 |
| 写 | `visuals/mission-{id}-preview-compare/index.html` | 预览 |
| 写 | `visuals/mission-{id}-preview-compare/compare_png/*.png` | 截图 |

### 4.6 技术 & 工具

- **Python 脚本**: `parse_v04_to_xlsx.py`
- **核心库**: 
  - `openpyxl` — 写 xlsx（带 wrap text + freeze + 列宽）
  - `markdown-it-py` 或 `mistune` — 解析 markdown 表格
  - `PIL` — 缩图（800px 宽，质量 78）
  - `base64` — 图片 inline 嵌入
  - `playwright` (可选) — 截图 HTML
- **HTML 模板**: 内联 CSS + 22 个 component renderer (JS)
- **CLI**: `course-pipeline v0.5 export --mission=X --format=xlsx --preview=html`

### 4.7 错误处理

| 错误 | 处理 |
|---|---|
| markdown 解析失败 | 报错具体位置，回退到人工 |
| Display Text 校验失败 | 阻断，列违规 lesson_step |
| 主键冲突 | 自动加 `_1, _2, _3` 后缀 |
| 嵌入图失败 | 降级为相对路径引用 |

### 4.8 转换算法核心

```python
def parse_lesson_step(section_text):
    """解析 markdown section, 返回 18 字段 dict"""
    data = {}
    
    # 1. Display Text (代码块)
    m = re.search(r'### Display Text\s*\n\n```\n(.*?)\n```', section_text, re.DOTALL)
    if m: data['Display Text'] = m.group(1).strip()
    
    # 2. 其他 17 字段 (markdown 表格)
    table = re.search(r'### 其他 17 字段\s*\n\n\| 字段 \| 值 \|\n\|---+\|---\|\n(.*?)(?=\n\n---|\Z)', section_text, re.DOTALL)
    if table:
        for row in table.group(1).split('\n'):
            m = re.match(r'\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|', row)
            if m: data[m.group(1)] = m.group(2)
    
    # 3. 复合字段合并
    # Kai Script 1/2: trigger + script → "trigger: ...\nscript: ..."
    # Transition Script: 同上
    # Knowledge Point: {word: x, pattern: y} → 多行 "word: x\npattern: y"
    
    return data
```

### 4.9 输出大小估算

| 产出 | Mission 4 实测大小 |
|---|---|
| v0.5_mission_spec.xlsx | 18 KB |
| v0.5_mission_spec.json | 50 KB |
| preview_compare_html (1.8MB) | 包含 41 张 inline base64 图 |
| preview_png/*.png | ~280KB / 张 × 7 张 ≈ 2 MB |

---

## N5 · 产品喂入 (v0.5 → Product)

### 5.1 节点定义

| 项 | 内容 |
|---|---|
| **节点 ID** | N5_product_ingest |
| **目的** | 把 v0.5 xlsx 喂入产品，渲染 mission，验证体验 |
| **负责人** | CD + 产品端 |
| **可逆性** | 完全可逆（产品端删除即可）|
| **AI 参与度** | 无（人工测试）|

### 5.2 输入

| 字段 | 类型 | 来源 |
|---|---|---|
| v0.5_mission_spec.xlsx | file | N4 产出 |
| component 配置 (产品端) | object | 产品端 |
| 资产库 | object | 产品端 (从 `[待补]` 解析) |

### 5.3 输出

| 字段 | 类型 | 说明 |
|---|---|---|
| 课程预览 URL | string | 产品端生成 |
| 走读报告 | text | 人工 review 记录 |

### 5.4 输出质量检查

| 检查项 | 级别 | 检查方法 |
|---|---|---|
| 字段对齐产品 schema | **error** | xlsx 列名 vs 产品 schema |
| 必填字段都填 | **error** | 同 N4.4 |
| 资产完整 | **error** | 所有 `[待补]` 已补完 |
| component 行为正确 | **error** | 走读 1 遍 mission |
| Display Text 渲染 | **error** | 与 compare HTML 一致 |
| 教学体验流畅 | warning | 整体节奏 |
| Goals 完整 | warning | 5 个 goals 都展示 |

### 5.5 使用的文件

| 类别 | 文件 | 用途 |
|---|---|---|
| 读 | `missions/{mission_id}/v0.5_mission_spec.xlsx` | 主输入 |
| 读 | `[待补]` 资产清单 | v0.4 里所有 `[待补: ...]` 的列表 |
| 写 | (产品端) | 课程数据 |

### 5.6 技术 & 工具

- **产品端 import**: xlsx → DB
- **资产上传**: video/image/audio → CDN
- **走读工具**: 产品 web 端
- **CLI**: 无（产品端操作）|

### 5.7 错误处理

| 错误 | 处理 |
|---|---|
| 字段缺失 | 阻断，列出缺失字段 |
| 资产未上传 | 阻断，列出缺失资产 |
| component 行为异常 | 反馈到 v0.4 修正 |
| 走读体验差 | 反馈到 v0.3 重新选 component |

---

## 6. 节点间数据流（综合）

```
[v0.1 .md 5-10K]
   ↓
[N1] LLM (~6K tokens) + 人工 review
   ↓
[v0.2 .md 5-10K]
   ↓
[N2] LLM (~11K tokens) + 主数据校验
   ↓
[v0.3 .md 5-10K]
   ↓
[N3] LLM × 45 (~180K tokens) + v0809.3 校验
   ↓
[v0.4 .md × 4 files 80K total]
   ↓
[N4] Python 转换 (~10s)
   ↓
[v0.5 .xlsx 18K + .json 50K + preview 1.8MB]
   ↓
[N5] 产品端导入 + 走读 (~30min)
   ↓
[课程上线]
```

**Mission 4 实测 token 总消耗**: ~200K tokens
**Mission 4 实测时长**: ~4-6 小时 (CD 主操作 + TD 2 次 review)

---

## 7. 工具 & 主数据汇总

| 节点 | 工具 | 写入文件 | 读取主数据 |
|---|---|---|---|
| N0 | Web form / CLI | `v0.1_input.md` | `component_catalog.json` 元信息 |
| N1 | LLM + Markdown editor | `v0.2_script_phased.md` | (none) |
| N2 | LLM + Table editor | `v0.3_step_component_map.md` | `phase_component_eligibility_v0.2.md` + `component_catalog.json` |
| N3 | LLM + Form editor | `v0.4_component_content_p{1,2,3,4}.md` | `mission_phase_step_meta_model.md` (v0.2) + `component_catalog.json` (v0809) |
| N4 | Python (openpyxl, PIL, base64) | `v0.5_mission_spec.xlsx/.json` + `preview_compare/index.html` | `mission_spec_schema.csv` + `mission_phase_step_meta_model.md` + `component_images/` |
| N5 | 产品端 | (产品 DB) | 产品 schema |

---

## 8. 校验规则全集

### 8.1 Display Text 校验（v0809.3）

| # | 规则 | 级别 |
|---|---|---|
| 1 | 模版=`无` → `NA` | error |
| 2 | 模版有字段无值 → `NA` | error |
| 3 | 不用 `—` 当空值 | error |
| 4 | 文本中保留 `—` / `-` 标点 | ok |
| 5 | Display Text 必填 | error |
| 6 | Display Text 多行对齐模版 | error |

### 8.2 Component 映射校验（v0.2.3 enforcement）

| # | 规则 | 级别 |
|---|---|---|
| 1 | script_step 落在 P1-P4 之一 | error |
| 2 | Component 在 phase 允许列表 | error |
| 3 | P1 至少包含 CMP-04 | error |
| 4 | P4 至少包含 CMP-21 或 CMP-26 | error |
| 5 | P3 CMP-19 必配 CMP-18 | error |
| 6 | CMP-13 P1 仅「含义推断」 | error |
| 7 | CMP-02 不入 P1 | error |
| 8 | CMP-15 仅 P2 | error |
| 9 | CMP-22 仅 P4 | error |
| 10 | 1 script_step 选 1-5 component | warning |
| 11 | CMP-03 每次独立 objectKey | warning |
| 12 | Board 拖拽归 CMP-19 内部 | error |
| 13 | CMP-28 集中 P3 末 / P4 自评 | warning |

### 8.3 v0.5 Schema 校验

| # | 规则 | 级别 |
|---|---|---|
| 1 | 18 字段对齐 schema | error |
| 2 | 必填字段都填 | error |
| 3 | 主键唯一 | error |
| 4 | Asset objectKey 格式 | warning |
| 5 | Display Text 校验 (复用 8.1) | error |
| 6 | Knowledge Point ≥ 1 子字段 | error |

### 8.4 自动化校验工具

```python
# /workspace/master/validators/v0.4_validator.py
def validate_v04(markdown_dir, mission_id):
    errors = []
    warnings = []
    
    # 读 4 个 phase 文件
    for phase in [1, 2, 3, 4]:
        path = f'{markdown_dir}/v0.4_component_content_p{phase}.md'
        lessons = parse_lessons(path)
        
        for lesson in lessons:
            comp_id = lesson['Component 序号']
            template = get_template(comp_id)
            dt = lesson['Display Text']
            
            # 校验 8.1
            if template == '无':
                if dt != 'NA':
                    errors.append(f'{comp_id} 模版=无 但 Display Text={dt}')
            else:
                # 解析模版必填字段
                required = parse_template_fields(template)
                actual = parse_dt_fields(dt)
                for f in required:
                    if f not in actual or actual[f] in ['', '—']:
                        errors.append(f'{comp_id} 字段 {f} 缺失')
                    if actual.get(f) == 'N/A':
                        errors.append(f'{comp_id} 字段 {f} 用 N/A 应该用 NA')
                # 检查整段不含 \u2014 作占位
                for line in dt.split('\n'):
                    if line.strip() == '\u2014':
                        errors.append(f'{comp_id} Display Text 含 \u2014 当占位符')
            
            # 校验 8.3
            for field in REQUIRED_FIELDS:
                if not lesson.get(field):
                    errors.append(f'{comp_id} 必填字段 {field} 缺失')
            
            kp = lesson.get('Knowledge Point', '')
            if kp == '—' or not kp or '{' not in kp:
                warnings.append(f'{comp_id} Knowledge Point 缺失')
    
    return {'errors': errors, 'warnings': warnings}
```

---

## 9. Mission 4 实战 benchmark

| 节点 | 输入大小 | 输出大小 | LLM tokens | 人工时长 |
|---|---|---|---|---|
| N0 | 5K 字符 | 5K | 0 | 5 min |
| N1 | 5K | 5K (P1-P4) | 6K | 10 min |
| N2 | 5K | 14K (17 script_step) | 11K | 10 min |
| N3 | 14K + 5K | 80K (45 lesson_step × 18 字段) | 180K | 45 min |
| N4 | 80K | 18K (xlsx) + 1.8MB (html) | 0 | 5 min |
| N5 | 18K | (产品端) | 0 | 30 min |
| **总计** | | | **~200K** | **~2h** |

**Mission 4 lesson_step 分布**:
- P1: 7 steps (script_step 1-3)
- P2: 25 steps (script_step 4-13)
- P3: 8 steps (script_step 16-17)
- P4: 5 steps (script_step 17 末尾)
- 22 components used / 37 catalog total

---

## 10. 修订记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| v1.0 | 2026-08-10 | 初稿：6 节点 (N0-N5) 详细规范 | Mavis |
