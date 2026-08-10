import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import OctopusBuilder from '@/components/OctopusBuilder.vue'
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

describe('OctopusBuilder scenes', () => {
  it('shows the thinking scene with thought bubbles by default', () => {
    const wrapper = mount(OctopusBuilder)
    expect(wrapper.find('.cartoony-builder').exists()).toBe(true)
    expect(wrapper.find('.octo').exists()).toBe(true)
    expect(wrapper.find('.builder-stage--thinking').exists()).toBe(true)
    expect(wrapper.find('.builder-bubble').exists()).toBe(true)
  })

  it('shows the checking scene at the 25% boundary', () => {
    pct.value = 25
    const wrapper = mount(OctopusBuilder)
    expect(wrapper.find('.builder-stage--checking').exists()).toBe(true)
    expect(wrapper.find('.builder-glass').exists()).toBe(true)
  })

  it('swaps to the building scene at the 50% boundary', () => {
    pct.value = 50
    const wrapper = mount(OctopusBuilder)
    expect(wrapper.find('.builder-stage--building').exists()).toBe(true)
    expect(wrapper.find('.octo-hat').exists()).toBe(true)
  })

  it('presents the result at the 75% boundary with the tower fully built', () => {
    pct.value = 75
    const wrapper = mount(OctopusBuilder)
    expect(wrapper.find('.builder-stage--responding').exists()).toBe(true)
    expect(wrapper.findAll('.builder-block.is-visible').length).toBe(8)
    expect(wrapper.find('.builder-flag').exists()).toBe(true)
    expect(wrapper.find('.builder-tada').exists()).toBe(true)
  })
})

describe('OctopusBuilder tower', () => {
  it('stacks the tower block by block as assembling progress grows', async () => {
    await setPct(50)
    const wrapper = mount(OctopusBuilder)
    const visible = () => wrapper.findAll('.builder-block.is-visible').length

    // 1/8 of the stage fills with each step; block n appears when n/8 is reached.
    expect(visible()).toBe(1)
    await setPct(60) // stageProgress(2) = 40% -> blocks 0..3
    expect(visible()).toBe(4)
    await setPct(70) // stageProgress(2) = 80% -> blocks 0..6
    expect(visible()).toBe(7)
    await setPct(100)
    expect(visible()).toBe(8)
  })

  it('keeps the tower down before assembling and reacts to pct changes live', async () => {
    const wrapper = mount(OctopusBuilder)
    expect(wrapper.findAll('.builder-block.is-visible').length).toBe(0)
    await setPct(55)
    expect(wrapper.findAll('.builder-block.is-visible').length).toBeGreaterThan(0)
  })
})
