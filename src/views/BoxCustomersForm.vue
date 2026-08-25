<script setup>
import { collection, addDoc } from 'firebase/firestore'
import { ref } from 'vue'
import { useFirestore } from 'vuefire'
import router from '../router/index.js'
import Return from "../components/return.vue";

const db = useFirestore()

const tenant = ref({
  raisonSociale: '',
  adresse: '',
  telephone: '',
  boxe:'',
  start:'',
  end:'',
  prix:'',
  acompte:'',

})

// Add a new document with a generated id.
async function addTenant() {
  const newDoc = await addDoc(collection(db, 'tenantsBox'), {
    ...tenant.value,
  })
  await router.push({ path: '/soumission' })
}


</script>

<template>
  <!-- <return route="" /> -->
  <div
      class="bg-white flex h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8"
  >

    <div class="sm:mx-auto sm:w-full sm:max-w-sm">

      <h2
          class="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900"
      >
        Enregistrer un Locataire
      </h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <form class="space-y-6" @submit.prevent="addTenant">
        <div>
          <label
              for="raisonSociale"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Raison Sociale
          </label>
          <div class="mt-2">
            <input
                id="raisonSociale"
                name="raisonSociale"
                v-model="tenant.raisonSociale"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="raison Sociale"
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
                v-model="tenant.adresse"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="adresse"
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
                v-model="tenant.telephone"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Telephone"
            />
          </div>
        </div>
        <div class="boxe">
          <label
              for="boxe"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Boxe
          </label>
          <div class="mt-2">
            <select
                id="boxe"
                name="boxe"
                v-model="tenant.boxe"
                autocomplete="boxe"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
            >
              <option>A</option>
              <option>B</option>
            </select>
          </div>
        </div>


        <div class="date mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
          <div class="sm:col-span-3">
            <label
                for="start"
                class="block text-sm font-medium leading-6 text-gray-900"
            >
              Date de début contrat
            </label>
            <div class="mt-2">
              <input
                  required
                  type="datetime-local"
                  name="start"
                  v-model="tenant.start"
                  id="start"
                  autocomplete="given-name"
                  class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              />
            </div>
          </div>
        </div>

        <div class="date mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
          <div class="sm:col-span-3">
            <label
                for="end"
                class="block text-sm font-medium leading-6 text-gray-900"
            >
              Date de fin contrat
            </label>
            <div class="mt-2">
              <input
                  required
                  type="datetime-local"
                  name="end"
                  v-model="tenant.end"
                  id="end"
                  autocomplete="given-name"
                  class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              />
            </div>
          </div>
        </div>

        <div class="prix">
          <label
              for="prix"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Prix
          </label>
          <div class="mt-2">
            <input
                type="text"
                id="prix"
                name="prix"
                v-model="tenant.prix"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="prix du boxe"
            />
          </div>
        </div>

        <div class="acompte">
          <label
              for="acompte"
              class="block text-sm font-medium leading-6 text-gray-900"
          >
            Acompte versé
          </label>
          <div class="mt-2">
            <input
                type="text"
                id="acompte"
                name="acompte"
                v-model="tenant.acompte"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="somme"
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

<style scoped></style>
