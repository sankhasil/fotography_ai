import { describe, it, expect } from 'vitest'
import {
  extractToolCalls,
  parseToolCalls,
  wantsToolCall,
  lastUserText,
} from '../tools/ollama-tool-call-proxy.mjs'

const tools = [{ function: { name: 'write_file' } }, { function: { name: 'run_command' } }]

describe('lastUserText', () => {
  it('returns the latest user message text', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ]
    expect(lastUserText(messages)).toBe('second')
  })

  it('handles multimodal content-part arrays', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image', image_url: {} }] }]
    expect(lastUserText(messages)).toBe('hi')
  })

  it('returns empty string when there is no user message', () => {
    expect(lastUserText([{ role: 'assistant', content: 'x' }])).toBe('')
  })
})

describe('wantsToolCall', () => {
  it('is false when no tools are offered', () => {
    expect(wantsToolCall({ messages: [{ role: 'user', content: 'write a file' }] })).toBe(false)
  })

  it('is true when the user names an offered tool', () => {
    expect(wantsToolCall({ tools, messages: [{ role: 'user', content: 'use the write_file tool' }] })).toBe(true)
  })

  it('is true on a directive verb like "write"', () => {
    expect(wantsToolCall({ tools, messages: [{ role: 'user', content: 'write the README' }] })).toBe(true)
  })

  it('is false on plain chat', () => {
    expect(wantsToolCall({ tools, messages: [{ role: 'user', content: 'how are you today?' }] })).toBe(false)
  })
})

describe('extractToolCalls', () => {
  it('returns nothing for plain prose', () => {
    expect(extractToolCalls('just chatting, no json here')).toEqual([])
  })

  it('extracts a bare tool-call object', () => {
    const calls = extractToolCalls('{"name":"write_file","arguments":{"path":"a.txt","content":"x"}}')
    expect(calls).toEqual([{ name: 'write_file', arguments: '{"path":"a.txt","content":"x"}' }])
  })

  it('extracts a tool call embedded in prose', () => {
    const text = 'Sure, here you go:\n{"name":"run_command","arguments":{"cmd":"ls"}}\ndone.'
    const calls = extractToolCalls(text)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('run_command')
  })

  it('extracts a tool call from a fenced json block', () => {
    const text = '```json\n{"name":"write_file","arguments":{"path":"b.txt"}}\n```'
    const calls = extractToolCalls(text)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('write_file')
  })

  it('extracts multiple tool calls in one reply', () => {
    const text =
      '{"name":"write_file","arguments":{"path":"a"}} and {"name":"run_command","arguments":{"cmd":"echo hi"}}'
    const calls = extractToolCalls(text)
    expect(calls.map((c) => c.name)).toEqual(['write_file', 'run_command'])
  })

  it('keeps arguments as a string when already a string', () => {
    const calls = extractToolCalls('{"name":"x","arguments":"{\\"raw\\":true}"}')
    expect(calls[0].arguments).toBe('{"raw":true}')
  })

  it('skips objects that are not tool calls', () => {
    const text = 'noise {"foo":"bar"} then {"name":"write_file","arguments":{}}'
    const calls = extractToolCalls(text)
    expect(calls).toEqual([{ name: 'write_file', arguments: '{}' }])
  })
})

describe('parseToolCalls', () => {
  it('returns empty for empty input', () => {
    expect(parseToolCalls('')).toEqual([])
  })

  it('strips fences before delegating', () => {
    expect(parseToolCalls('```json\n{"name":"write_file","arguments":{}}\n```')).toHaveLength(1)
  })
})
