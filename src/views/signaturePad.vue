<script setup>
import Signature from '../components/signature.vue'
import { ref } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const detailId = ref(route.params.id)
const colisIndex = ref(parseInt(route.query.colisIndex))
const detailIndex = ref(
  route.query.detailIndex !== undefined ? parseInt(route.query.detailIndex) : null
)
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Preuve de remise</p>
      <h1 class="mt-2 text-2xl font-bold">Réception du colis</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">
        Indique le nom de la personne qui reçoit le colis et joins sa pièce d’identité si nécessaire.
      </p>

      <div class="mt-6">
        <Signature
          :detail-id="detailId"
          :colis-index="colisIndex"
          :detail-index="detailIndex"
        />
      </div>
    </div>
  </main>
</template>
