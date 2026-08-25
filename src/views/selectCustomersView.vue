<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useFirestore, useCollection } from 'vuefire'
import { collection } from 'firebase/firestore'
import router from '../router/index.js'

const db = useFirestore()
const Liste = useCollection(collection(db, 'customers'))
const query = ref('')
const filteredList = ref([])
const dropdownRef = ref(null) // Définir une référence à l'élément DOM de la liste déroulante
let display = false

const filterItems = () => {
  if (query.value.trim() === '') {
    filteredList.value = []
    return
  }

  const lowerCaseQuery = query.value.toLowerCase().trim()
  filteredList.value = Liste.value.filter(
    (item) => item.nom && item.nom.toLowerCase().includes(lowerCaseQuery),
  )
}

const selectItem = (item) => {
  query.value = item.nom
  filteredList.value = []
  display = !display
  router.push(`/customersDetails/${item.id}`)
}

// Fermez la liste déroulante lorsqu'on clique en dehors
const closeDropdown = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    filteredList.value = []
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
  <div class="w-full" v-cloak>
    <div class="combobox-container flex flex-col items-center">
      <input
        v-model="query"
        type="text"
        placeholder="Rechercher..."
        @input="filterItems"
        class="input input-bordered input-accent w-full max-w-xs"
      />
      <div
        class="dropdown max-h-[150px] overflow-y-auto w-full max-w-xs  my-4"
        :class="{ show: filteredList.length > 0 && query.trim() !== '' }"
        ref="dropdownRef"
      >
        <div
          class="text-black  dropdown-item"
          v-for="item in filteredList"
          :key="item.id"
          @click="() => selectItem(item)"
        >
          {{ item.nom }}
        </div>
      </div>
    </div>
  </div>
</template>

