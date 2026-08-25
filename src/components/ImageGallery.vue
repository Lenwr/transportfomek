<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from "vue"

const props = defineProps({
  images: { type: [Array, String, Object], default: () => [] }, // Object to tolerate {0:'url',1:'url'}
  thumbRows: { type: Number, default: 2 },
  rounded: { type: String, default: "rounded-xl" },
})

// ✅ Always reactive, always an array of strings
const list = computed(() => {
  const v = props.images
  if (!v) return []
  if (Array.isArray(v)) return v.filter(Boolean)
  // sometimes Firestore/proxies give an object with numeric keys
  if (typeof v === "object") return Object.values(v).filter(Boolean)
  if (typeof v === "string") return v ? [v] : []
  return []
})
console.log(list.value)

const lightboxOpen = ref(false)
const current = ref(0)

const open = (i) => { current.value = i; lightboxOpen.value = true }
const close = () => { lightboxOpen.value = false }
const next = () => { if (list.value.length) current.value = (current.value + 1) % list.value.length }
const prev = () => { if (list.value.length) current.value = (current.value - 1 + list.value.length) % list.value.length }

const onKey = (e) => {
  if (!lightboxOpen.value) return
  if (e.key === "Escape") close()
  if (e.key === "ArrowRight") next()
  if (e.key === "ArrowLeft") prev()
}
onMounted(() => window.addEventListener("keydown", onKey))
onBeforeUnmount(() => window.removeEventListener("keydown", onKey))
</script>

<template>
    <div v-if="list.length === 0" class="text-sm text-gray-500">Aucune image</div>
  
    <div v-else class="w-full space-y-3">
      <!-- Image principale -->
      <div
        class="relative w-full aspect-[4/3] overflow-hidden bg-gray-100 rounded-xl shadow cursor-zoom-in"
        @click="open(current)"
      >
        <img
          :src="list[current]"
          class="absolute inset-0 w-full h-full object-contain"
          :alt="`Image ${current+1}`"
        />
      </div>
  
      <!-- Miniatures (desktop) / grille (mobile) -->
      <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
        <div
          v-for="(src, i) in list"
          :key="src || i"
          class="relative aspect-square overflow-hidden rounded-lg cursor-pointer border"
          :class="i === current ? 'ring-2 ring-green-500 border-green-500' : 'border-gray-200'"
          @click="current = i"
        >
          <img
            :src="src"
            class="absolute inset-0 w-full h-full object-cover"
            :alt="`Miniature ${i+1}`"
          />
        </div>
      </div>
    </div>
  
    <!-- Lightbox fullscreen -->
    <div
      v-if="lightboxOpen"
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
      @click.self="close"
    >
      <button class="absolute top-4 right-4 text-white/80 hover:text-white" @click="close">✕</button>
      <img
        :src="list[current]"
        class="max-h-[90vh] max-w-[92vw] object-contain rounded-2xl shadow-2xl"
        :alt="`Image ${current+1}`"
      />
    </div>
  </template>
  
