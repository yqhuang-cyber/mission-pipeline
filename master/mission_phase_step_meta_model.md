# Mission Phase Step Meta Model v0.4.5

> **版本**: v0.4.5  
> **文件**: `master/mission_phase_step_meta_model.md`  
> **数据源**: `mission_spec_schema.csv` · `component_catalog.json` (v0729) · `phase_component_eligibility_v0.2.md` · **v0.3 stepped script**
>
> **作用**：定义 Mission 层级，以及 mission spec **每一行**（1 Step = 1 Component）13 个字段的语义与填法。  
> **列名真相源**：`mission_spec_schema.csv`；本文件解释「怎么填」。

---

## 1. 层级

```
Mission
  └── Phase（固定 4）
        └── Script Step（来自 v0.3）
              └── Step（= 一次 Component 呈现 = 一行）
                    └── Component + 展示/交互字段
```

### Phase（固定四阶段 · 推荐全称）

| 填写值 | 简称 | 角色 |
|---|---|---|
| `Phase 1 - Mission Intro` | P1 | 任务发布、故事沉浸、首次感知 |
| `Phase 2 - Knowledge Discovery` | P2 | 发现 / 连接 / 练习 / 模式识别 |
| `Phase 3 - Performance Mission` | P3 | 真实任务执行 |
| `Phase 4 - Ending Summary` | P4 | 收获、回顾、衔接下一课 |

与 v0.3 / eligibility 一致，**不增删**。校验时可把 `P1`…`P4` 视为全称别名，但 **mission spec 写出全称**。

### 核心关系

- **1 Component = 1 Step = 1 行**
- 同一 Script Step 下可有多行（多个 Component，或同一 CMP 多次使用）
- Component **之后**的字段只服务**本行这个 Component** 的展示与交互

### 主键

`(Phase, Script Step, Step)`  
- `Step` 为短标签，在同一 Script Step 下必须唯一  
- 同一 CMP 在同一 Script Step 出现多次时，标签须可区分（如 `Roleplay — Emma` / `Roleplay — Alex`，或加 `(1/3)`）

### N3 输入 → 输出

| 输入（主要来自 v0.3 + catalog） | 输出 |
|---|---|
| Phase / Script Step / 教学目的 | 写入对应列 |
| 所选 Component + content outline | Component、Step、Display Text、Kai*、KP… |
| catalog E 模版 · F 示例 · J 目的 · K 互动 · L 用户输入 | 约束生成与「是否有互动」 |

**Display Image / Video Play：按 catalog N/O 列填默认值。** 不需要图/视频写 `NA`；需要则写前端字段名 + `TBC`（如 `imageUrl+TBC`、`video.objectKey+TBC`）。CD 把 `TBC` 换成实际 objectKey。

---

## 2. 字段总览

| # | 字段 | 流水线 | 要点 |
|---|---|---|---|
| 1 | Phase | ✅ | 四阶段全称 |
| 2 | Script Step | ✅ | 继承 v0.3（编号优先，可附标题） |
| 3 | Step | ✅ 生成 | 对齐 Component 的**短标签** |
| 4 | Component | ✅ | `CMP-XX · 简称` |
| 5 | Display Text | ✅ 生成 | 严循模版；从 outline 抽要素 |
| 6 | Display Image | ✅ catalog 默认 | `NA` 或不需要时；需要则 `前端字段+TBC` |
| 7 | Video Play | ✅ catalog 默认 | 同上 |
| 8 | Kai Script 1 | ✅ 生成 | Step **开始**讲解，短 |
| 9 | Kai Script 2 | 条件 | **互动前**触发语；无互动则空 |
| 10 | Kai Feedback - Correct | 条件 | 互动正确反馈；无互动则空 |
| 11 | Kai Feedback - Wrong | 条件 | 互动错误引导；无互动则空 |
| 12 | Transition Script | ✅ 生成 | Step **收尾**，短 |
| 13 | Knowledge point | ✅ 提炼 | 从 outline 提炼 |

### Kai 时间线（避免串戏）

```
Kai Script 1（开场讲解）
  → 屏幕展示（Display Text / 媒体）
  → Kai Script 2（触发互动，若有）
  → 学生互动
  → Feedback Correct / Wrong（若有）
  → Transition Script（收尾 / 过渡）
```

各段**不要互相复述**同一句；长度建议：Script 1 ≤ 2 句；Script 2 / Feedback / Transition ≤ 1–2 句。

---

## 3. 逐字段：理解与怎么填

### 3.1 Phase

四选一全称（见 §1）。Component 必须在该 Phase 的 eligibility 内。

### 3.2 Script Step

- 来自 **v0.3**，不新造编号  
- 推荐：`{编号}` 或 `{编号} · {标题}`（与 v0.3 一致），便于对齐与排序

### 3.3 Step

