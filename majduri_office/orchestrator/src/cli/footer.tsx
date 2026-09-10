import React from "react"
import { Box, Text } from "ink"
import type Database from "better-sqlite3"
import { getTokenUsageByTag } from "../db.js"

interface FooterProps {
  db: Database.Database
  sessionPort: number | null
  backend: string | null
}

export function Footer({ db, sessionPort, backend }: FooterProps) {
  const featureTokens = getTokenUsageByTag(db, "feature")
  const testTokens = getTokenUsageByTag(db, "test")
  const totalTokens = featureTokens + testTokens

  return (
    <Box justifyContent="space-between" marginTop={1}>
      <Text color="gray">
        {sessionPort ? `${backend}:${sessionPort}` : "No session"}
      </Text>
      <Text color="gray">
        Tokens: {totalTokens} (feature: {featureTokens}, test: {testTokens})
      </Text>
    </Box>
  )
}
