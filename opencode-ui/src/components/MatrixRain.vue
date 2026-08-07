<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type RainMode = 'background' | 'panel' | 'strip'

// Matrix-only. mode decides how the canvas fills its space:
//   background — fixed full-screen app background (App.vue)
//   panel      — absolutely fills its positioned parent (output panel, header bg)
//   strip      — slim band; glyphs sized to the parent height (header band)
const props = withDefaults(
  defineProps<{ mode?: RainMode; opacity?: number | null }>(),
  { mode: 'background', opacity: null },
)

const canvas = ref<HTMLCanvasElement | null>(null)

const GLYPHS = 'アイウエオカキクケコサシスセソ0123456789ABCDEF'

const DEFAULT_OPACITY: Record<RainMode, number> = { background: 0.6, panel: 0.5, strip: 0.9 }

let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let drops: number[] = []
let fontSize = 16

function resize(): void {
  if (!canvas.value) return
  canvas.value.width = canvas.value.clientWidth
  canvas.value.height = canvas.value.clientHeight
  fontSize =
    props.mode === 'strip'
      ? Math.max(10, canvas.value.height)
      : Math.max(12, Math.floor(canvas.value.width / 90))
  drops = Array.from(
    { length: Math.ceil(canvas.value.width / Math.max(1, fontSize)) },
    () => -Math.random() * 40,
  )
}

function paint(): void {
  if (!canvas.value || !ctx) return
  ctx.fillStyle = 'rgba(2, 13, 6, 0.09)'
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height)
  ctx.font = `${fontSize}px monospace`
  for (let i = 0; i < drops.length; i++) {
    const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
    ctx.fillStyle = Math.random() > 0.975 ? '#c8ffd8' : '#1aff8c'
    ctx.fillText(glyph, i * fontSize, drops[i] * fontSize)
    if (drops[i] * fontSize > canvas.value.height && Math.random() > 0.975) drops[i] = 0
    drops[i]++
  }
}

function frame(): void {
  paint()
  rafId = requestAnimationFrame(frame)
}

function start(): void {
  if (!canvas.value || rafId) return
  ctx = canvas.value.getContext('2d')
  // ponytail: render one static frame under reduced-motion instead of pausing
  // entirely, so the panel still signals activity without animating.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paint()
    return
  }
  rafId = requestAnimationFrame(frame)
}

function stop(): void {
  cancelAnimationFrame(rafId)
  rafId = 0
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  start()
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas
    ref="canvas"
    class="pointer-events-none z-0"
    :class="[
      mode === 'background'
        ? 'fixed inset-0 h-screen w-screen'
        : 'absolute inset-0 h-full w-full',
    ]"
    :style="{ opacity: opacity ?? DEFAULT_OPACITY[mode] }"    aria-hidden="true"
  ></canvas>
</template>
