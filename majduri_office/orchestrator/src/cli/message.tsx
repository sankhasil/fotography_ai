import React from "react"
import { Box, Text } from "ink"
import { MessagePrimitive } from "@assistant-ui/react-ink"
import { MarkdownTextPrimitive } from "@assistant-ui/react-ink-markdown"

export function Message() {
  return (
    <Box marginBottom={1}>
      <MessagePrimitive.Root>
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") {
              return <MarkdownTextPrimitive />
            }
            return null
          }}
        </MessagePrimitive.Parts>
      </MessagePrimitive.Root>
    </Box>
  )
}
