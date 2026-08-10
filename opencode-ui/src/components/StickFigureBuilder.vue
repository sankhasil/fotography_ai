<script setup lang="ts">
import BuilderScene from '@/components/BuilderScene.vue'
import StickFigure from '@/components/figures/StickFigure.vue'
</script>

<template>
  <BuilderScene label="A stick figure is working on your answer">
    <template #default="{ scene, hat }">
      <StickFigure :scene="scene" :hat="hat" />
    </template>
  </BuilderScene>
</template>
