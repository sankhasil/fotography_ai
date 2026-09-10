import { randomUUID } from "node:crypto"
import { freemem, totalmem } from "node:os"

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retry<T>(fn: () => T, maxAttempts: number, delayMs: number): T {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return fn()
    } catch (err) {
      lastError = err as Error
      if (attempt < maxAttempts - 1) {
        const waitMs = delayMs * (attempt + 1)
        const start = Date.now()
        while (Date.now() - start < waitMs) {}
      }
    }
  }
  throw lastError
}

export function getFreeMemoryMB(): number {
  return Math.floor(freemem() / 1024 / 1024)
}

export function getTotalMemoryMB(): number {
  return Math.floor(totalmem() / 1024 / 1024)
}

export function generateId(): string {
  return randomUUID()
}

export function timestamp(): string {
  return new Date().toISOString()
}
