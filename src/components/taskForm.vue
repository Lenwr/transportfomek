<script setup>
import {useTasksStore} from "../stores/tasksStore.js";
import {ref} from "vue";

const taskStore = useTasksStore()
const colis = ref('')
const adresse = ref('')

const handleSubmit = () => {
  if(colis.value.length >0 && adresse.value.length > 0 ){
    taskStore.addTask({
      id: Math.floor(Math.random()*10000) ,
      text : colis.value ,
      adresse: adresse.value,
      status: false
    })
    colis.value =''
    adresse.value =''
  }
}

const inputAddress = ref('')

</script>

<template>
  <div>
    <form>
      <p>{{inputAddress}}</p>
      <input v-model="inputAddress" id="adress1" class="input bg-white border-accent" placeholder="adress1" type="text" name="address-1" autocomplete="address-line1" />
      <input class="input bg-white border-accent" placeholder="adress2" type="text" name="address-2" autocomplete="address-line2" />
      <input class="input bg-white border-accent" placeholder="lv1" type="text" name="city" autocomplete="address-level2" />
      <input class="input bg-white border-accent" placeholder="lv2" type="text" name="state" autocomplete="address-level1" />
      <input class="input bg-white border-accent" placeholder="ZIP" type="text" name="zip" autocomplete="postal-code" />
    </form>
  </div>
</template>

<style scoped>
</style>
