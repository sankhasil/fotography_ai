<script setup lang="ts">
import BuilderScene from '@/components/BuilderScene.vue'
import OctopusFigure from '@/components/figures/OctopusFigure.vue'
</script>

<template>
  <BuilderScene label="Ollie the octo-builder is working on your answer">
    <template #default="{ scene, hat }">
      <OctopusFigure :scene="scene" :hat="hat" />
    </template>
  </BuilderScene>
</template>
