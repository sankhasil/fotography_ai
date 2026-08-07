import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DiffViewer from '@/components/DiffViewer.vue'

function diff(before: string, after: string, additions: number, deletions: number) {
  return { file: 'a.txt', before, after, additions, deletions }
}

describe('DiffViewer', () => {
  it('renders the file header with add/remove counts', () => {
    const wrapper = mount(DiffViewer, {
      props: { diff: diff('one\ntwo\nthree', 'one\nTWO\nthree\nfour', 2, 1) },
    })
    const text = wrapper.text()
    expect(text).toContain('a.txt')
    expect(text).toContain('+2')
    expect(text).toContain('-1')
  })

  it('marks added, removed and context lines', () => {
    const wrapper = mount(DiffViewer, {
      props: { diff: diff('one\ntwo\nthree', 'one\nTWO\nthree\nfour', 2, 1) },
    })
    const text = wrapper.text()
    expect(text).toContain('one')
    expect(text).toContain('two')
    expect(text).toContain('TWO')
    expect(text).toContain('four')
  })

  it('falls back to whole-file blocks for very large diffs', () => {
    const before = Array.from({ length: 1500 }, (_, i) => `b${i}`).join('\n')
    const after = Array.from({ length: 1500 }, (_, i) => `a${i}`).join('\n')
    const wrapper = mount(DiffViewer, {
      props: { diff: diff(before, after, 1500, 1500) },
    })
    const text = wrapper.text()
    expect(text).toContain('b0')
    expect(text).toContain('a0')
  })
})
