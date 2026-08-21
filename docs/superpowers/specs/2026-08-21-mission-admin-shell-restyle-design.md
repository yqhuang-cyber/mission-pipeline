# Mission Pipeline · Admin Shell 换新颜（对齐 HSKai Admin）

> **日期**: 2026-08-21  
> **范围**: 档位 **2 · Admin Shell** + 路径 **C · Shell + 全页范式**  
> **参考**: https://kai.hskgo.cn/admin （登录页 + Lessons/Assets/Models/Operations/Accounts/Settings）  
> **现状**: `apps/web` — 顶栏文档站 + 暖米衬线皮肤  
> **非目标**: 不做真实登录/权限；不改 API / N0–N5 业务逻辑；不引入 Naive UI 整库（可用 CSS 复刻视觉）

---

## 1. 目标

把 Mission Pipeline Runner 从「文档站点顶栏」改成与 HSKai Operations Console **同族**的运营台：

- 深林绿侧栏 + 白顶栏 + 暖米画布  
- 统一页头（eyebrow / 标题 / 说明 / 主操作）  
- 列表页：统计卡 + 白底表/行 + 状态 pill  
- 详情 / 新建 / Modal：同一套卡片、工具条、空状态、按钮节奏  

成功标准：并排打开 Kai Accounts 与 Mission 列表/详情，**壳层与组件气质一眼同族**；功能路径不变。

---

## 2. Design Tokens（从 Kai `:root` 迁入）

写入 `apps/web/assets/css/main.css`（或拆 `tokens.css`），命名可用 `--mp-*`，语义对齐 Kai `--admin-*`：

| Token | 值 | 用途 |
|---|---|---|
| `--mp-canvas` | `#f4efe4` | 主区背景 |
| `--mp-canvas-warm` | `#ede5d2` | 次级暖底 |
| `--mp-surface` | `#fff` | 卡片 / 顶栏 |
| `--mp-surface-tint` | `#fbf8f1` | 工具条浅底 |
| `--mp-text` | `#152033` | 主文 |
| `--mp-text-muted` | `#5d6a7c` | 说明 |
| `--mp-text-soft` | `#97a1b2` | eyebrow / 表头 |
| `--mp-border` | `#e2dccd` | 边线 |
| `--mp-border-strong` | `#cdc4ad` | 强调边 |
| `--mp-divider` | `#ece4d2` | 分割 |
| `--mp-sider-bg` | `#0e1f1a` | 侧栏 |
| `--mp-sider-bg-deep` | `#071310` | 侧栏深处 |
| `--mp-sider-text` | `#f1ebdcb8` | 侧栏次文 |
| `--mp-sider-text-strong` | `#fffbf0f5` | 侧栏主文 |
| `--mp-accent` | `#f5a400` | 编号/eyebrow 琥珀 |
| `--mp-brand` | `#72ff84` | 亮绿点缀 / 状态点 |
| `--mp-primary` | `#2d6a4f` | 主按钮（翠绿） |
| `--mp-ok` / `--mp-danger` | `#00a921` / `#e5484d` | 状态 |
| `--mp-radius-card` | `16px` | 卡片 |
| `--mp-radius-soft` | `12px` | 按钮/输入 |
| `--mp-radius-pill` | `999px` | pill |
| `--mp-shadow-card` | Kai card shadow | 轻阴影 |

**字体**：改为系统无衬线栈（与 Kai 一致）；去掉 Iowan/Palatino 作为全局默认。页面大标题可用略重字重，**不强制衬线**（若个别展示标题要学术感，仅限 eyebrow 旁的装饰，默认全站 sans）。

---

## 3. 信息架构 · Admin Shell

### 3.1 布局

```
┌──────────────────────────────────────────────────────────┐
│ Top header (surface)  brand · status · env/version       │
├────────────┬─────────────────────────────────────────────┤
│ Sider      │ Main canvas                                 │
│ (dark)     │  page header + content cards                │
│            │                                             │
└────────────┴─────────────────────────────────────────────┘
```

- 新 layout：`layouts/admin.vue`（或替换 `default.vue`）  
- 所有现有页面走此 layout  
- 移动端：侧栏可收起为抽屉（最小可用：顶栏汉堡 + overlay）

### 3.2 侧栏导航

| # | Label | Sub | Route |
|---|---|---|---|
| 01 | Missions | PIPELINE | `/missions` |
| 02 | Catalog | COMPONENTS | `/catalog` |
| 03 | Meta Model | SCHEMA | `/mission-meta-model` |

- 分组标题：`WORKSPACE`  
- Active：圆角条 + 左侧亮线或琥珀编号高亮（对齐 Kai）  
- 底栏小字：`v0.x · Mission Pipeline`（可用 package/runtime 版本）

### 3.3 顶栏

- 左：Logo 方块（绿底简标即可）+ `Mission Pipeline` + `RUNNER · Vx`  
- 中或次左：状态点 + `Pipeline ready`（静态文案即可，不做真探活除非已有）  
- 右：可选环境 pill（dev）；**不做**登录/改密（本产品无 auth）

---

## 4. 页面范式（全站统一）

每个页面主区遵循：

1. **Eyebrow**（全大写 + 宽字距，`--mp-text-soft`）  
2. **Title**（~28px / 700）  
3. **Subtitle**（一行说明，muted）  
4. **Primary action(s)** 右上（绿实心 / 次按钮描边白底）  
5. 内容：统计卡（如有）→ 白卡片列表/表/文档  

