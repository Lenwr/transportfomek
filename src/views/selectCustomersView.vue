<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useFirestore, useCollection } from 'vuefire'
import { collection } from 'firebase/firestore'
import router from '../router/index.js'

const props = defineProps({ fillMode: { type: Boolean, default: false } })
const emit = defineEmits(['select'])

const db = useFirestore()
const Liste = useCollection(collection(db, 'customers'))
const query = ref('')
const isOpen = ref(false)
const dropdownRef = ref(null) // Définir une référence à l'élément DOM de la liste déroulante
const normalized = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const filteredList = computed(() => {
  const words = normalized(query.value).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return (Liste.value || []).filter((item) => {
    const searchable = normalized(`${item.numeroClient || ''} ${item.nom || ''} ${item.prenom || ''} ${item.telephone || ''} ${item.ville || ''}`)
    return words.every((word) => searchable.includes(word))
  }).slice(0, 8)
})

const selectItem = (item) => {
  query.value = `${item.numeroClient ? `${item.numeroClient} · ` : ''}${item.nom || ''} ${item.prenom || ''}`.trim()
  isOpen.value = false
  if (props.fillMode) emit('select', item)
  else router.push(`/customersDetails/${item.id}`)
}

// Fermez la liste déroulante lorsqu'on clique en dehors
const closeDropdown = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

// Utilisation de onMounted pour attacher l'écouteur d'événements après le rendu initial
onMounted(() => {
  document.addEventListener('click', closeDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <div ref="dropdownRef" class="relative w-full" v-cloak>
    <div class="w-full">
      <label v-if="fillMode" class="mb-2 block text-sm font-semibold text-slate-700">Rechercher un client existant</label>
      <input
        v-model="query"
        type="text"
        placeholder="N° client, nom, prénom ou téléphone..."
        autocomplete="off"
        @focus="isOpen = true"
        @input="isOpen = true"
        class="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
      />
      <div
        v-if="isOpen && query.trim() && filteredList.length"
        class="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 rounded-md px-3 py-3 text-left text-black hover:bg-cyan-50"
          v-for="item in filteredList"
          :key="item.id"
          @click="selectItem(item)"
        >
          <span class="min-w-0">
            <span class="block truncate font-semibold">{{ item.nom || '—' }} {{ item.prenom || '' }}</span>
            <span class="block truncate text-xs text-slate-500">{{ item.telephone || 'Sans téléphone' }}<template v-if="item.ville"> · {{ item.ville }}</template></span>
          </span>
          <span class="shrink-0 rounded-md bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{{ item.numeroClient || 'Sans n°' }}</span>
        </button>
      </div>
      <p v-else-if="isOpen && query.trim().length >= 2 && !filteredList.length" class="absolute z-30 mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-xl">Aucun client trouvé. Tu peux continuer la saisie manuellement.</p>
    </div>
  </div>
</template>
