import React, { useState } from "react"
import { Box, Text, useInput } from "ink"

interface PermissionPromptProps {
  message: string
  onApprove: () => void
  onDeny: () => void
}

export function PermissionPrompt({ message, onApprove, onDeny }: PermissionPromptProps) {
  const [response, setResponse] = useState<boolean | null>(null)

  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      setResponse(true)
      onApprove()
    } else if (input === "n" || input === "N") {
      setResponse(false)
      onDeny()
    }
  })

  if (response !== null) {
    return (
      <Box>
        <Text color={response ? "green" : "red"}>
          {response ? "Approved" : "Denied"}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="double" paddingX={1}>
      <Text color="yellow" bold>
        Permission Required:
      </Text>
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text>
          <Text color="green">[Y]</Text> Approve{" "}
          <Text color="red">[N]</Text> Deny
        </Text>
      </Box>
    </Box>
  )
}
