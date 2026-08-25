<script setup>

    import {useTasksStore} from "../stores/tasksStore.js";
    import TaskDetails from "../components/taskDetails.vue";
    import {ref} from "vue";
    import TaskForm from "../components/taskForm.vue";

    const tasksStore = useTasksStore()
    const filter = ref('all')

</script>

<template>
<div class="text-black px-2">
  <div>
    <h1 class="title text-center py-4 text-black ">{{tasksStore.title}} </h1>
  </div>

  <!--- formulaire -->
  <div>
     <task-form />
  </div>

  <nav class="flex flex-row justify-center items-center">
    <button class="  text-black btn btn-outline mx-4" @click="filter='all'" >Tous</button>
    <button class="  text-black btn btn-outline" @click="filter='done'" >Finis</button>
  </nav>

 <div  v-if="filter === 'all'">
   <p class="pt-2">Tous les trajets ({{tasksStore.totalCount}}) </p>
   <ul class=" md:grid grid-cols-3 gap-4 " >
   <li class="" v-for="task in tasksStore.tasks" :key="task.id"  >
     <TaskDetails :taskid = "task.id"  :task-status="task.status" :task-text="task.text"  :task-adresse="task.adresse"  />
   </li>
   </ul>
 </div>

  <div v-if="filter === 'done'">
    <p class="pt-2">Trajets finis </p>
    <p>Il vous reste {{tasksStore.doneCount}} trajets à faire </p>
    <ul class=" md:grid grid-cols-3 gap-4 " >
      <li class="" v-for="task in tasksStore.done" :key="task.id"  >
        <TaskDetails :taskid = "task.id"  :task-status="task.status" :task-text="task.text" :task-adresse="task.adresse" />
      </li>
    </ul>
  </div>

</div>
</template>

<style scoped>
.title{

}
</style>
