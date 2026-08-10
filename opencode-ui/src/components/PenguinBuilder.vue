<script setup lang="ts">
import BuilderScene from '@/components/BuilderScene.vue'
import PenguinFigure from '@/components/figures/PenguinFigure.vue'
</script>

<template>
  <BuilderScene label="Penny the penguin-builder is working on your answer">
    <template #default="{ scene, hat }">
      <PenguinFigure :scene="scene" :hat="hat" />
    </template>
  </BuilderScene>
</template>
