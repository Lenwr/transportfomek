<script setup>
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue"

const props = defineProps({
  modelValue: { type: String, default: "" }, // dataURL (png)
  disabled: { type: Boolean, default: false },
  height: { type: Number, default: 180 }, // css px
})

const emit = defineEmits(["update:modelValue"])

const wrapRef = ref(null)
const canvasRef = ref(null)
const ctxRef = ref(null)

const isDrawing = ref(false)
const last = ref({ x: 0, y: 0 })

const hasValue = computed(() => !!String(props.modelValue || "").trim())

function getPoint(e) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }

  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

function paintWhiteBackground() {
  const ctx = ctxRef.value
  const wrap = wrapRef.value
  if (!ctx || !wrap) return

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, wrap.clientWidth, props.height)
}

function setupCanvas() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return

  const cssW = wrap.clientWidth
  const cssH = props.height
  const dpr = window.devicePixelRatio || 1

  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvas.width = Math.floor(cssW * dpr)
  canvas.height = Math.floor(cssH * dpr)

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctxRef.value = ctx
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.lineWidth = 2.2
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.strokeStyle = "#0f172a"

  paintWhiteBackground()

  if (props.modelValue) {
    drawFromDataUrl(props.modelValue)
  }
}

function drawFromDataUrl(dataUrl) {
  const ctx = ctxRef.value
  const wrap = wrapRef.value
  if (!ctx || !wrap || !dataUrl) return

  const img = new Image()
  img.onload = () => {
    paintWhiteBackground()
    ctx.drawImage(img, 0, 0, wrap.clientWidth, props.height)
  }
  img.src = dataUrl
}

function start(e) {
  if (props.disabled) return

  e.preventDefault()

  const canvas = canvasRef.value
  if (!canvas) return

  isDrawing.value = true
  last.value = getPoint(e)

  // important sur mobile/stylet
  if (canvas.setPointerCapture && e.pointerId != null) {
    canvas.setPointerCapture(e.pointerId)
  }
}

function move(e) {
  if (!isDrawing.value || props.disabled) return

  e.preventDefault()

  const ctx = ctxRef.value
  if (!ctx) return

  const p = getPoint(e)

  ctx.beginPath()
  ctx.moveTo(last.value.x, last.value.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()

  last.value = p
}

function end(e) {
  if (!isDrawing.value || props.disabled) return

  isDrawing.value = false

  const canvas = canvasRef.value
  if (canvas?.releasePointerCapture && e?.pointerId != null) {
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  exportPng()
}

function clear() {
  paintWhiteBackground()
  emit("update:modelValue", "")
}

function exportPng() {
  const canvas = canvasRef.value
  if (!canvas) return
  emit("update:modelValue", canvas.toDataURL("image/png", 1.0))
}

let ro = null

onMounted(() => {
  setupCanvas()

  if (wrapRef.value && "ResizeObserver" in window) {
    ro = new ResizeObserver(() => {
      const current =
        props.modelValue ||
        (canvasRef.value ? canvasRef.value.toDataURL("image/png", 1.0) : "")

      setupCanvas()

      if (current) {
        drawFromDataUrl(current)
      }
    })

    ro.observe(wrapRef.value)
  }
})

onBeforeUnmount(() => {
  if (ro && wrapRef.value) ro.unobserve(wrapRef.value)
})

watch(
  () => props.modelValue,
  (v) => {
    const ctx = ctxRef.value
    const wrap = wrapRef.value
    if (!ctx || !wrap) return

    if (!v) {
      paintWhiteBackground()
      return
    }

    drawFromDataUrl(v)
  }
)
</script>

<template>
  <div ref="wrapRef" class="w-full">
    <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <canvas
        ref="canvasRef"
        class="block w-full touch-none"
        :style="{ height: `${height}px`, touchAction: 'none' }"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="end"
        @pointerleave="end"
      />
    </div>

    <div class="mt-2 flex items-center justify-between gap-2">
      <div class="text-xs text-slate-500">
        {{ hasValue ? "Signature enregistrée" : "Signe au doigt / souris" }}
      </div>

      <button
        type="button"
        class="btn btn-sm btn-outline"
        :disabled="disabled"
        @click="clear"
      >
        Effacer
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Tailwind only */
</style>