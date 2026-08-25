<script setup>

</script>

<template>
  <div>
    <h1>Allouer un Box à un Client</h1>
    <form @submit.prevent="allocateBox">
      <div>
        <label for="box">Box disponible :</label>
        <select v-model="selectedBox" id="box" required>
          <option value="" disabled selected>Choisissez un box</option>
          <option v-for="box in availableBoxes" :key="box.id" :value="box.id">
            {{ box.number }} - {{ box.location }}
          </option>
        </select>
      </div>

      <div>
        <label for="client">Client :</label>
        <select v-model="selectedClient" id="client" required>
          <option value="" disabled selected>Choisissez un client</option>
          <option v-for="client in clients" :key="client.id" :value="client.id">
            {{ client.name }} ({{ client.email }})
          </option>
        </select>
      </div>

      <div>
        <label for="startDate">Date de début :</label>
        <input type="date" id="startDate" v-model="startDate" required />
      </div>

      <div>
        <label for="endDate">Date de fin :</label>
        <input type="date" id="endDate" v-model="endDate" required />
      </div>

      <button type="submit">Allouer le Box</button>
    </form>

    <p v-if="successMessage">{{ successMessage }}</p>
  </div>
</template>
