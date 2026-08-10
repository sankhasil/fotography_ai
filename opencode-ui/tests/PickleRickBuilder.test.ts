import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import PickleRickBuilder from '@/components/PickleRickBuilder.vue'
import { pct } from '@/composables/useTaskPct'

// Drives the component through the shared clock by setting pct directly
// (module-level state; reset per test to avoid leakage between cases).
beforeEach(() => {
  pct.value = 0
})

async function setPct(value: number): Promise<void> {
  pct.value = value
  await nextTick()
}

describe('PickleRickBuilder', () => {
  it('renders the pickle figure with its face and lab-coat arms', () => {
    const wrapper = mount(PickleRickBuilder)
    expect(wrapper.find('.cartoony-builder').exists()).toBe(true)
    expect(wrapper.find('.pickle-rick').exists()).toBe(true)
    expect(wrapper.find('.pickle-glass').exists()).toBe(true)
    expect(wrapper.find('.pickle-grin').exists()).toBe(true)
    expect(wrapper.find('.pickle-arm').exists()).toBe(true)
    expect(wrapper.find('.builder-stage--thinking').exists()).toBe(true)
  })

  it('wears the hard hat while building', async () => {
    await setPct(50)
    const wrapper = mount(PickleRickBuilder)
    expect(wrapper.find('.builder-stage--building').exists()).toBe(true)
    expect(wrapper.find('.pickle-hat').exists()).toBe(true)
  })
})
