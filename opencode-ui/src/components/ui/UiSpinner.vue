<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <span
    class="accent inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
    :class="size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'"
    role="status"
    aria-label="Loading"
  ></span>
</template>