- **粒度** = 选用的 Component：挂一个 CMP → 一个 Step  
- **填法**：优先使用 **v0.3.1 的 activity 标题**（与 Confirm 后活动一一对应）；无 activity 时再回退到 outline / script 短标签  
  - ✅ `听辨练习：问名字` · `指人说「他是英国人」` · `观看开场故事`  
  - ❌ 仅写 `1` / `2` / `3`（可读性差；同 CMP 复用时尤其不够）  
- 同一 Script Step 下 Step 须可区分；无 activity 标题时可用 `(1/3)` 后缀

### 3.4 Component

- 格式：`CMP-XX · 简称`（如 `CMP-13 · 单项选择`），与 catalog C 列 / v0.3 一致  
- 1 行只挂 1 个；须在 catalog 且 Phase 允许

### 3.5 Display Text

**生成路径**：

1. 识别 **组件族**（techClass / CMP：learning-goals / single-choice / mission-card / video-overlay…）  
2. 按族从 content outline **分析**可变内容（题干、选项、唯一答案、目标列表、叠字…）  
3. 填入 **E 列模版**结构  
4. 对照 **F 列示例**写固定 chrome；对照 **M 设计规范**与 **UI 原型（G）**自检合理性  
5. 【】缺料 → `[待补: …]`，**禁止编造**大纲没有的答案/选项

**Catalog E 列约定（重要）**：

| 记号 | 含义 | 空值 |
|---|---|---|
| `【…】` | **必填槽位** | **禁止用 `NA` 充数**（无选项的多余 D 除外）；outline 不足用 `[待补: …]` |
| `[…]` | **非必填 / 版式 chrome** | 优先用 **F 列示例的固定文案**（如页眉），不要乱填 `NA` |
| 整模版为 `无` | 无屏文 | 整格 `Display Text = NA` |

**按类型填槽（必须）**：

| 组件族 | 典型 CMP | outline 应抽出 | 合理性 |
|---|---|---|---|
| 学习目标 | CMP-32 | 完整 ✓ goals；主题 | 页眉/卡片标题用产品固定文案；副标题=`Today's topic: {主题}` |
| Mission 卡 | CMP-04/18 | 任务标题、START 按钮 | 标题=要完成的事，非知识点目录 |
| 单选 | CMP-02/13/33 | 题干 + A/B/C(/D) + **唯一**答案字母 | 禁止把 `Student choices` 整段塞进题干；禁止用单词内字母切选项；答案只能是一个 A–D |
| 自评 | CMP-28 | 问题 + 中性选项 | 选项无对错 |
| 视频叠字 | CMP-05 | 叠字汉字 + 拼音 | 只补关键信息，不替代互动 |
| 模版=无 | CMP-01/03… | — | Display Text=`NA` |

- 先看 **F 示例**与 **component_images** 理解每个占位符在屏上是什么  
- 内容槽从 outline 抽；可展开行（目标/例句/选项）按 outline 条数展开  
- **优先抽取 outline，不编造**

### 3.6–3.7 Display Image / Video Play

流水线按 **catalog N/O 列**填默认值：

| 情况 | 填法 |
|---|---|
| 组件 UI **没有**内容图 / 内容视频槽（Kai 数字人侧栏不算） | `NA` |
| 有槽、素材待补 | 前端字段名 + `TBC`，如 `imageUrl+TBC`、`video.objectKey+TBC`、`backgroundVideo.objectKey+TBC` |

CD 将 `TBC` 换成 objectKey（不用完整 URL）。Kai 老师头像是产品壳，不写进这两列。

### 3.8 Kai Script 1（开场讲解）

- Step **开始时** Kai **口播**（可中英混）  
- 依据：教学目的 + CMP 互动方式（catalog K）+ content outline 里 Kai 说的话  
- 短；学习者名用 **`[User Name]`**（例：`Welcome back, [User Name].`）  
- **禁止**写入组件名、字段标签、教学目的原文等标注（如「视频播放」「建立关系、激活注意」）

### 3.9–3.11 Kai Script 2 / Feedback Correct / Wrong

**是否填写（「有互动」判定）**：

- 看 catalog **L 用户输入** / **K 互动方式**：需要学生选择、输入、跟读、产出等 → **填**  
- 纯展示 / 纯视频 / 仅「观看·继续」无学生作答 → **Script 2 + Feedback 都留空**  
- 吃不准：K/L 含「选择、跟读、输入、任务、匹配、语音」等 → 填；「观看 / 播放/继续」→ 空
- **固定例外（N3 启发式）**：CMP-03/05/07/09 → Script2+Feedback 空；CMP-08/15/35 → 填（跟读/角色/开口）

