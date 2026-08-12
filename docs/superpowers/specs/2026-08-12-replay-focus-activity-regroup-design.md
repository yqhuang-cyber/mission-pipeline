# V0.3.1 Replay / 聚焦知识点 活动重组设计

> **日期**: 2026-08-12  
> **范围**: N2 V0.3.1 `splitBodyIntoChunks`（教学活动拆分）  
> **动机**: script_step 5 将「多段 Replay + 多国 Screen/Audio 聚焦」糊成单一「例证输入」，无法服务 CD 选型。

---

## 问题

线性关键词切分（`Replay.` → 一直吃到 `What do you notice`）把两种教学动作粘在一起：

1. **情境回放**：把故事相关台词再播一遍（可有多处 `Replay.` / `Then replay`）
2. **聚焦知识点**：对单个目标词做 Audio / Screen 强化（如「美国人」）

CD 期望（以 Mission `7194dded-…` script_step 5 为金标准）：

| # | 标题 | 说明 |
|---|---|---|
| 5.1 | 情境回放聚焦目标知识点 | 散碎 Replay 台词/脚手架 **聚成 1 个** |
| 5.2 | 聚焦知识点「英国人」 | Audio / Screen UK |
| 5.3 | 聚焦知识点「美国人」 | 台词 + Screen US |
| 5.4 | 聚焦知识点「中国人」 | 台词 + Screen China（± 三词总览） |
| 5.5 | 发现构词规律 | `What do you notice?` → Choices（引导发现+检查） |
| 5.6 | 句型规律识别 | `Screen: 中国 + 人 → …` + `Country + 人`（显式公式呈现） |

---

## 设计：micro-beat → 标签 → 重组（非纯线性切）

### Pass A — 仅在「回放+多聚焦」形态上触发

触发条件（同时满足）：

- 正文含 `Replay.` 或 `Then replay`
- 至少 **2** 处 `Screen shows`（或等价 Audio+目标词呈现）指向不同目标词（如 `英国人` / `美国人` / `中国人`）
- 可选：后面跟 `What do you notice` 类 discover 边界（由既有 `ACTIVITY_START_RE` 切开亦可）

未触发则走既有线性拆分，避免误伤其它步骤。

### Pass B — 切 micro-beats 并打标

在「回放簇」片段（discover 之前）内识别：

| 标签 | 典型标记 |
|---|---|
| `replay_scaffold` | `Replay.` / `Then replay …` / `Then Jayden.` / `Freeze.` / Kai `Listen.` |
| `replay_line` | 紧随其后的中文台词（`Tom：我是英国人。`） |
| `focus_present` | `Audio:` + 目标词，和/或 `Screen shows …` + 目标词行 |
| `focus_summary` | 无 flag 的总览 `Screen:` 多词并排 |
| `discover` | `What do you notice` / 随后 Highlight+Choices（若尚未切开） |

### Pass C — 重组规则

1. **所有** `replay_scaffold` + `replay_line` → **1 个** activity  
   标题：`情境回放聚焦目标知识点`  
   锚点：**不含**各国 `Audio:` / `Screen shows … flag` 聚焦块

2. **每个** 不同引理的 `focus_present` → **1 个** activity  
   标题：`聚焦知识点「{引理}」`  
   锚点：该国的 Audio/Screen；**可附带**紧邻的那句 `replay_line`（与 5.1 允许轻度重叠）  
   顺序：按原文出现顺序  
   `focus_summary` 并入 **最后一个** 聚焦 activity

3. **discover** → 既有命名（如 `发现构词规律`），不改语义

### 锚点重叠

允许：同一句回放台词可同时出现在 5.1（回放叙事）与对应聚焦（语境）。  
CD 以教学动作理解活动，不要求原文分区互斥。

### 上限

单 step 重组后 activity 数与全局一致：最多 **10**（与 V0.3.1 UI 对齐）；原 `slice(0, 5)` 过紧，改为 10。

---

## 选型提示（顺带，非本变更硬门）

| 活动类型 | 优先候选 |
|---|---|
| 情境回放 | CMP-05 / CMP-03（回放/观看），避免误判 CMP-09 |
| 聚焦知识点「X」 | CMP-10 / CMP-29 / CMP-09 |
| 发现构词规律 | CMP-11（检查用 CMP-13） |

标题命中 `情境回放` / `聚焦知识点` 时，在 `scoreCandidates` 中给对应 bump。

---

## 非目标

- 不把 step 6「Student builds」平行练习改成聚焦（已有 `构建「X」`）
- 不把单次 `Replay.` + 随后含义选择题（step 3 类）强行拆成多聚焦
- 不引入 LLM；规则基于标记与目标词抽取

---

## 验收

用精简版 script_step 5 fixture（或 runtime mission 正文）：

1. activities 标题顺序含：  
   `情境回放聚焦目标知识点` → `聚焦知识点「英国人」` → `聚焦知识点「美国人」` → `聚焦知识点「中国人」` → `发现构词规律` → `句型规律识别`
2. 5.1 锚点含多段 Replay 台词，且 **尽量不含** `Screen shows UK/US/China flag`
3. 各聚焦锚点分别含对应国 Screen/词
4. 「发现构词规律」不含 `中国 + 人 →`；「句型规律识别」含公式 Screen
5. 既有对比问句 / 听后含义推断 / 平行 builds 测试不回归

---

## 修订 2026-08-12b — 发现 vs 句型规律呈现

**逻辑问题**：`What do you notice` 之后整段被当作一个 discover 单元，把公式 Screen（显式规律呈现）吞进「发现构词规律」。

| 教学动作 | 边界 | 标题 | 选型 |
|---|---|---|---|
| 引导发现 + 检查 | notice / taps / Highlight / Choices | 发现构词规律 | CMP-11 / CMP-13 |
| 显式规律呈现 | `Screen:` … `+ 人 →` 或 `Kai: Country + 人` | 句型规律识别 | CMP-11 / CMP-07 |

实现：`splitDiscoverFromPatternFormula`（注意 `**Screen:**` 尾部 `*` 不能破坏换行匹配）。
