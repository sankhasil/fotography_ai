import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client'

const DEFAULT_URLS = ['http://localhost:4096']

export interface OpenCodeConnection {
  client: OpencodeClient
  url: string
}

let client: OpencodeClient | null = null
let activeProbe: AbortController | null = null

export function configuredUrls(): string[] {
  const raw = import.meta.env.VITE_OPENCODE_URLS
  const urls = raw
    ? raw
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean)
    : []
  return urls.length > 0 ? urls : DEFAULT_URLS
}

// ponytail: reachability probe is a plain GET to /config with a 2s timeout.
// The SDK has no health endpoint, and treating any HTTP response as reachable
// avoids false negatives on 4xx. Replace with an explicit health endpoint if
// the server ever exposes one.
async function isReachable(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    await fetch(`${url}/config`, { signal })
    return true
  } catch {
    return false
  }
}

function attach(url: string): OpenCodeConnection {
  client = createOpencodeClient({ baseUrl: url })
  return { client, url }
}

export async function connect(): Promise<OpenCodeConnection> {
  disconnect()
  activeProbe = new AbortController()
  for (const url of configuredUrls()) {
    if (activeProbe.signal.aborted) break
    if (await isReachable(url, activeProbe.signal)) {
      return attach(url)
    }
  }
  throw new Error(`No OpenCode console reachable at: ${configuredUrls().join(', ')}`)
}

export async function connectTo(url: string): Promise<OpenCodeConnection> {
  disconnect()
  activeProbe = new AbortController()
  if (await isReachable(url, activeProbe.signal)) {
    return attach(url)
  }
  throw new Error(`OpenCode console not reachable at ${url}`)
}

export function disconnect(): void {
  activeProbe?.abort()
  activeProbe = null
  client = null
}

export async function healthCheck(): Promise<boolean> {
  if (!client) return false
  try {
    await client.config.get()
    return true
  } catch {
    return false
  }
}
