# Design: v0.3 Stepped Script Editor (N2)

> **Date**: 2026-08-11  
> **Status**: implemented (2026-08-11)  
> **Mission context**: Pipeline Runner HITL；N2 产出可改、点保存落盘

---

## 1. Goal

在 Web Pipeline Runner 中，对 **v0.3 stepped script** 做结构化编辑：

- 可改每个 script_step 下的 **component / 角色 / Content outline**
- **更换 component** 时自动带出对应 **关键字段**
- component 选择时展示 **序号 + 中文名**（可选附英文名），并可 **点开 UI 原型图** 预览  
  - **不使用** catalog「讲解/探索/练习/过渡」这类教学类型标志
- **点击「保存」** 才写回 Artifact（DB + `missions/runtime/<id>/`）；未保存离开可提示

---

## 2. Non-goals

- 不在本迭代做 N1/N3/N4 的同等结构化编辑
- 不改 Approve 后的只读策略以外的 HITL 流程
- 不上传/替换 `master/component_images`；只消费已有原型图
- 不做实时自动保存

---

## 3. UX

### 3.1 Entry

- 选中 **N2**，且已有 Output 时：
  - 保留现有「打开阅读器」
  - 新增 **「编辑 v0.3」** 按钮 → 全屏/大弹层编辑器

### 3.2 Editor layout

```
┌─────────────────────────────────────────────────────────────┐
│ v0.3 编辑 · {mission name}              [取消] [保存]       │
├──────────────┬──────────────────────────────────────────────┤
│ script_step  │  当前 step 的 component 表                   │
│ 目录侧栏     │  Component | 角色 | 关键字段 | outline | 操作 │
│ P1 / P2…     │  [下拉选择器] [primary▾] [只读] [textarea]  │
└──────────────┴──────────────────────────────────────────────┘
```

- 左侧：Phase → script_step 导航  
- 右侧：该 step 的 component 行（可增删行，上限建议 5）  
- **关键字段**：只读；随 CMP 变更立刻刷新  
- **角色**：`primary` | `secondary`（人工可改；保存时不强制“仅一个 primary”，但 UI 可提示）

### 3.3 Component 选择器（核心）

下拉/列表每一项展示：

```
CMP-33  ·  选择题（传统版）
```

- **序号**：`CMP-XX`
- **名称**：catalog 列 C 中文名（可附列 F 英文名作次要灰色文字）
- **不展示** 列 B「讲解/探索/练习/过渡」类标志

选项范围：当前 script_step 所属 **Phase 的 eligibility 允许列表**。

**原型预览**：

- 每项旁或选中态提供 **「预览」**（眼睛图标）
- 点击打开轻量 lightbox：展示 `master/component_images/` 下该 CMP 的 JPEG
  - 命名约定：优先 `CMP-XX.jpeg`；若无则取 `CMP-XX_1.jpeg`（多图时可左右切换 `_1/_2`）
  - 无图时显示「暂无原型图」+ catalog 模版摘要（E 列前两行）
- 预览 **不改变** 当前选中值；用户确认后再在选择器里选中

### 3.4 Save / Cancel

- **保存**：校验 → 重渲染完整 markdown → `PUT` API → 刷新 Output  
- **取消**：有脏数据则 confirm「放弃未保存修改？」  
- 仅当 N2 状态为 `awaiting_review`（或等价未 Approve）可保存；已 Approve → 只读，提示先 Reject

---

## 4. API

### 4.1 `GET /api/master/components`

返回选择器用元数据（可缓存）：

```ts
{
  components: Array<{
    id: string            // CMP-33
    nameZh: string        // 选择题（传统版）
    nameEn?: string
    keyFields: string     // question, options[], answer
    previewImages: string[] // ["/api/master/component-images/CMP-33.jpeg", ...]
  }>
  phaseAllowed: Record<'P1'|'P2'|'P3'|'P4', string[]>
}
```

### 4.2 `GET /api/master/component-images/:file`

静态服务 `master/component_images/*`（仅允许 `CMP-\\d+(_\\d+)?\\.jpe?g`）。

### 4.3 `PUT /api/missions/:id/artifacts/N2`

```ts
{ content: string } // 完整 v0.3 markdown
```

行为：

1. Mission/N2 必须存在且允许编辑  
2. 轻量校验：可 parse 出 steps；component ∈ phase allowed（失败返回 400 + issues）  
3. 写入最新 Artifact（新 version 或覆盖 latest——**采用新建 version + 更新 latest 指针/按现有 `findFirst orderBy version desc` 约定追加**）  
4. `writeArtifactToDisk` 镜像  
5. 返回更新后的 artifact content

---

## 5. Key fields

集中在 API `keyFieldsFor(cmp)`（与 N2 渲染共用），覆盖常用 CMP；未知 → `display text / assets`。

换组件时：前端用 master 接口返回的 `keyFields` 更新只读列；保存时服务端按最终 CMP 再写一遍，保证落盘一致。

---

## 6. Markdown round-trip

- **Parse**：复用/扩展现有 N2 表格解析（script_step 标题、Phase、Component 表四列）  
- **Render**：复用 `renderV03`（或抽出 `packages`/`apps/api` 共享函数），保证与引擎产出同结构  
- Outline / 角色以编辑器状态为准写入

---

## 7. Frontend pieces

| 文件 | 职责 |
|---|---|
| `components/pipeline/V03EditorModal.vue` | 编辑器壳 + 保存/取消 |
| `components/pipeline/ComponentPicker.vue` | 带类型 badge 的选项 + 预览触发 |
| `components/pipeline/ComponentPreviewLightbox.vue` | 原型图 lightbox |
| `pages/missions/[id]/index.vue` | N2 入口按钮 |
| `utils/v03Parse.ts`（web）或直接吃 API 返回的 structured DTO | 可选：若 PUT 改为 structured body 可简化 |

**可选优化（本迭代可采用）**：`PUT` 同时接受 structured JSON，由服务端 `renderV03`，减少前端拼 markdown 出错。推荐：

```ts
PUT body: { steps: MappedStep[] }
```

服务端 render + validate + persist。前端只维护结构化状态。

---

## 8. Risks / open

| 风险 | 处理 |
|---|---|
| 图片较大（数 MB） | lightbox 懒加载；列表不缩略全部预载 |
| 多图 CMP（`_1/_2`） | lightbox 内切换 |
| 脏数据与 Approve 竞态 | 保存前再读 status；已 Approve 拒绝 |

---

## 9. Acceptance

1. N2 awaiting_review 可打开编辑器，改 CMP 后关键字段立即变化  
2. 选择器可见「CMP-XX · 中文名」，点预览可见对应 JPEG  
3. 点保存后刷新 Output / 磁盘文件一致；不点保存不落盘  
4. 选项仅含该 Phase 允许 CMP  
5. Approve 后不可保存  

---

## 10. Approval

请确认本设计（尤其：structured PUT、预览用 `component_images`、选项文案为「序号 + 中文名」、不用讲解/探索类标志）。确认后进入实现计划与编码。
