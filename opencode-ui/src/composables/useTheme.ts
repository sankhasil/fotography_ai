import { computed, ref, watch } from 'vue'

export type ThemeId = 'casual' | 'cartoony' | 'jarvis' | 'matrix'
export type Tone = 'light' | 'dark'

/** Themes with implemented CSS variable sets. Grows as later prompts land. */
export const THEME_IDS: ThemeId[] = ['casual', 'cartoony', 'jarvis', 'matrix']
export const TONES: Tone[] = ['light', 'dark']

const THEME_KEY = 'opencode-ui:theme'
const TONE_KEY = 'opencode-ui:tone'

const theme = ref<ThemeId>('casual')
// The user's preferred tone. Matrix is dark-only, so the effective tone is
// forced dark while matrix is active; this preference is restored on exit.
const tonePreference = ref<Tone>('light')

const tone = computed<Tone>(() => (theme.value === 'matrix' ? 'dark' : tonePreference.value))

function apply(): void {
  document.documentElement.dataset.theme = theme.value
  document.documentElement.dataset.tone = tone.value
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn('localStorage unavailable:', error)
    return null
  }
}

function init(): void {
  const storedTheme = readStored(THEME_KEY) as ThemeId | null
  const storedTone = readStored(TONE_KEY) as Tone | null
  if (storedTheme && THEME_IDS.includes(storedTheme)) theme.value = storedTheme
  if (storedTone && TONES.includes(storedTone)) tonePreference.value = storedTone
  apply()
}

function persist(): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme.value)
    window.localStorage.setItem(TONE_KEY, tonePreference.value)
  } catch (error) {
    console.warn('localStorage unavailable:', error)
  }
  apply()
}

init()

watch([theme, tonePreference], () => persist())

export function useTheme() {
  return {
    theme,
    tone,
    setTheme: (t: ThemeId): void => {
      theme.value = t
    },
    toggleTone: (): void => {
      if (theme.value === 'matrix') return
      tonePreference.value = tonePreference.value === 'light' ? 'dark' : 'light'
    },
    THEME_IDS,
    TONES,
  }
}