| 字段 | 作用 | 写法 |
|---|---|---|
| Kai Script 2 | 互动**开始前**触发 | **口播**一句，指向动作（点选 / 开口 / 拖拽…）；勿写 catalog L 原文（如「语音交互」） |
| Feedback Correct | 正确后 | 简洁肯定，不抢 Transition 的戏 |
| Feedback Wrong | 错误后 | 简洁 + **引导重试**；选择题避免直接甩出完整答案剧透（可提示听什么 / 看什么） |

**DisplayText 启发式（与手工润色对齐）**：

- CMP-08：`汉字 — 拼音 — gloss` → 汉字/拼音/重读（勿用 activity 标题当汉字）
- CMP-07：Screen 例句 → 左侧；`[PERSON]+是+…` → 右侧
- CMP-35：Student 句 → 汉字；Kai 英文 cue → 英文（勿抄 F「对不起…」）
- CMP-15：Emma / Student 回合 → 对话行；场景从 welcome / school 锚点

### 3.12 Transition Script

- Step **收尾** Kai **口播**（衔下一 Step 或收束本活动）  
- 短；可从 outline 末段 Kai 句抽取；**勿重复** Kai Script 1 的开场句  
- **禁止** `Next — {教学目的}` 这类标注句

### 3.13 Knowledge point

从 **v0.2 元信息知识点库**（整体 mission 的 Word / Grammar / Phrase / Pattern / SocialExpression / Pinyin）中，挑选本步 outline 实际涉及的条目；有则写、无则省略子项。各类均为 optional：

- **Word** — 词汇  
- **Grammar** — 语法点（如助词「的」）  
- **Phrase** — 短语 / 词块  
- **Pattern** — 句型  
- **SocialExpression** — 社交 / 课堂用语  
- **Pinyin** — 本步出现的拼音  

建议单元格格式（多行亦可）：

```
Word: 哪国 / 中国 / 美国
Grammar: 的
Phrase: 哪国人
Pattern: 你是哪国人？ / 我是XX人。
Pinyin: nǐ shì nǎ guó rén
```

本步若无明显知识点（纯寒暄过渡、或 outline 未命中库内条目），**留空**即可，不要编造占位文案；**不要**把组件名或教学目的中文当成 Word；**不要**把整课知识点库抄进每一步。`SocialExpression` 仅在本步真的教/练库里的社交表达时使用。

---

## 4. 多语言与口播

- 与 outline / 源 script 风格一致，中英可混排  
- 姓名占位统一 **`[User Name]`**  
- 不强制 `{zh,en,pinyin}` 或 `|` 拼接串  

---

## 5. 检查清单

1. 一行 = 1 Step = 1 Component  
2. Phase 全称；Script Step / Component 对齐 v0.3  
3. Step 短标签唯一（同 CMP 复用可区分）  
4. Display Text 跟 E 列；`【】` 非 NA（缺料用 `[待补]`）；对照 F 列  
5. Image / Video 留空  
6. Kai 时间线正确；Script 1 + Transition 必有且短  
7. 按 K/L 判断是否填 Script 2 + Feedback×2  
8. KP 从 outline 提炼，不空壳乱编  

---

## 6. 空值速查

| 情况 | 约定 |
|---|---|
| Image / Video | 留空 |
| 模版=`无` | Display Text = `NA` |
| `【】` 必填缺料 | `[待补: …]`（禁止瞎编 / 禁止 NA） |
| `[…]` 可选且无内容 | `NA` |
| 无互动 | Script 2、Feedback×2 留空 |

---

## 7. 与其他主数据

| 文件 | 用途 |
|---|---|
| `mission_spec_schema.csv` | 13 列名与顺序 |
| `component_catalog.json` | 组件名；E 模版（【】/[]）；F 示例；J/K/L |
| `phase_component_eligibility_v0.2.md` | Phase ↔ 允许 CMP |
| v0.3 stepped script | Script Step、CMP、outline、教学目的 |

---

## 8. 示例行

| 字段 | 值 |
|---|---|
| Phase | Phase 1 - Mission Intro |
| Script Step | 2 · Opening Story check |
| Step | Opening MCQ — countries heard |
| Component | CMP-33 · 选择题（传统版） |
| Display Text | （按该 CMP 模版；`【】` 槽已填实或 `[待补]`） |
| Display Image | `NA` |
| Video Play | `NA` |
| Kai Script 1 | Welcome back, [User Name]. First, just watch. |
| Kai Script 2 | How many countries did you hear? Tap one. |
| Kai Feedback - Correct | Good — hold onto that. |
| Kai Feedback - Wrong | Not yet — listen again for the country names. |
| Transition Script | We'll come back to this story. |
| Knowledge point | Word: 中国 / 美国 / 英国 |

---

## 9. 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.4.3 | 2026-08-11 | 首版逐字段填法 |
| v0.4.5 | 2026-08-17 | Display Image / Video Play 改为 catalog N/O 默认值（NA 或 前端字段+TBC） |
