import { ref } from 'vue'

const CWD_KEY = 'opencode-ui:cwd'

const cwd = ref<string | null>(readStored())

function readStored(): string | null {
  try {
    return window.localStorage.getItem(CWD_KEY)
  } catch {
    return null
  }
}

function setWorkingDirectory(path: string | null): void {
  cwd.value = path
  try {
    if (path === null) {
      window.localStorage.removeItem(CWD_KEY)
    } else {
      window.localStorage.setItem(CWD_KEY, path)
    }
  } catch {
    // storage unavailable — selection still applies for this session
  }
}

export function useWorkingDirectory() {
  return { cwd, setWorkingDirectory }
}
