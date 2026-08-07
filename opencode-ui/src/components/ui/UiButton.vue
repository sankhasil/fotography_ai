<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', disabled: false, type: 'button' },
)

defineSlots<{
  default(): unknown
}>()
</script>

<template>
  <button
    class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
    :class="[
      variant === 'primary' && 'accent-bg accent-fg',
      variant === 'secondary' && 'app-border app-fg border',
      variant === 'ghost' && 'muted',
      variant === 'danger' && 'border border-[var(--error)] text-[var(--error)]',
      size === 'sm' && 'px-2.5 py-1 text-xs',
      size === 'md' && 'px-4 py-2 text-sm',
    ]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
