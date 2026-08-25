<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"
import { toast } from "vue3-toastify"
import Form from "./form.vue"
import { db } from "../components/firebaseConfig"

const route = useRoute()
const tracking = ref(false)
const locating = ref(false)
const locationError = ref("")
const lastPosition = ref(null)
const watchId = ref(null)
const unsubscribeStopRequest = ref(null)
const stopRequestHandled = ref(false)

const driverId = computed(() => String(route.query.driverId || route.query.chauffeur || "chauffeur").trim())
const tourneeId = computed(() => String(route.query.tournee || route.query.tourneeId || new Date().toISOString().slice(0, 10)).trim())
const driverName = computed(() => String(route.query.name || route.query.nom || driverId.value).trim())

const locationRef = computed(() => doc(db, "driverLocations", `${driverId.value}_${tourneeId.value}`))

function hasGeolocation() {
  return typeof navigator !== "undefined" && Boolean(navigator.geolocation)
}

async function savePosition(position, status = "active") {
  const payload = {
    driverId: driverId.value,
    driverName: driverName.value,
    tourneeId: tourneeId.value,
    status,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy || null,
    heading: position.coords.heading || null,
    speed: position.coords.speed || null,
    updatedAt: serverTimestamp(),
  }

  lastPosition.value = {
    ...payload,
    updatedAtLabel: new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  }

  await setDoc(locationRef.value, payload, { merge: true })
}

function startTracking() {
  if (watchId.value !== null) return

  if (!hasGeolocation()) {
    locationError.value = "La localisation n'est pas disponible sur ce téléphone."
    return
  }

  locating.value = true
  locationError.value = ""

  watchId.value = navigator.geolocation.watchPosition(
    async (position) => {
      try {
        await savePosition(position)
        tracking.value = true
        locating.value = false
      } catch (e) {
        console.error(e)
        locationError.value = "Impossible d'enregistrer la position."
        locating.value = false
      }
    },
    (err) => {
      console.error(err)
      locationError.value = "Autorise la localisation pour que le bureau voie la tournée."
      locating.value = false
      tracking.value = false
    },
    {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 15000,
    }
  )
}

async function stopTracking(message = "Suivi arrêté") {
  if (watchId.value !== null) {
    navigator.geolocation.clearWatch(watchId.value)
    watchId.value = null
  }

  tracking.value = false

  try {
    if (lastPosition.value) {
      await setDoc(locationRef.value, {
        status: "stopped",
        stoppedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
    }
    toast(message, { type: "info", autoClose: 1200 })
  } catch (e) {
    console.error(e)
  }
}

function listenForStopRequest() {
  unsubscribeStopRequest.value = onSnapshot(locationRef.value, (snap) => {
    const data = snap.data() || {}
    if (data.stopRequested && !stopRequestHandled.value) {
      stopRequestHandled.value = true
      locationError.value = "Le bureau a arrêté le suivi de cette tournée."
      stopTracking("Suivi arrêté par le bureau")
    }
    if (data.stopRequested === false && stopRequestHandled.value) {
      stopRequestHandled.value = false
      locationError.value = ""
      startTracking()
    }
  })
}

onBeforeUnmount(() => {
  if (unsubscribeStopRequest.value) unsubscribeStopRequest.value()
  stopTracking()
})
onMounted(() => {
  listenForStopRequest()
  startTracking()
})
</script>

<template>
  <main class="min-h-screen bg-[#f6f8fb] px-4 py-5 text-slate-900">
    <section class="mx-auto max-w-6xl space-y-5">
      <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Formulaire chauffeur</p>
            <h1 class="mt-2 text-2xl font-bold text-slate-950">Enregistrement d'enlèvement</h1>
            <p class="mt-2 text-sm text-slate-600">
              Chauffeur : <span class="font-semibold">{{ driverName }}</span>
              <span class="mx-2 text-slate-300">•</span>
              Tournée : <span class="font-semibold">{{ tourneeId }}</span>
            </p>
          </div>
        </div>

        <p v-if="locationError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Autorise la notification de localisation du téléphone, puis garde cette page ouverte.
        </p>
      </div>

      <Form disable-dictation />
    </section>
  </main>
</template>
