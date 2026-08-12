import { describe, expect, it } from 'vitest'
import { NODE_IDS, nextNode, artifactLabel } from '@mission-pipeline/shared'

describe('shared domain', () => {
  it('orders nodes N0..N5', () => {
    expect(NODE_IDS).toEqual(['N0', 'N1', 'N2', 'N3', 'N4', 'N5'])
    expect(nextNode('N0')).toBe('N1')
    expect(nextNode('N5')).toBeNull()
  })

  it('labels mission spec artifact', () => {
    expect(artifactLabel('N4')).toBe('v0.5 mission spec')
    expect(artifactLabel('N2')).toBe('v0.3 stepped script')
  })
})
