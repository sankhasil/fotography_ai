import React from "react"
import { Box, Text } from "ink"

interface ToolCall {
  name: string
  args?: Record<string, unknown>
  result?: string
}

export function ToolCallCard({ name, args, result }: ToolCall) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
      <Text color="yellow" bold>
        Tool: {name}
      </Text>
      {args && Object.keys(args).length > 0 && (
        <Box flexDirection="column">
          <Text color="gray">Args:</Text>
          {Object.entries(args).map(([key, value]) => (
            <Text key={key}>
              {"  "}
              {key}: {String(value)}
            </Text>
          ))}
        </Box>
      )}
      {result && (
        <Box flexDirection="column">
          <Text color="gray">Result:</Text>
          <Text>{result}</Text>
        </Box>
      )}
    </Box>
  )
}
