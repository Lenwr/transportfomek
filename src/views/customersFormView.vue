<script setup>
import {collection, addDoc} from 'firebase/firestore'
import {computed, ref} from 'vue'
import {useCollection, useFirestore} from 'vuefire'
import router from '../router/index.js'
import Return from "../components/return.vue";
import {toast} from "vue3-toastify";

const db = useFirestore()
const Liste = useCollection(collection(db, 'customers'))
const Temp = ref([])
const customer = ref({
  nom: '',
  prenom: '',
  adresse: '',
  codePostal: '',
  telephone: '',
  envois: [{expediteur: '', colis: ''}],
})

// Add a new document with a generated id.
async function addCustomer() {
  const newDoc = await addDoc(collection(db, 'customers'), {
    ...customer.value,
  })
      .then(() => {
        toast("Formulaire envoyé", {
          "theme": "auto",
          "type": "success",
          "autoClose": 1000,
          "dangerouslyHTMLString": true
        })
        customer.value.nom = '',
            customer.value.prenom = ''
        customer.value.adresse = ''
        customer.value.codePostal = ''
        customer.value.telephone = ''

      })

  //await router.push({ path: '/customersDetails/:'+ temp.id })
}

const suggestions = ref([])
const filterItems = () => {
  if (customer.value.nom.trim() === '') {
    suggestions.value = []
    return
  }

  const lowerCaseQuery = customer.value.nom.toLowerCase().trim()
  suggestions.value = Liste.value.filter(
      (item) => item.nom && item.nom.toLowerCase().includes(lowerCaseQuery)
  )
}

const selectItem = (item) => {
  customer.value.nom = item.nom
  suggestions.value = []
  router.push(`/customersDetails/${item.id}`)
}

</script>

<template>
  <!-- <return route="" /> -->
  <div
      class="bg-white flex h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8 "
  >

    <div class="sm:mx-auto sm:w-full sm:max-w-sm">

      <h2
          class="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900"
      >
        Enregistrer un client
      </h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <form class="space-y-6" @submit.prevent="addCustomer">
        <div>
          <label
              for="nom"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Nom
          </label>
          <div class="mt-2">
            <input
                id="nom"
                name="nom"
                v-model="customer.nom"
                @input="filterItems"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Nom"
            />
            <div v-if="suggestions.length > 0" class="autocomplete block w-full max-w-xxs rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4">
              <div
                  v-for="suggestion in suggestions"
                  :key="suggestion.id"
                  @click="selectItem(suggestion)"
                  class="suggestion"
              >
                {{ suggestion.nom }}
              </div>
            </div>
          </div>
        </div>

        <div>
          <label
              for="prenom"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Prenoms
          </label>
          <div class="mt-2">
            <input
                id="prenom"
                name="prenom"
                v-model="customer.prenom"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Prenoms"
            />
          </div>
        </div>

        <div class="adresse">
          <label
              for="adresse"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            adresse
          </label>
          <div class="mt-2">
            <input
                type="text"
                id="adresse"
                name="adresse"
                v-model="customer.adresse"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="adresse"
            />
          </div>
        </div>
        <div class="">
          <label
              for="codePostal"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Code Postal
          </label>
          <div class="mt-2">
            <input
                type="text"
                id="codePostal"
                name="codePostal"
                v-model="customer.codePostal"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="95500 , 91000 , ...... "
            />
          </div>
        </div>

        <div class="telephone">
          <label
              for="telephone"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Telephone
          </label>
          <div class="mt-2">
            <input
                type="tel"
                id="telephone"
                name="telephone"
                v-model="customer.telephone"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Telephone"
            />
          </div>
        </div>

        <div>
          <button
              type="submit"
              class="flex h-[3em] w-full justify-center rounded-md bg-primary px-3 py-1.5 mb-[2em] text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.autocomplete {
  border: 1px solid #ccc;
  border-radius: 4px;
  max-height: 150px; /* limiter la hauteur pour la rendre scrollable */

  overflow-y: auto;
}

.suggestion {
  padding: 5px;
  cursor: pointer;
  color: black;
}

.suggestion:hover {
  background-color: #f0f0f0;
}
</style>
