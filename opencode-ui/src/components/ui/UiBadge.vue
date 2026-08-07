<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'accent' | 'success' | 'error' }>(), {
  tone: 'neutral',
})

defineSlots<{
  default(): unknown
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
    :class="{
      'app-border muted': tone === 'neutral',
      'app-border accent': tone === 'accent',
      'border-[var(--success)] text-[var(--success)]': tone === 'success',
      'border-[var(--error)] text-[var(--error)]': tone === 'error',
    }"
  >
    <slot />
  </span>
</template>
