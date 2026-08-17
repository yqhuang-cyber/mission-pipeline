# Master Data · 课程结构化主数据

> **用途**: 课程内容制作 pipeline 用的主数据文件总览。这些文件被所有 mission 共享，是 pipeline 的"参考书"。
> **更新日期**: 2026-08-11

---

## 文件清单

| # | 文件 | 用途 | 用在节点 | 状态 | 权威定位 |
|---|---|---|---|---|---|
| 1 | `component_catalog.json` | 37 个 component 定义（模版 / 示例 / 原型路径）| N2, N3, N4 | ✅ **v0729**（自 `Mission组件清单0729_完整版`）| 任何 mission 都依赖，**改前必须通知所有 mission owner**；仅技术/产品可改 |
| 2 | `phase_component_eligibility_v0.2.md` | Phase ↔ Component 允许性映射 + enforcement 规则 | N2 | ✅ v0.2.4 | 任何 mission 都在用，**改前必须 confirm 当前在做的 mission 不受影响**；仅内容设计 owner 可改 |
| 3 | `mission_spec_schema.csv` | **13** 字段列结构（机器可读）| N3, N4 | ✅ v0.4 (含 Component) | 产品 schema 真相源，**改就是改产品字段**；仅产品/技术可改 |
| 4 | `mission_phase_step_meta_model.md` | **13** 字段语义 + 填表规则 + 多语言约定 + asset 引用约定 | N3, N4 | ✅ v0.4.5 | 跟 schema.csv 配套，**必须一起改**；仅内容设计 owner 可改 |
| 5 | `component_images/` | 各 CMP UI 原型图（供 Runner 预览）| Web N2 编辑器 | ✅ 随 v0729 从 xlsx 导出 | 与 catalog G 列路径对应 |

> **命名变更 (2026-08-10)**: 原 `lesson_spec_schema.csv` / `v0.5 lesson_spec` 统一改为 **`mission_spec`**。一行 = 一个 **mission step**（= 一个 component 的具体使用）。  
> **Catalog (2026-08-11)**: 废弃 `component_catalog_v0809.json` / `*.bak`；唯一真相源为 `component_catalog.json`（E=模版，F=示例，H=英文名，G=原型相对路径）。  
> **Meta model (2026-08-11)**: `lesson_step_meta_model.md` → **`mission_phase_step_meta_model.md`**（语义仍描述 mission step 字段）。

## 目录当前内容

```
/workspace/master/
├── README.md
├── component_catalog.json              必备 · 组件定义（active, v0729）
├── component_images/                   组件 UI 原型图
├── mission_spec_schema.csv
├── phase_component_eligibility_v0.2.md
└── mission_phase_step_meta_model.md
```

## 各文件之间的关系

```
component_catalog.json          ← 定义"有哪些 component" + Display Text 模版
        ↓
phase_component_eligibility_v0.2.md   ← 定义"每个 Phase 能用哪些 component"
        ↓
v0.3 stepped script (per mission)     ← 每个 component = 一个 mission step
        ↓
mission_phase_step_meta_model.md             ← 定义"每个 mission step 要填哪些字段"
mission_spec_schema.csv               ← 提供 13 字段的列结构
        ↓
v0.4 component content (per mission)  ← 实际填 13 字段（P1–P4 共 4 文件）
        ↓
v0.5 mission_spec (per mission)       ← 按 schema 格式输出最终 xlsx
```

## 修改规范

1. **改 catalog / eligibility / schema 前先通知**正在跑的 mission owner  
2. **catalog E 列模版**变更会影响 N3 Display Text 生成与校验  
3. 原型图放入 `component_images/CMP-XX.jpeg`（多图用 `_1` `_2`）并同步 G 列
