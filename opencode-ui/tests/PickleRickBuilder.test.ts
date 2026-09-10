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
  it('renders the pickle figure with the image head and its attached bubble', () => {
    const wrapper = mount(PickleRickBuilder)
    expect(wrapper.find('.cartoony-builder').exists()).toBe(true)
    expect(wrapper.find('.pickle-rick--head').exists()).toBe(true)
    expect(wrapper.find('.pickle-upper').exists()).toBe(true)
    expect(wrapper.find('.pickle-head').exists()).toBe(true)
    expect(wrapper.find('.pickle-bubble').exists()).toBe(true)
    expect(wrapper.find('.pickle-arm').exists()).toBe(true)
    expect(wrapper.find('.builder-stage--thinking').exists()).toBe(true)
  })

  it('wears the hard hat while building', async () => {
    await setPct(50)
    const wrapper = mount(PickleRickBuilder)
    expect(wrapper.find('.builder-stage--building').exists()).toBe(true)
    expect(wrapper.find('.pickle-hat').exists()).toBe(true)
  })

  it('switches the head scene through every progress phase', async () => {
    await setPct(10)
    expect(mount(PickleRickBuilder).find('.builder-stage--thinking').exists()).toBe(true)
    await setPct(30)
    expect(mount(PickleRickBuilder).find('.builder-stage--checking').exists()).toBe(true)
    await setPct(60)
    expect(mount(PickleRickBuilder).find('.builder-stage--building').exists()).toBe(true)
    await setPct(90)
    expect(mount(PickleRickBuilder).find('.builder-stage--responding').exists()).toBe(true)
  })
})
