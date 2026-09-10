import React, { useState, useEffect } from "react"
import { Box, Text } from "ink"
import type Database from "better-sqlite3"
import { getSessionsByBackend } from "../db.js"

interface SessionSwitcherProps {
  db: Database.Database
  currentSessionId: string | null
  onSelect: (sessionId: string) => void
}

export function SessionSwitcher({ db, currentSessionId, onSelect }: SessionSwitcherProps) {
  const [sessions, setSessions] = useState<Array<{ id: string; port: number; backend: string; status: string }>>([])

  useEffect(() => {
    const localSessions = getSessionsByBackend(db, "local")
    const zenSessions = getSessionsByBackend(db, "zen")
    setSessions([...localSessions, ...zenSessions])
  }, [db])

  if (sessions.length === 0) {
    return (
      <Box>
        <Text color="gray">No active sessions</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Active Sessions:
      </Text>
      {sessions.map((session) => (
        <Box key={session.id}>
          <Text
            color={session.id === currentSessionId ? "green" : "white"}
            bold={session.id === currentSessionId}
          >
            {session.id === currentSessionId ? "> " : "  "}
            {session.id} ({session.backend}: {session.port}) - {session.status}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">
          Press Ctrl+S to switch sessions
        </Text>
      </Box>
    </Box>
  )
}
