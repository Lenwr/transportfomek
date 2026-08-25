import "./style.css"
import { createApp } from "vue"
import App from "./App.vue"
import router from "./router"
import { VueFire } from "vuefire"
import { createPinia } from "pinia"

import { firebaseApp, db } from "./components/firebaseConfig.js"

const app = createApp(App)

app.use(router)

app.use(VueFire, {
  firebaseApp,
  firestore: db, // ✅ IMPORTANT : Vuefire utilise le db long-polling
  modules: [],
})

app.use(createPinia())
app.mount("#app")
