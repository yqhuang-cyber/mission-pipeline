import type { NodeId } from '@mission-pipeline/shared'

/** From pipeline_design.md §2 / §5 — ops + checkpoint for each node */
export type NodeSpec = {
  id: NodeId
  name: string
  artifact: string
  goldPath?: string
  operations: string[]
  checkpoints: string[]
}

export const NODE_SPECS: Record<NodeId, NodeSpec> = {
  N0: {
    id: 'N0',
    name: '准备',
    artifact: 'v0.1 colloquial script',
    operations: [
      '创建 mission',
      '锁定上传的口语化 script',
      '绑定主数据版本',
    ],
    checkpoints: ['script 元信息是否够用', '主数据版本是否正确'],
  },
  N1: {
    id: 'N1',
    name: 'Phase 框架',
    artifact: 'v0.2 phased script',
    goldPath: 'missions/mission_4/v0.2_script_phased.md',
    operations: [
      '按编号/段落切片 script_step',
      '判定 P1–P4',
      '写一句话教学目的',
      '保留原文不改写',
      '建议 component（禁连续≥3 观看）',
      '产出元信息 + Phase 总览 + 词汇清单',
    ],
    checkpoints: [
      'phase 切分是否合理',
      '教学目的是否准确',
      '边界 case（如 Context Story step9 → P2）',
      '建议 component 与连续观看约束',
    ],
  },
  N2: {
    id: 'N2',
    name: 'Component 映射定稿',
    artifact: 'v0.3 stepped script',
    goldPath: 'missions/mission_4/v0.3_step_component_map.md',
    operations: [
      '以 N1 建议为起点定稿 component',
      '标注 primary/secondary',
      '标注关键字段 + content outline',
      'N>1 时按组件职责切分 Content outline（禁整段同文）',
      'enforcement 校验',
    ],
    checkpoints: [
      '每个 script_step 的 component 是否合适',
      '多 component 挂载是否合理',
      '多挂时各行 Content outline 是否已切分',
      'enforcement 是否过严/过松',
    ],
  },
  N3: {
    id: 'N3',
    name: 'Content 填充',
    artifact: 'v0.4 component content',
    goldPath: 'missions/mission_4/v0.4_component_content_p1.md',
    operations: [
      '按 1 Component = 1 Step 填 13 字段（meta model v0.4.4）',
      'Display Text 按 catalog E 列（【】待补 / [] NA）',
      'Image/Video 留空给 CD',
      'Kai 开场/互动/反馈/收尾；按 K/L 判断互动',
      '按 phase 拆 4 文件',
    ],
    checkpoints: [
      'Display Text 模版 / 【】非 NA',
      'Kai 时间线与互动字段',
      'Knowledge point',
      'Image/Video 可空',
    ],
  },
  N4: {
    id: 'N4',
    name: 'Spec 导出',
    artifact: 'v0.5 mission spec',
    goldPath: 'missions/mission_4/v0.5_mission_spec.xlsx',
    operations: [
      'v0.4 → xlsx/csv（mission_spec_schema 13 列）',
      '合并 Phase / Script Step / Step / Component',
    ],
    checkpoints: [
      '字段对齐 schema',
      'Display Text / [待补]',
      'Image/Video 可空',
    ],
  },
  N5: {
    id: 'N5',
    name: '产品喂入',
    artifact: 'product preview',
    operations: ['导入产品', '渲染预览', '整课走读'],
    checkpoints: [
      '教学体验流畅',
      '资产齐全',
      'component 行为正确',
      'Display Text 与预览一致',
    ],
  },
}

/** 观看类 component — 不得连续 ≥3 */
export const WATCH_COMPONENTS = new Set([
  'CMP-03',
  'CMP-05',
  'CMP-09',
  'CMP-23',
])
