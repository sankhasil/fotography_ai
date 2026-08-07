<script setup lang="ts">
import { ref } from 'vue'
import type { RawEventRecord } from '@/composables/useEventStream'
import UiBadge from '@/components/ui/UiBadge.vue'

defineProps<{ events: RawEventRecord[]; streaming: boolean }>()

const expanded = ref<number | null>(null)

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}
</script>

<template>
  <section class="app-border app-bg flex h-48 flex-col border-t">
    <div class="app-border flex items-center justify-between border-b px-3 py-1.5 text-xs">
      <h3 class="app-fg font-semibold">Event stream</h3>
      <div class="flex items-center gap-2">
        <UiBadge :tone="streaming ? 'success' : 'neutral'">
          {{ streaming ? 'live' : 'stopped' }}
        </UiBadge>
        <span class="muted">{{ events.length }} events</span>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-1">
      <ul v-if="events.length" class="flex flex-col gap-0.5">
        <li v-for="event in events" :key="event.id">
          <button
            type="button"
            class="w-full cursor-pointer px-2 text-left font-mono text-[11px] leading-5 hover:bg-[var(--bg-elevated)]"
            @click="expanded = expanded === event.id ? null : event.id"
          >
            <span class="app-fg">{{ event.type }}</span>
            <span class="muted ml-2">{{ time(event.receivedAt) }}</span>
          </button>
          <pre v-if="expanded === event.id" class="app-fg whitespace-pre-wrap px-3 pb-1 text-[10px]">{{
            JSON.stringify(event.properties, null, 2)
          }}</pre>
        </li>
      </ul>
      <p v-else class="muted px-2 py-1 text-xs">No events yet.</p>
    </div>
  </section>
</template>
