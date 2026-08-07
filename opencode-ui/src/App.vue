<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import MatrixRain from '@/components/MatrixRain.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import EventPanel from '@/components/layout/EventPanel.vue'
import InputPanel from '@/components/layout/InputPanel.vue'
import OutputPanel from '@/components/layout/OutputPanel.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import { useAppStore } from '@/composables/useAppStore'
import { useTheme } from '@/composables/useTheme'

const { connect, sendPrompt, events, streaming, lastEventAt } = useAppStore()
const { theme } = useTheme()

const eventsVisible = ref(false)
const rainVisible = ref(true)

const isMatrix = computed(() => theme.value === 'matrix')

async function onSubmit(prompt: string): Promise<void> {
  try {
    await sendPrompt(prompt)
  } catch {
    // send failure is surfaced through sessionError in the input panel
  }
}

onMounted(() => {
  connect()
})
</script>

<template>
  <MatrixRain v-if="isMatrix && rainVisible" />
  <div
    class="app-bg relative z-10 grid h-screen grid-rows-[auto_1fr_auto_auto] overflow-hidden"
  >
    <AppHeader :rain-visible="rainVisible" @toggle-rain="rainVisible = !rainVisible" />
    <main
      class="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <InputPanel @submit="onSubmit" />
      <OutputPanel />
    </main>
    <EventPanel v-if="eventsVisible" :events="events" :streaming="streaming" />
    <StatusBar
      :events-visible="eventsVisible"
      :last-event-at="lastEventAt"
      @toggle-events="eventsVisible = !eventsVisible"
    />
  </div>
</template>
