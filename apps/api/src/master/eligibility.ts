/** Phase ↔ Component eligibility
 *
 * NOTE (2026-08-11): Phase 组件白名单限制已关闭 — 全部 CMP 在 P1–P4 均可选用。
 * 参考文档仍保留在 master/phase_component_eligibility_v0.2.md（历史选型建议，不再强制）。
 */

export type PhaseId = 'P1' | 'P2' | 'P3' | 'P4'

/** Catalog 全量 CMP-01 … CMP-37 */
export const ALL_CATALOG_CMP_IDS: string[] = Array.from(
  { length: 37 },
  (_, i) => `CMP-${String(i + 1).padStart(2, '0')}`,
)

/** 每 Phase 允许的组件 = 全量（限制已去掉） */
export const PHASE_ALLOWED: Record<PhaseId, string[]> = {
  P1: [...ALL_CATALOG_CMP_IDS],
  P2: [...ALL_CATALOG_CMP_IDS],
  P3: [...ALL_CATALOG_CMP_IDS],
  P4: [...ALL_CATALOG_CMP_IDS],
}

export const COMPONENT_NAMES: Record<string, string> = {
  'CMP-01': '课前寒暄',
  'CMP-02': '互动选择',
  'CMP-03': '视频播放',
  'CMP-04': 'Mission 发布',
  'CMP-05': '视频文字讲解',
  'CMP-07': '句型学习',
  'CMP-08': '听音跟读',
  'CMP-09': '全屏大图',
  'CMP-11': '句型观察',
  'CMP-13': '单项选择',
  'CMP-15': '角色扮演对话',
  'CMP-33': '选择题（传统版）',
  'CMP-18': 'AI Mission Setup',
  'CMP-19': 'AI 开放任务对话',
  'CMP-21': '关键表达回顾',
  'CMP-22': '下集预告',
  'CMP-26': '关键表达回顾(alt)',
  'CMP-28': '信心自评',
  'CMP-29': '词汇学习',
  'CMP-32': '学习目标',
  'CMP-36': '成就页',
}

/** Template = 无 → Display Text must be NA */
export const DISPLAY_TEXT_NA_COMPONENTS = new Set([
  'CMP-01',
  'CMP-03',
  'CMP-09',
  'CMP-23',
])

export function defaultComponentsForPhase(phase: PhaseId): string[] {
  switch (phase) {
    case 'P1':
      return ['CMP-01', 'CMP-04']
    case 'P2':
      return ['CMP-29', 'CMP-13']
    case 'P3':
      return ['CMP-18', 'CMP-19']
    case 'P4':
      return ['CMP-21', 'CMP-22']
  }
}

/** Phase 限制已关闭：任意 phase 可用任意 catalog component */
export function isAllowed(_phase: PhaseId, _cmp: string): boolean {
  return true
}
