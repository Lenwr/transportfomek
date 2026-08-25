<script setup>

import { format } from "date-fns";
import frLocale from "date-fns/locale/fr";

defineProps({
  image: {
    type: [String, Array],
    default: ''
  },
  date: String,
  nbreColis: {
    type: [String, Number], // ✅ accepte les deux types
    default: 0
  },
  statut: String,
  expediteur: String,
  destinateur: String,
  destination: String
})


</script>
<template>
  <div
    class="m-1 flex min-w-0 flex-col rounded bg-white/90 bg-[url('https://www.svgrepo.com/show/469769/shipping-box-left.svg')] bg-contain bg-right bg-no-repeat text-black transition duration-1000 hover:shadow-md hover:shadow-primary">
    <div class="up flex min-h-20 flex-row justify-between gap-2 rounded-t bg-white p-2 opacity-95">
      <div class="flex min-w-0 flex-row">
        <img class="h-14 w-14 shrink-0 rounded-full object-cover" :src="image" alt="">
        <div class="flex min-w-0 flex-col px-1">
          <p class="text-xs">{{ date }}</p>
          <p class="truncate">{{ nbreColis }} Colis </p>
        </div>
      </div>
      <div class="shrink-0">
        <p class="p-2 rounded-lg text-white text-xs" :class="{
          'bg-error p-2  text-white text-xs': statut === 'Non Payé',
          ' bg-orange-400 p-2  text-white text-xs': statut === 'Reste à payer',
          ' bg-green-500 p-2  text-white text-xs': statut === 'Payé',
        }">{{ statut ? statut : "Non dispo" }}</p>
      </div>

    </div>
    <div class="down grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-2 rounded-b bg-white px-3 py-4 opacity-90">
      <div class="flex min-w-0 flex-col">
        <p class="text-xs text-center"> de : France </p>
        <p class="truncate text-center text-sm"> {{ expediteur ? expediteur : "Non dispo" }}</p>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
        class="size-6 w-6 text-black ">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
      </svg>
      <div class="flex min-w-0 flex-col">
        <p class="truncate text-center text-xs">vers : {{ destination ? destination : "Togo" }} </p>
        <p class="truncate text-center text-sm"> {{ destinateur ? destinateur : "Non dispo" }}</p>
      </div>
    </div>
  </div>

</template>

<style scoped></style>
