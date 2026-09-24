<script setup>
defineProps({ model: { type: Object, required: true } })
</script>
<template>
  <div class="grid w-full gap-3 sm:grid-cols-2">
    <label class="block text-sm text-slate-700">
      <span class="font-semibold">Contenu exact et descriptif détaillé de vos colis</span>
      <textarea v-model="model.contenuDetaille" rows="3" maxlength="3000" class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Ex. 10 chemises, 2 paires de chaussures, 1 mixeur — précisez quantité, marque et état." />
    </label>
    <label class="block text-sm text-slate-700">
      <span class="font-semibold">Valeur estimée par colis (€)</span>
      <input v-model.number="model.valeurEstimee" type="number" min="0" step="0.01" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3" placeholder="Ex. 150" />
      <span class="mt-2 block text-xs text-slate-500">Si le contenu ou la valeur diffèrent, ajoutez une ligne distincte pour chaque colis. Il s’agit de la valeur du contenu, pas du prix du transport.</span>
    </label>
  </div>
</template>
