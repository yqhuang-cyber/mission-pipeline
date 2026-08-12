import type { DecisionCreate } from '@mission-pipeline/shared'
import type { NodeEngineResult } from './n1.js'

/** N5: product ingest checklist (webhook 后续接) */
export async function runN5(input: {
  missionName: string
  v05Summary: string
}): Promise<NodeEngineResult> {
  const content = [
    `# ${input.missionName} — product preview`,
    ``,
    `> **状态**: 本地 Runner 阶段 — 请人工导入 v0.5_mission_spec.xlsx 到产品并走读`,
    `> **输入摘要**:`,
    ``,
    input.v05Summary.slice(0, 3000),
    ``,
    `## 走读检查清单（Checkpoint）`,
    ``,
    `- [ ] 教学体验是否流畅`,
    `- [ ] 资产（音频/图片/视频）是否齐全`,
    `- [ ] component 行为是否符合预期`,
    `- [ ] Display Text 实际渲染是否匹配预期`,
    ``,
    `## 回写`,
    `若走读失败：Reject 本节点，并决定回退 N2（换 component）或 N3（改文案/字段）。`,
  ].join('\n')

  const decisions: DecisionCreate[] = [
    {
      node: 'N5',
      targetType: 'mission',
      type: 'confirm',
      severity: 'blocking',
      question: 'Checkpoint：是否已在产品端完成整课走读且体验可接受？',
      options: [
        { id: 'pass', label: '走读通过，可以 Approve', recommended: true },
        { id: 'fail_n3', label: '失败 → 回 N3 改内容' },
        { id: 'fail_n2', label: '失败 → 回 N2 改 component' },
      ],
      aiRationale: 'pipeline_design N5 Checkpoint',
    },
  ]

  return {
    content,
    decisions,
    meta: { provider: 'checklist' },
  }
}
