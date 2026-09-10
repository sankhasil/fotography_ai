import { exit } from "node:process"

export type CommandHandler = (args: string) => string | null

export interface Command {
  name: string
  aliases: string[]
  description: string
  handler: CommandHandler
}

export function createCommands(): Command[] {
  return [
    {
      name: "exit",
      aliases: ["quit", "q"],
      description: "Exit the CLI",
      handler: () => {
        console.log("\nGoodbye!")
        exit(0)
      },
    },
    {
      name: "clear",
      aliases: ["new"],
      description: "Start a new session",
      handler: () => {
        return "__CLEAR__"
      },
    },
    {
      name: "help",
      aliases: ["h", "?"],
      description: "Show this help message",
      handler: () => {
        return `
Commands:
  /exit, /quit, /q     Exit the CLI
  /clear, /new         Start a new session
  /help, /h, /?        Show this help message
  /sessions            List active sessions

Shortcuts:
  Ctrl+C               Exit
  Ctrl+D               Exit

Input prefixes:
  !command             Run shell command
  @path/to/file        Reference a file
  test:                Force tag (test, feature, docs, bugfix, refactor)
`
      },
    },
    {
      name: "sessions",
      aliases: ["resume", "continue"],
      description: "List active sessions",
      handler: () => {
        return "__SESSIONS__"
      },
    },
  ]
}

export function parseCommand(input: string): { command: Command | null; args: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return null

  const spaceIndex = trimmed.indexOf(" ")
  const commandPart = spaceIndex > 0 ? trimmed.substring(1, spaceIndex) : trimmed.substring(1)
  const args = spaceIndex > 0 ? trimmed.substring(spaceIndex + 1) : ""

  const commands = createCommands()
  const command = commands.find(
    (c) => c.name === commandPart || c.aliases.includes(commandPart),
  )

  return command ? { command, args } : null
}
