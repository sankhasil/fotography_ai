<script setup lang="ts">
import { computed, ref } from 'vue'

import { useAppStore } from '@/composables/useAppStore'

const {
  warningLevel,
  formattedRemaining,
  usagePercent,
  modelOptions,
  modelSelectedIndex,
  selectModel,
  findLargerContextModels,
} = useAppStore()

const dismissed = ref(false)

const currentModel = computed(() => {
  if (modelSelectedIndex.value === '') return null
  const idx = Number(modelSelectedIndex.value)
  return modelOptions.value[idx] ?? null
})

const largerModels = computed(() => {
  if (!currentModel.value) return []
  return findLargerContextModels(currentModel.value.contextLimit)
})

const showWarning = computed(() => {
  if (dismissed.value) return false
  return warningLevel.value !== 'normal'
})

const warningMessage = computed(() => {
  if (warningLevel.value === 'critical') {
    return `Context window almost full (${formattedRemaining.value} tokens remaining). Consider switching models or starting a new session.`
  }
  return `Context window filling up (${Math.round(usagePercent.value)}% used, ${formattedRemaining.value} remaining).`
})

function dismiss(): void {
  dismissed.value = true
}

function switchModel(index: number): void {
  selectModel(index)
  dismissed.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="showWarning"
      class="fixed bottom-20 left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-lg border p-4 shadow-lg"
      :class="{
        'border-[var(--error)] bg-[var(--error)]/10': warningLevel === 'critical',
        'border-[var(--warning)] bg-[var(--warning)]/10': warningLevel === 'warning',
      }"
    >
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          <svg
            v-if="warningLevel === 'critical'"
            class="h-5 w-5 text-[var(--error)]"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          <svg
            v-else
            class="h-5 w-5 text-[var(--warning)]"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium" :class="{
            'text-[var(--error)]': warningLevel === 'critical',
            'text-[var(--warning)]': warningLevel === 'warning',
          }">
            Token Limit Warning
          </p>
          <p class="mt-1 text-sm text-[var(--muted)]">
            {{ warningMessage }}
          </p>
          <div v-if="largerModels.length > 0" class="mt-3">
            <p class="text-xs font-medium text-[var(--muted)] mb-2">
              Switch to a model with more context:
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="(m, index) in largerModels.slice(0, 3)"
                :key="m.modelID"
                type="button"
                class="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)] transition-colors"
                @click="switchModel(modelOptions.indexOf(m))"
              >
                {{ m.modelName }}
                <span class="opacity-60 ml-1">
                  ({{ m.contextLimit >= 1000000 ? `${m.contextLimit / 1000000}M` : `${m.contextLimit / 1000}K` }})
                </span>
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="flex-shrink-0 text-[var(--muted)] hover:text-[var(--fg)]"
          @click="dismiss"
        >
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>
