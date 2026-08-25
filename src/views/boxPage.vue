<script setup>
import { useCollection, useFirestore } from 'vuefire'
import { collection, updateDoc, doc, getFirestore } from 'firebase/firestore'
import { computed, ref } from 'vue'
import Return from '../components/return.vue'

const db = useFirestore()
const database = getFirestore()

const Liste = useCollection(collection(db, 'tenantsBox'))

//test gildas
const query = ref('')
let filteredList = Liste
async function listFilter() {
  filteredList = computed(() => {
    const lowerCaseQuery = query.value.toLowerCase().trim()
    return Liste.value.filter(
        (item) => item.raisonSociale && item.raisonSociale.toLowerCase().includes(lowerCaseQuery),
    )
  })
}
</script>

<template>
  <!-- component -->
  <div>
    <!-- <return route="" /> -->
    <span class="flex flex-col items-stretch justify-center gap-2 px-2 py-4 sm:flex-row sm:items-center">
      <p class="text-black sm:px-4">Rechercher</p>
      <input
          v-model="query"
          @input="listFilter"
          type="text"
          placeholder="nom du client "
          class="input input-bordered input-primary w-full bg-white sm:max-w-xs"
      />
    </span>
  </div>
  <div class="flex min-w-0 flex-col">
    <div class="overflow-x-auto sm:mx-0.5 lg:mx-0.5">
      <div class="py-2 inline-block min-w-full sm:px-6 lg:px-8">
        <div class="overflow-hidden">
          <table class="min-w-full">
            <thead class="bg-white border-b">
            <tr>
              <th
                  scope="col"
                  class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
              >
                Raison Sociale
              </th>
              <th
                  scope="col"
                  class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
              >
               adresse
              </th>
              <th
                  scope="col"
                  class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
              >
               telephone
              </th>
              <th
                  scope="col"
                  class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
              >
                Boxe
              </th>
            </tr>
            </thead>
            <tbody>
            <tr
                class="bg-gray-100 border-b"
                v-for="(item, i) in filteredList"
                :key="i"
            >
              <td
                  class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap"
              >
                {{ item.raisonSociale }}
              </td>
              <td
                  class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap"
              >
                {{ item.adresse }}
              </td>
              <td
                  class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap"
              >
                {{ item.telephone }}
              </td>
              <td
                  class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap"
              >
                {{ item.boxe }}
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-primary {
  color: #021d49;
}
</style>
