import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ToolPart } from '@opencode-ai/sdk/client'

import UiSpinner from '@/components/ui/UiSpinner.vue'
import ToolCard from '@/components/tool/ToolCard.vue'

function part(state: ToolPart['state']): ToolPart {
  return { id: 't1', sessionID: 's1', messageID: 'm1', type: 'tool', callID: 'c1', tool: 'bash', state }
}

const pending: ToolPart['state'] = { status: 'pending', input: { command: 'ls' }, raw: '{}' }
const running: ToolPart['state'] = {
  status: 'running',
  input: { command: 'ls' },
  title: 'ls',
  time: { start: 1 },
}
const completed: ToolPart['state'] = {
  status: 'completed',
  input: { command: 'ls' },
  output: 'done\nExit code: 0',
  title: 'ls',
  metadata: {},
  time: { start: 1, end: 2 },
}
const failed: ToolPart['state'] = {
  status: 'error',
  input: { command: 'ls' },
  error: 'boom',
  time: { start: 1, end: 2 },
}

describe('ToolCard', () => {
  it('shows a spinner and pending badge while waiting', () => {
    const wrapper = mount(ToolCard, { props: { part: part(pending) } })
    expect(wrapper.text()).toContain('pending')
    expect(wrapper.findComponent(UiSpinner).exists()).toBe(true)
  })

  it('shows the running title and a spinner', () => {
    const wrapper = mount(ToolCard, { props: { part: part(running) } })
    expect(wrapper.text()).toContain('running')
    expect(wrapper.text()).toContain('ls')
    expect(wrapper.findComponent(UiSpinner).exists()).toBe(true)
  })

  it('shows success, the exit code and output for completed tools', () => {
    const wrapper = mount(ToolCard, { props: { part: part(completed) } })
    expect(wrapper.text()).toContain('success')
    expect(wrapper.text()).toContain('exit 0')
    expect(wrapper.text()).toContain('done')
  })

  it('shows the error message', () => {
    const wrapper = mount(ToolCard, { props: { part: part(failed) } })
    expect(wrapper.text()).toContain('error')
    expect(wrapper.text()).toContain('boom')
  })

  it('renders call arguments generically', () => {
    const wrapper = mount(ToolCard, { props: { part: part(completed) } })
    expect(wrapper.text()).toContain('command: ls')
  })
})
