<script setup>
import {ref} from "vue";
import { getAuth , signInWithEmailAndPassword } from "firebase/auth";
import {useRouter} from "vue-router";

const router = useRouter()
const nom=ref('')
const displayName = ref()
const email=ref("")
const motDePasse = ref('')
const errMsg = ref()

const login = () => {
  const auth = getAuth()
  signInWithEmailAndPassword(auth, email.value , motDePasse.value )
      .then((data)=>{
        console.log('enregistrement succès')
        console.log(auth.currentUser)
        router.push('/')
      })
      .catch((error)=>{
        console.log(error.code)
        switch(error.code){
          case "auth/invalid-email":
          errMsg.value = 'Mot de passe incorrect';
          break;
          case "auth/user-not-found":
            errMsg.value = 'Pas de compte associé a ce mot de passe';
            break;
          case "auth/wrong-password":
            errMsg.value = 'Mot de passe incorrect';
            break;
          default:
            errMsg.value = 'Email ou mot de passe incorrect';
            break;
        }
      })
}

</script>

<template>
  <!--
    This example requires updating your template:

    ```
    <html class="h-full bg-white">
    <body class="h-full">
    ```
  -->
  <div class="flex  min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <img class="mx-auto h-[10em] w-auto" src="/images/logo-fomek.png" alt="Transport Fomek"/>
      <h2 class="text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">Connexion</h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <form class="space-y-6" >
<!--
        <div>
          <label for="nom" class="block text-sm font-medium leading-6 text-gray-900">Nom d'utilisateur</label>
          <div class="mt-2">
            <input id="nom" name="nom" v-model="nom" type="text" autocomplete="noms" required=""
                   class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
          </div>
        </div>
-->
        <div>
          <label for="email" class="block text-sm font-medium leading-6 text-gray-900">Email</label>
          <div class="mt-2">
            <input id="email" name="email" v-model="email" type="email" autocomplete="email" required=""
                   class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label for="password" class="block text-sm font-medium leading-6 text-gray-900">Mot de passe</label>
            <div class="text-sm">
              <a href="#" class="font-semibold text-primary hover:text-accent">Mot de passe oublié?</a>
            </div>
          </div>
          <div class="mt-2">
            <input id="password" name="password" v-model="motDePasse" type="password" autocomplete="current-password"
                   required=""
                   class="block w-full rounded-md border-0 py-1.5 text-accent shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
          </div>
        </div>

        <div>
          <p class="text-black" v-if="errMsg">{{errMsg}}</p>
          <button
                  class=" my-2 flex w-full justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  @click="login">Connexion
          </button>
        </div>
      </form>
    </div>
  </div>
</template>


<style scoped>

</style>
