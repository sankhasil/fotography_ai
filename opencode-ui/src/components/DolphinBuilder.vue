<script setup lang="ts">
import BuilderScene from '@/components/BuilderScene.vue'
import DolphinFigure from '@/components/figures/DolphinFigure.vue'
</script>

<template>
  <BuilderScene label="Dolph the dolphin is working on your answer">
    <template #default="{ scene, hat }">
      <DolphinFigure :scene="scene" :hat="hat" />
    </template>
  </BuilderScene>
</template>
