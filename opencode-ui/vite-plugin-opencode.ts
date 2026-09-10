import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

import type { Plugin } from 'vite'

// ponytail: the `opencode` binary is resolved from PATH. The open-code console
// project (../open-code) holds the npm package, so we prepend its bin dir to
// PATH when the binary is not already available. Limitation: PATH mutation is
// a global process side effect and spawning is dev-only. Upgrade path: teach
// the SDK to accept an explicit binary path.
const CONSOLE_DIR = process.env.OPENCODE_CONSOLE_DIR ?? resolve(import.meta.dirname, '../open-code')

// ponytail: the console writes structured logs (level=INFO/ERROR) to its own
// global log file, which is outside the repo and mixed with other sessions.
// We respawn with --print-logs and route the stderr lines into logs/info and
// logs/error beside the UI. The folder exists only while the spawned server is
// running and is removed when it stops. Upgrade path: a native log-dir option
// in the console would remove the manual routing.
const LOG_DIR = join(import.meta.dirname, 'logs')

let spawned: { url: string; close(): void } | null = null
let proxyProc: ReturnType<typeof spawn> | null = null
let proxyRestartTimer: ReturnType<typeof setTimeout> | null = null

function log(message: string) {
  console.error(`[opencode-plugin] ${message}`)
}

// ponytail: the tool-call proxy is a plain node process owned by the dev server.
// It dies with vite, which is acceptable because it only serves the qwen2.5-coder
// model via opencode. On unexpected exit it restarts once after a short delay to
// survive transient port conflicts. Revisit if the proxy needs to outlive the UI
// (e.g. CLI usage) — then run it via `npm run ollama-proxy`.
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createConnection({ port, host: '127.0.0.1' })
      .on('connect', () => { server.destroy(); resolve(true) })
      .on('error', () => resolve(false))
  })
}

async function spawnProxy() {
  if (proxyProc) return
  if (await isPortInUse(4198)) {
    log('proxy port 4198 already in use, skipping spawn')
    return
  }
  const script = join(import.meta.dirname, 'tools', 'ollama-tool-call-proxy.mjs')
  proxyProc = spawn(process.execPath, [script], {
    env: process.env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  proxyProc.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk)
  })
  proxyProc.on('exit', (code) => {
    proxyProc = null
    if (code !== null && code !== 0 && !proxyRestartTimer) {
      log(`proxy exited with code ${code}, restarting in 1s`)
      proxyRestartTimer = setTimeout(() => {
        proxyRestartTimer = null
        spawnProxy()
      }, 1000)
    }
  })
  proxyProc.on('error', (err) => {
    log(`proxy spawn error: ${err.message}`)
    proxyProc = null
  })
}

function isOnPath(dir: string): boolean {
  return (process.env.PATH ?? '')
    .split(':')
    .some((entry) => resolve(entry) === resolve(dir))
}

function createLogRouter() {
  const info = createWriteStream(join(LOG_DIR, 'info', 'opencode.log'), { flags: 'a' })
  const error = createWriteStream(join(LOG_DIR, 'error', 'opencode.log'), { flags: 'a' })
  let buffer = ''
  const writeLine = (line: string) => {
    if (/\blevel=(ERROR|FATAL)\b/.test(line)) {
      error.write(`${line}\n`)
    } else {
      info.write(`${line}\n`)
    }
  }
  return {
    write(chunk: string) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) writeLine(line)
    },
    close() {
      if (buffer.trim()) writeLine(buffer)
      info.end()
      error.end()
    },
  }
}

async function spawnServer(): Promise<{ url: string; close(): void }> {
  rmSync(LOG_DIR, { recursive: true, force: true })
  mkdirSync(join(LOG_DIR, 'info'), { recursive: true })
  mkdirSync(join(LOG_DIR, 'error'), { recursive: true })

  const proc = spawn(
    'opencode',
    ['serve', '--hostname=127.0.0.1', '--port=4096', '--print-logs'],
    {
      env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify({}) },
    },
  )
  const logs = createLogRouter()
  proc.stdout?.on('data', (chunk) => logs.write(chunk.toString()))
  proc.stderr?.on('data', (chunk) => logs.write(chunk.toString()))

  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    logs.close()
    rmSync(LOG_DIR, { recursive: true, force: true })
  }
  proc.on('exit', () => {
    // ponytail: null the cached server so the next /opencode-resolve respawns
    // instead of returning a dead URL. Concurrent spawns are not a concern in
    // this dev-only plugin.
    spawned = null
    cleanup()
  })
  proc.on('error', cleanup)

  try {
    const url = await new Promise<string>((resolveUrl, reject) => {
      const id = setTimeout(() => {
        proc.kill()
        reject(new Error(`Timeout waiting for server to start after 5000ms`))
      }, 5000)
      let output = ''
      proc.stdout?.on('data', (chunk) => {
        output += chunk.toString()
        for (const line of output.split('\n')) {
          if (line.startsWith('opencode server listening')) {
            const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
            if (!match) {
              proc.kill()
              reject(new Error(`Failed to parse server url from output: ${line}`))
              return
            }
            clearTimeout(id)
            resolveUrl(match[1])
            return
          }
        }
      })
      proc.on('exit', (code) => reject(new Error(`Server exited with code ${code}`)))
      proc.on('error', reject)
    })
    return {
      url,
      close() {
        proc.kill()
        cleanup()
      },
    }
  } catch (error) {
    cleanup()
    throw error
  }
}

async function ensureServer(): Promise<{ url: string }> {
  if (spawned) return { url: spawned.url }
  const binDir = join(CONSOLE_DIR, 'node_modules', '.bin')
  if (existsSync(binDir) && !isOnPath(binDir)) {
    process.env.PATH = `${binDir}:${process.env.PATH}`
  }
  spawned = await spawnServer()
  return { url: spawned.url }
}

export function opencodeDevFallback(): Plugin {
  return {
    name: 'opencode-dev-fallback',
    apply: 'serve',
    configureServer(server) {
      void spawnProxy()
      server.middlewares.use('/opencode-resolve', async (_req, res) => {
        try {
          const { url } = await ensureServer()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ url }))
        } catch (error) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: String(error) }))
        }
      })
      server.httpServer?.on('close', () => {
        spawned?.close()
        if (proxyRestartTimer) clearTimeout(proxyRestartTimer)
        proxyProc?.kill()
      })
      // ponytail: fallback for shutdown paths where the http server close event
      // does not fire (e.g. crash); close() is idempotent.
      process.on('exit', () => {
        spawned?.close()
        if (proxyRestartTimer) clearTimeout(proxyRestartTimer)
        proxyProc?.kill()
      })
    },
  }
}