可抽公共组件（建议，不强制一次到位）：

- `AppShell` / layout  
- `PageHeader`（eyebrow, title, subtitle, actions）  
- `StatCard`  
- `StatusPill`  
- `EmptyState`  
- `DataPanel`（白卡片 + toolbar + body）

---

## 5. 分页面改造

### 5.1 `/missions` 列表

对齐 Kai **Accounts / Operations**：

- Eyebrow `PIPELINE` · Title `Missions` · 说明保留现有一句话  
- 主按钮：`+ 新建 Mission`  
- 统计卡（由列表派生，前端计算即可）：如 Total / Running·awaiting / Approved·done / Blocking decisions  
- 列表：白底 `DataPanel`「Mission list」+ 刷新；每行：名称+topic · 当前节点 · **StatusPill** · 更新时间 · 进入箭头  
- 空状态：虚线圆标 + 文案 + CTA（对齐 Kai empty）

### 5.2 `/missions/new`

- 页头：`PIPELINE` / `New Mission` / 说明  
- 单白卡片表单：标签 muted、输入圆角 soft、主按钮提交、次按钮返回列表  
- 错误：危险色条，非红底吓人整页

### 5.3 `/missions/[id]` Pipeline Canvas（重点）

保持现有能力（选节点、Run/Approve/Reject、产物预览、各编辑器入口），换皮与结构：

- 页头：eyebrow `MISSION` · title = mission.name · subtitle = topic + masterDataVersion  
- 右侧操作：返回列表 · 刷新  
- **上：节点条** — 横向步骤（N0–N5），active/可跑/阻塞用 pill/色点，气质像侧栏编号而非粗按钮堆  
- **中：统计/摘要条**（可选）— 当前节点、run status、blocking 数  
- **下：双栏或单栏白卡片**  
  - Input / Output 预览卡（标题 + mono 预览 +「打开阅读器」）  
  - Decisions 卡（问题 + option 按钮，主/次层级对齐 Kai）  
  - 节点动作条：Run / Approve / Reject / 打开 V0.3.1|V0.3|V0.4 编辑器 — **工具条风格**，非散落裸按钮  

节点详情交互逻辑不变；只改视觉层级与容器。

### 5.4 `/catalog`

- 页头：`COMPONENTS` / `Component Catalog`  
- 工具条：搜索（pill input）+ 刷新  
- 左列表 / 右详情：两侧均为白卡片；选中行有浅绿/深边高亮  
- Phase 标签用 soft pill  
- 预览图区：卡内圆角，避免旧式硬边框堆叠

### 5.5 `/mission-meta-model`

- 页头：`SCHEMA` / `Mission Meta Model`  
- 正文：单白卡片 Markdown（现有渲染器），标题层级与 `--mp-text` 对齐；代码块用 tint 底

### 5.6 Modal 族（全页范式的一部分）

涉及：`ArtifactViewerModal` · `V031ActivityModal` · `V03EditorModal` · `V04ViewerModal` · `V04EditorModal` · `ComponentPicker` · `ComponentPreviewLightbox`

统一：

- 遮罩深色半透明（偏 sider 色，非纯黑刺眼）  
- 面板：`--mp-surface` + `--mp-radius-card` + `--mp-shadow-pop`  
- 顶栏：标题 + 关闭；底栏：次按钮左 / 主按钮右（若有确认）  
- 内边距与表单控件跟 shell 同 token  
- **不改**各 Modal 的业务字段与保存 API  

允许分两批落地：先 Shell+页面，Modal 紧随同一 PR 或紧接 PR（仍属 C 范围，不另开档位）。

---

## 6. 实施分期（仍属 C，可拆 PR）

| PR | 内容 |
|---|---|
| **PR1** | Tokens + `layouts/admin` 侧栏/顶栏 + 全局按钮/卡片/字体；三页导航可用 |
| **PR2** | Missions 列表/新建 + Catalog + Meta 页头与列表范式 |
| **PR3** | Mission 详情 Canvas 重组视觉 |
| **PR4** | 全部 Modal 换肤对齐 |

合并策略可由执行时压成 1–2 个 PR，但验收按上表检查。

---

## 7. 非目标 / 约束

- 不复制 Kai 的 Lessons/Assets 业务；只借 **壳与组件语言**  
- 不引入整包 Naive UI（避免包体与主题耦合）；必要时可抄圆角/阴影数值  
- 不改后端契约  
- 无障碍：侧栏键盘可达、对比度达标（正文对暖米底）  
- 前端设计规则：避免紫渐变/默认 Inter 堆砌感；本项目以 Kai token 为准，**允许**暖米+森绿（与参考站一致，不算随机 AI 套皮）

---

## 8. 验收清单

- [ ] 打开任意页可见深侧栏 01–03 + 顶栏品牌  
- [ ] Missions 有统计卡 + 状态 pill + 主 CTA  
- [ ] Catalog / Meta 页头范式一致  
- [ ] Mission 详情节点条与动作条层级清晰，功能回归（Run/Approve/编辑器）通过  
- [ ] Modal 与页面同色板，无旧衬线/旧青绿残留为主界面默认  
- [ ] 窄屏侧栏可收起，主流程可完成  

---

## 9. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-08-21 | 初稿：档位 2 + 路径 C；对齐 Kai 内页壳与 Accounts/Operations 工作台 |
