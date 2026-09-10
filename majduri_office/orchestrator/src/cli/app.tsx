import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react-ink"
import type Database from "better-sqlite3"
import type { AppConfig } from "../types.js"
import type { SessionManager } from "../sessions.js"
import { createAdapter } from "./adapter.js"
import { Message } from "./message.js"
import { Footer } from "./footer.js"

interface AppProps {
  db: Database.Database
  config: AppConfig
  sessionManager: SessionManager
}

export function App({ db, config, sessionManager }: AppProps) {
  const adapter = createAdapter(db, config, sessionManager)
  const runtime = useLocalRuntime(adapter)
  const [sessionPort, setSessionPort] = useState<number | null>(null)
  const [backend, setBackend] = useState<string | null>(null)

  useInput((input, key) => {
    if (key.ctrl && (input === "c" || input === "d")) {
      console.log("\nGoodbye!")
      for (const session of sessionManager.getAll()) {
        sessionManager.kill(session.id, db)
      }
      db.close()
      process.exit(0)
    }
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Majduri Office Orchestrator
        </Text>
        <Box marginBottom={1}>
          <Text color="gray">
            Type /help for commands | !command for shell | @file for files
          </Text>
        </Box>
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Messages components={{ Message: Message }} />
          <Box borderStyle="round" paddingX={1}>
            <Text>{"> "}</Text>
            <ComposerPrimitive.Input submitOnEnter placeholder="Enter task..." autoFocus />
          </Box>
        </ThreadPrimitive.Root>
        <Footer db={db} sessionPort={sessionPort} backend={backend} />
      </Box>
    </AssistantRuntimeProvider>
  )
}
