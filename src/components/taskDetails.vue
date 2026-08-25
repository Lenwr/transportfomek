<script setup>
defineProps({
  taskid : String,
  taskText : String,
  taskStatus : Boolean,
  taskAdresse : String
})
</script>

<template>

  <div class="text-black flex flex-row justify-around items-center shadow rounded h-[6em] my-2  ">
   <span>
     <p>{{taskText}}</p>
  <p>adresse : <a :href="taskAdresse"> <i class="material-icons">location_on</i></a> </p>
   </span>
    <span class="p-2 hid
    den rounded-2xl text-white "
          :class="taskStatus ? 'bg-green-500' : 'bg-yellow-500'"
    >{{taskStatus? "Fait":"En cours"}}</span>
    <span class="icons">
      <i class="material-icons">delete</i>
      <i class="material-icons">send_and_archive</i>
    </span>
  </div>

</template>

<style scoped>

</style>
