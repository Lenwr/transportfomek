import "./style.css"
import { createApp } from "vue"
import App from "./App.vue"
import router from "./router"
import { VueFire } from "vuefire"
import { createPinia } from "pinia"
import { onAuthStateChanged } from "firebase/auth"

import { firebaseApp, db, auth } from "./components/firebaseConfig.js"

const app = createApp(App)

app.use(router)

app.use(VueFire, {
  firebaseApp,
  firestore: db, // ✅ IMPORTANT : Vuefire utilise le db long-polling
  modules: [],
})

app.use(createPinia())

// Firebase restaure la session de façon asynchrone. Attendre son premier état
// évite que les listeners Firestore démarrent sans utilisateur puis restent vides.
const stopAuthBootstrap = onAuthStateChanged(auth, () => {
  stopAuthBootstrap()
  app.mount("#app")
})
