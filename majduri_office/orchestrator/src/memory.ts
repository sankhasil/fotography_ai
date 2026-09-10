import type Database from "better-sqlite3"
import { insertConversation, getConversationsBySession, insertContextSummary, getContextSummaries, insertMemory, searchMemory, updateMemoryAccess, getRecentMemory } from "./db.js"
import { generateId } from "./utils.js"

export class MemoryManager {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async saveMessage(sessionId: string, taskId: string, role: string, content: string): Promise<void> {
    const tokens = this.estimateTokens(content)
    insertConversation(this.db, {
      id: generateId(),
      session_id: sessionId,
      task_id: taskId,
      role,
      content,
      tokens,
    })
  }

  async getConversationHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const conversations = getConversationsBySession(this.db, sessionId)
    return conversations.map((c) => ({ role: c.role, content: c.content }))
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    const tokens = this.estimateTokens(summary)
    insertContextSummary(this.db, sessionId, summary, tokens)
  }

  async getSummaries(sessionId: string): Promise<string[]> {
    const summaries = getContextSummaries(this.db, sessionId)
    return summaries.map((s) => s.summary)
  }

  async storeMemory(taskId: string, key: string, value: string): Promise<void> {
    insertMemory(this.db, taskId, key, value)
  }

  async recallMemory(key: string): Promise<Array<{ value: string; relevance: number }>> {
    const memories = searchMemory(this.db, key)
    for (const memory of memories) {
      updateMemoryAccess(this.db, memory.id)
    }
    return memories.map((m) => ({ value: m.value, relevance: m.relevance }))
  }

  async getRecentMemories(limit: number = 10): Promise<Array<{ key: string; value: string }>> {
    const memories = getRecentMemory(this.db, limit)
    return memories.map((m) => ({ key: m.key, value: m.value }))
  }

  async pruneContext(sessionId: string, maxTokens: number = 4000): Promise<void> {
    const conversations = getConversationsBySession(this.db, sessionId)
    let totalTokens = conversations.reduce((sum, c) => sum + c.tokens, 0)

    if (totalTokens <= maxTokens) return

    const summaries = getContextSummaries(this.db, sessionId)
    const summaryTokens = summaries.reduce((sum, s) => sum + s.tokens, 0)

    if (summaryTokens > maxTokens * 0.5) {
      const oldestSummary = summaries[0]
      if (oldestSummary) {
        await this.saveSummary(sessionId, `Pruned: ${oldestSummary.summary}`)
      }
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }
}
