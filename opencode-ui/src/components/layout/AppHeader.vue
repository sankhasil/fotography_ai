<script setup lang="ts">
import MatrixRain from '@/components/MatrixRain.vue'
import UiStatusIndicator from '@/components/ui/UiStatusIndicator.vue'
import { useAppStore } from '@/composables/useAppStore'
import { sessionAlias } from '@/composables/useSessionAlias'
import { useTheme, type ThemeId } from '@/composables/useTheme'

defineProps<{ rainVisible?: boolean }>()
defineEmits<{ (e: 'toggle-rain'): void }>()

const { status, url, activeSession, modelOptions, modelSelectedIndex, modelSelectedLabel, selectModel } =
  useAppStore()
const { theme, tone, setTheme, toggleTone, THEME_IDS } = useTheme()

function onThemeChange(event: Event): void {
  setTheme((event.target as HTMLSelectElement).value as ThemeId)
}

function onModelChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  selectModel(value === '' ? null : Number(value))
}
</script>

<template>
  <header
    class="app-border panel-bg relative flex items-center justify-between overflow-hidden border-b px-4 py-2"
  >
    <MatrixRain
      v-if="theme === 'matrix' && rainVisible"
      mode="panel"
      :opacity="0.25"
    />
    <div v-if="theme === 'matrix' && rainVisible" class="absolute inset-x-0 bottom-0 z-0 h-6">
      <MatrixRain mode="strip" />
    </div>
    <div class="relative z-10 flex items-center gap-2">
      <span class="accent-bg inline-block h-4 w-4 rounded-sm"></span>
      <span class="app-fg text-sm font-semibold">OpenCode WebUI</span>
    </div>
    <div class="relative z-10 muted flex items-center gap-4 text-xs">
      <select
        class="app-border panel-bg rounded border px-1 py-0.5"
        :value="modelSelectedIndex"
        aria-label="Model"
        :title="modelSelectedLabel ? `model: ${modelSelectedLabel}` : 'model: default'"
        @change="onModelChange"
      >
        <option value="">model: default</option>
        <option v-for="(m, index) in modelOptions" :key="m.modelID" :value="index">
          {{ m.modelName }}
        </option>
      </select>
      <span
        v-if="activeSession"
        :data-session-id="activeSession.id"
        :title="activeSession.id"
        class="muted"
      >
        session: {{ sessionAlias(activeSession.id) }}
      </span>
      <span v-else class="muted">session: —</span>
      <span :title="url ?? undefined">
        <UiStatusIndicator :status="status" />
      </span>
      <select
        class="app-border panel-bg rounded border px-1 py-0.5"
        :value="theme"
        aria-label="Theme"
        @change="onThemeChange"
      >
        <option v-for="t in THEME_IDS" :key="t" :value="t">{{ t }}</option>
      </select>
      <button
        v-if="theme === 'matrix'"
        class="app-border rounded border px-1.5 py-0.5 capitalize"
        type="button"
        @click="$emit('toggle-rain')"
      >
        {{ rainVisible ? 'rain: on' : 'rain: off' }}
      </button>
      <button
        v-if="theme !== 'matrix'"
        class="app-border rounded border px-1.5 py-0.5 capitalize"
        type="button"
        @click="toggleTone"
      >
        {{ tone }}
      </button>
    </div>
  </header>
</template>
