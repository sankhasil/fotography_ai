import Database from "better-sqlite3"
import type { BackendStatus, Event, Session, Task, TokenUsage } from "./types.js"

export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = OFF")

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      port INTEGER NOT NULL,
      backend TEXT NOT NULL,
      status TEXT NOT NULL,
      directory TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      tag TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      tag TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backend_status (
      backend TEXT PRIMARY KEY,
      available INTEGER NOT NULL DEFAULT 1,
      reason TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      task_id TEXT REFERENCES tasks(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS context_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      summary TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT REFERENCES tasks(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      relevance REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      accessed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_task ON conversations(task_id);
    CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
    CREATE INDEX IF NOT EXISTS idx_memory_task ON memory(task_id);
  `)

  return db
}

export type { Database }

export function insertSession(db: Database.Database, session: Session): void {
  db.prepare(`
    INSERT INTO sessions (id, port, backend, status, directory, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session.id, session.port, session.backend, session.status, session.directory, session.created_at)
}

export function updateSessionStatus(db: Database.Database, id: string, status: string): void {
  db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id)
}

export function getSessionsByBackend(db: Database.Database, backend: string): Session[] {
  return db.prepare("SELECT * FROM sessions WHERE backend = ?").all(backend) as Session[]
}

export function getActiveSessionCount(db: Database.Database): number {
  const row = db.prepare("SELECT count(*) as count FROM sessions WHERE status IN ('ready', 'busy')").get() as { count: number }
  return row.count
}

export function deleteSession(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id)
}

export function insertTask(db: Database.Database, task: Task): void {
  db.prepare(`
    INSERT INTO tasks (id, session_id, tag, prompt, status, tokens_used, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.session_id, task.tag, task.prompt, task.status, task.tokens_used, task.created_at, task.completed_at)
}

export function updateTaskStatus(db: Database.Database, id: string, status: string): void {
  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id)
}

export function updateTaskSession(db: Database.Database, id: string, session_id: string): void {
  db.prepare("UPDATE tasks SET session_id = ? WHERE id = ?").run(session_id, id)
}

export function getPendingTasks(db: Database.Database): Task[] {
  return db.prepare("SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at").all() as Task[]
}

export function getTasksByStatus(db: Database.Database, status: string): Task[] {
  return db.prepare("SELECT * FROM tasks WHERE status = ?").all(status) as Task[]
}

export function getTasksByTag(db: Database.Database, tag: string): Task[] {
  return db.prepare("SELECT * FROM tasks WHERE tag = ?").all(tag) as Task[]
}

export function insertTokenUsage(db: Database.Database, session_id: string, tag: string, tokens: number): void {
  db.prepare(`
    INSERT INTO token_usage (session_id, tag, tokens, recorded_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(session_id, tag, tokens)
}

export function getTokenUsageByTag(db: Database.Database, tag: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(tokens), 0) as total
    FROM token_usage
    WHERE tag = ? AND recorded_at > datetime('now', '-1 hour')
  `).get(tag) as { total: number }
  return row.total
}

export function getTotalTokenUsage(db: Database.Database, tag: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(tokens), 0) as total
    FROM token_usage
    WHERE tag = ?
  `).get(tag) as { total: number }
  return row.total
}

export function setBackendStatus(db: Database.Database, backend: string, available: boolean, reason: string | null): void {
  db.prepare(`
    INSERT OR REPLACE INTO backend_status (backend, available, reason, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(backend, available ? 1 : 0, reason)
}

export function getBackendStatus(db: Database.Database, backend: string): BackendStatus | undefined {
  return db.prepare("SELECT * FROM backend_status WHERE backend = ?").get(backend) as BackendStatus | undefined
}

export function isBackendAvailable(db: Database.Database, backend: string): boolean {
  const status = getBackendStatus(db, backend)
  if (!status) return true
  return Boolean(status.available)
}

export function insertEvent(db: Database.Database, session_id: string | null, event_type: string, payload: string | null): void {
  db.prepare(`
    INSERT INTO events (session_id, event_type, payload, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(session_id, event_type, payload)
}

export function getRecentEvents(db: Database.Database, limit: number): Event[] {
  return db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?").all(limit) as Event[]
}

export function insertConversation(db: Database.Database, conversation: { id: string; session_id: string; task_id: string; role: string; content: string; tokens: number }): void {
  db.prepare(`
    INSERT INTO conversations (id, session_id, task_id, role, content, tokens, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(conversation.id, conversation.session_id, conversation.task_id, conversation.role, conversation.content, conversation.tokens)
}

export function getConversationsBySession(db: Database.Database, sessionId: string): Array<{ id: string; role: string; content: string; tokens: number; created_at: string }> {
  return db.prepare("SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at").all(sessionId) as Array<{ id: string; role: string; content: string; tokens: number; created_at: string }>
}

export function getConversationsByTask(db: Database.Database, taskId: string): Array<{ id: string; role: string; content: string; tokens: number; created_at: string }> {
  return db.prepare("SELECT * FROM conversations WHERE task_id = ? ORDER BY created_at").all(taskId) as Array<{ id: string; role: string; content: string; tokens: number; created_at: string }>
}

export function insertContextSummary(db: Database.Database, sessionId: string, summary: string, tokens: number): void {
  db.prepare(`
    INSERT INTO context_summaries (session_id, summary, tokens, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(sessionId, summary, tokens)
}

export function getContextSummaries(db: Database.Database, sessionId: string): Array<{ summary: string; tokens: number; created_at: string }> {
  return db.prepare("SELECT * FROM context_summaries WHERE session_id = ? ORDER BY created_at").all(sessionId) as Array<{ summary: string; tokens: number; created_at: string }>
}

export function insertMemory(db: Database.Database, taskId: string, key: string, value: string, relevance: number = 1.0): void {
  db.prepare(`
    INSERT INTO memory (task_id, key, value, relevance, created_at, accessed_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(taskId, key, value, relevance)
}

export function searchMemory(db: Database.Database, key: string): Array<{ id: number; task_id: string; key: string; value: string; relevance: number; created_at: string; accessed_at: string }> {
  return db.prepare("SELECT * FROM memory WHERE key = ? ORDER BY relevance DESC, accessed_at DESC").all(key) as Array<{ id: number; task_id: string; key: string; value: string; relevance: number; created_at: string; accessed_at: string }>
}

export function updateMemoryAccess(db: Database.Database, id: number): void {
  db.prepare("UPDATE memory SET accessed_at = datetime('now'), relevance = relevance * 0.9 WHERE id = ?").run(id)
}

export function getRecentMemory(db: Database.Database, limit: number): Array<{ id: number; task_id: string; key: string; value: string; relevance: number; created_at: string; accessed_at: string }> {
  return db.prepare("SELECT * FROM memory ORDER BY accessed_at DESC LIMIT ?").all(limit) as Array<{ id: number; task_id: string; key: string; value: string; relevance: number; created_at: string; accessed_at: string }>
}
