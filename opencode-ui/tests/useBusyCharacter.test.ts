import { describe, expect, it } from 'vitest'

import { characterForModel } from '@/composables/useBusyCharacter'

describe('characterForModel', () => {
  it('maps each model family to its mascot', () => {
    expect(characterForModel('big-pickle')).toBe('pickle-rick')
    expect(characterForModel('laguna-s-2.1-free')).toBe('octopus')
    expect(characterForModel('north-mini-code-free')).toBe('penguin')
    expect(characterForModel('deepseek-v4-flash-free')).toBe('dolphin')
  })

  it('matches model-id variants (e.g. provider-prefixed ids)', () => {
    expect(characterForModel('opencode/laguna-xs-2.1')).toBe('octopus')
    expect(characterForModel('deepseek/deepseek-v4-pro')).toBe('dolphin')
  })

  it('falls back to the stick figure for unknown or missing models', () => {
    expect(characterForModel('some-other-model')).toBe('stick-figure')
    expect(characterForModel(null)).toBe('stick-figure')
    expect(characterForModel(undefined)).toBe('stick-figure')
  })
})
