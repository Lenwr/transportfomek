<script setup>
import { useAuthStore } from "../stores/useAuthStore.js";
import { ref } from "vue";

const store = useAuthStore();
const showPassword = ref(false);
const loginError = ref("");
const loading = ref(false);

const login = async () => {
  loginError.value = "";
  loading.value = true;
  try {
    await store.login();
  } catch (error) {
    loginError.value = error?.message || "Connexion impossible.";
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="relative min-h-screen overflow-hidden">
    <!-- Background image -->
    <div
      class="absolute inset-0 bg-cover bg-center scale-105"
      style="background-image: url('/background.jpg')"
    ></div>

    <!-- Overlay -->
    <div class="absolute inset-0 bg-slate-950/70"></div>

    <!-- Decorative gradient -->
    <div class="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-cyan-400/10"></div>

    <!-- Content -->
    <div class="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        <!-- Left side -->
        <div class="hidden lg:block text-white">
          <div class="flex items-center gap-4">
            <img
              class="h-16 w-auto rounded-2xl"
              src="/images/logo-fomek.png"
              alt="Transport Fomek"
            />
            <div>
              <p class="text-sm uppercase tracking-[0.25em] text-white/60">
                Gestion interne
              </p>
              <h1 class="text-xl font-semibold">
                Connexion sécurisée
              </h1>
            </div>
          </div>

          <h2 class="mt-8 max-w-xl text-5xl font-bold leading-tight">
            Accédez à la gestion de Transport Fomek
          </h2>

          <p class="mt-4 max-w-lg text-lg leading-relaxed text-white/75">
            Connecte-toi avec un compte interne autorisé pour piloter les enlèvements,
            les clients, les chargements et la facturation.
          </p>

          <div class="mt-8 flex flex-wrap gap-3 text-sm">
            <span class="rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-md">
              Accès sécurisé
            </span>
            <span class="rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-md">
              Interface rapide
            </span>
            <span class="rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-md">
              Compte personnel
            </span>
          </div>
        </div>

        <!-- Login card -->
        <div
          class="w-full max-w-md mx-auto lg:ml-auto rounded-3xl border border-white/20 bg-white/12 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.35)] p-6 sm:p-8"
        >
          <div class="text-center">
            <img
              class="mx-auto h-20 w-auto rounded-2xl"
              src="/images/logo-fomek.png"
              alt="Transport Fomek"
            />
            <h2 class="mt-4 text-2xl font-bold text-white">
              Connexion
            </h2>
            <p class="mt-2 text-sm text-white/70">
              Accès réservé aux comptes internes
            </p>
          </div>

          <form class="mt-8 space-y-6" @submit.prevent="login">
            <div v-if="loginError" class="rounded-xl border border-red-300 bg-red-500/15 px-4 py-3 text-sm font-semibold text-white">
              {{ loginError }}
            </div>

            <!-- Email -->
            <div>
              <label
                for="email"
                class="block text-sm font-medium text-white/90"
              >
                Email
              </label>
              <div class="mt-2">
                <input
                  id="email"
                  name="email"
                  v-model="store.email"
                  type="email"
                  autocomplete="email"
                  required
                  placeholder="Votre email"
                  class="block w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-white shadow-sm placeholder:text-white/40 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                />
              </div>
            </div>

            <!-- Password -->
            <div>
              <div class="flex items-center justify-between">
                <label
                  for="password"
                  class="block text-sm font-medium text-white/90"
                >
                  Mot de passe
                </label>

                <button
                  type="button"
                  class="text-xs text-white/70 hover:text-white hover:underline"
                  @click="showPassword = !showPassword"
                  tabindex="-1"
                >
                  {{ showPassword ? "Masquer" : "Afficher" }}
                </button>
              </div>

              <div class="mt-2 relative">
                <input
                  :type="showPassword ? 'text' : 'password'"
                  id="password"
                  name="password"
                  v-model="store.password"
                  autocomplete="current-password"
                  required
                  placeholder="Votre mot de passe"
                  class="block w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 pr-10 text-white shadow-sm placeholder:text-white/40 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                />

                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute inset-y-0 right-3 flex items-center text-white/60 hover:text-white"
                  tabindex="-1"
                >
                  <span v-if="!showPassword">👁️</span>
                  <span v-else>🙈</span>
                </button>
              </div>
            </div>

            <!-- Submit -->
            <div>
              <button
                type="submit"
                class="flex w-full justify-center rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:scale-[1.01] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70"
                :disabled="loading"
              >
                {{ loading ? "Connexion..." : "Connexion" }}
              </button>
            </div>
      
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
