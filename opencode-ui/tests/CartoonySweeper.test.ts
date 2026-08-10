import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import CartoonySweeper from '@/components/CartoonySweeper.vue'
import type { BusyCharacter } from '@/composables/useBusyCharacter'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

// The sweeper Teleports to <body>, so assert against the DOM rather than the
// wrapper's (empty) element.
function mounted(character: BusyCharacter) {
  return mount(CartoonySweeper, { props: { visible: true, character } })
}

describe('CartoonySweeper', () => {
  it('renders the matching mascot for every busy character', () => {
    const selectorByCharacter: Array<[BusyCharacter, string]> = [
      ['octopus', '.octo'],
      ['pickle-rick', '.pickle-rick'],
      ['penguin', '.penguin'],
      ['dolphin', '.dolphin'],
      ['stick-figure', '.stick'],
    ]

    for (const [character, selector] of selectorByCharacter) {
      const wrapper = mounted(character)
      expect(document.body.querySelector(selector)).not.toBeNull()
      wrapper.unmount()
    }
  })

  it('shows the broom, trash bin and documents while sweeping', () => {
    mounted('octopus')
    expect(document.body.querySelector('.cartoony-sweeper')).not.toBeNull()
    expect(document.body.querySelector('.cartoony-sweeper__broom')).not.toBeNull()
    expect(document.body.querySelector('.cartoony-sweeper__bin')).not.toBeNull()
    expect(document.body.querySelectorAll('.cartoony-sweeper__doc').length).toBe(4)
  })

  it('plays the wipe once and emits done when the animation completes', async () => {
    vi.useFakeTimers()
    const wrapper = mounted('penguin')
    expect(wrapper.emitted('done')).toBeUndefined()

    vi.advanceTimersByTime(2400)
    await nextTick()
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(document.body.querySelector('.cartoony-sweeper')).toBeNull()
  })

  it('stays hidden while not sweeping', () => {
    mount(CartoonySweeper, { props: { visible: false, character: 'stick-figure' } })
    expect(document.body.querySelector('.cartoony-sweeper')).toBeNull()
  })
})
