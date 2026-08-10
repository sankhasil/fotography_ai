<script setup lang="ts">
// Jarvis busy indicator: a Tesla-style electric orb. Concentric rings use mixed
// border styles (dotted, dashed, solid, double) tinted electric-blue and spin
// at different speeds — adapted from a CodePen loader (animation only, no text).
// Pure CSS; see the .tesla-orb* rules in style.css. The reduced-motion media
// query collapses every spin to a static glow.
</script>

<template>
  <div class="tesla-orb" role="status" aria-label="Processing">
    <div class="tesla-orb__glow"></div>
    <div class="tesla-orb__ring tesla-orb__ring--1"></div>
    <div class="tesla-orb__ring tesla-orb__ring--2"></div>
    <div class="tesla-orb__ring tesla-orb__ring--3"></div>
    <div class="tesla-orb__ring tesla-orb__ring--4"></div>
    <div class="tesla-orb__core"></div>
  </div>
</template>
