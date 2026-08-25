<script setup>
defineProps(['route'])
</script>

<template>
  <div class="flex h-16 w-full items-center justify-end bg-primary pr-4" >
    <router-link :to="'/'+ route">
      <button class="btn btn-neutral">retour</button>
    </router-link>
  </div>
</template>

<style scoped>

</style>
