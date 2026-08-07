<script setup lang="ts">
// Jarvis busy indicator: a glowing blue plasma orb that replaces the output
// panel while a run is in flight, exactly like the matrix rain. Pure CSS —
// see the .plasma-orb* rules in style.css; reduced-motion is handled there.
</script>

<template>
  <div class="flex min-h-0 flex-1 items-center justify-center">
    <div class="plasma-orb" role="status" aria-label="Processing">
      <div class="plasma-orb-core"></div>
      <div class="plasma-orb-blob plasma-orb-blob-a"></div>
      <div class="plasma-orb-blob plasma-orb-blob-b"></div>
      <div class="plasma-orb-blob plasma-orb-blob-c"></div>
      <div class="plasma-orb-ring"></div>
    </div>
  </div>
</template>
