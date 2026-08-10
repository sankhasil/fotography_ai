<script setup lang="ts">
import BuilderScene from '@/components/BuilderScene.vue'
import PickleRickFigure from '@/components/figures/PickleRickFigure.vue'
</script>

<template>
  <BuilderScene label="Pickle Rick is working on your answer">
    <template #default="{ scene, hat }">
      <PickleRickFigure :scene="scene" :hat="hat" />
    </template>
  </BuilderScene>
</template>
