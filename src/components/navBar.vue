<script setup>
import { useAuthStore } from "../stores/useAuthStore";
import router from "../router";

const authStore = useAuthStore();

async function logout() {
  await authStore.logout();
}
</script>

<template>
  <div class="navbar bg-base-100 shadow-sm px-4">

    <!-- LEFT -->
    <div class="navbar-start">
      <div class="dropdown">
        <div tabindex="0" role="button" class="btn btn-ghost btn-circle">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </div>

        <ul tabindex="0"
          class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">

          <li><router-link to="/stats-enlevements">Dashboard Enlevements</router-link></li>
          <li><router-link to="/customersForm">Enregistrer un client</router-link></li>
          <li><router-link to="/form">Enregistrer un colis</router-link></li>
          <li><router-link to="/customers">Mes clients</router-link></li>
          <li><router-link to="/pickup-requests">Mes Demandes</router-link></li>
          <li><router-link to="/liste">Mes colis</router-link></li>
          <li><router-link to="/pricing">Catalogue</router-link></li>

        </ul>
      </div>
    </div>

    <!-- RIGHT -->
    <div class="navbar-end">

      <div class="dropdown dropdown-end">

        <!-- Avatar -->
        <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
          <div class="w-10 rounded-full bg-primary text-white flex items-center justify-center">
            {{ authStore.user?.email?.charAt(0).toUpperCase() || "U" }}
          </div>
        </div>

        <!-- Dropdown -->
        <ul tabindex="0"
          class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">

          <li class="px-3 py-2 text-xs text-gray-400">
            {{ authStore.user?.email }}
          </li>

          <li>
            <button @click="logout" class="text-red-500">
              Déconnexion
            </button>
          </li>

        </ul>
      </div>

    </div>

  </div>
</template>
