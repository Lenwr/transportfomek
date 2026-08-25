<script setup>
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import FullCalendar from "@fullcalendar/vue3"

import { computed, reactive, ref } from "vue"
import { useCollection, useFirestore } from "vuefire"
import { collection, doc, serverTimestamp, query, orderBy, runTransaction } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

const db = useFirestore()

/* =========================
   Firestore collections
========================= */
const eventsSnap = useCollection(collection(db, "events"))
// ✅ pays collection (tri alpha)
const countriesCol = collection(db, "pays")
const countriesSnap = useCollection(query(countriesCol, orderBy("name", "asc")))

/* =========================
   UI state
========================= */
const showModal = ref(false)

const tenantName = ref("")
const tenantPhone = ref("")
const requestedDate = ref("")
const destination = ref("")        // valeur choisie (name)
const customCountry = ref("")      // saisie si pas dans la liste
const message = ref("")
const isSubmitting = ref(false)
const submitted = ref(false)

/* =========================
   Computeds
========================= */
const countries = computed(() => {
  const map = new Map()
  map.set("TOGO", { id: "default-togo", name: "TOGO" })

  for (const c of countriesSnap.value || []) {
    const name = String(c.name || "").trim()
    if (!name) continue
    map.set(normCountry(name), { id: c.id, name })
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"))
})

function normCountry(s) {
  return String(s || "").trim().toUpperCase()
}

/* =========================
   Helpers calendrier
========================= */
function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "")
}

function phoneKey(value) {
  return normalizePhone(value).replace(/\D/g, "")
}

function selectedDestination() {
  return normCountry(destination.value === "__OTHER__" ? customCountry.value : destination.value)
}

/* =========================
   Calendar events
========================= */
const eventsList = computed(() => {
  const approved = (eventsSnap.value || []).map((e) => ({
    id: e.id,
    title: "Date occupée",
    start: e.start,
    allDay: true,
    extendedProps: { status: "approved" },
  }))

  return approved
})

const options = reactive({
  plugins: [dayGridPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  locale: "fr",
  firstDay: 1,
  height: 650,
  selectable: false,
  editable: false,
  navLinks: true,
  dayMaxEventRows: false,
  dayMaxEvents: false,
  events: eventsList,

  dateClick: (arg) => {
    requestedDate.value = arg.dateStr
    showModal.value = true
  },

  eventClassNames: (arg) => {
    const st = arg.event.extendedProps?.status
    if (st === "pending") return ["evt-pending"]
    return ["evt-approved"]
  },
})

/* =========================
   Submit request
========================= */
async function submitRequest() {
  if (isSubmitting.value) return

  try {
    const phone = normalizePhone(tenantPhone.value)
    const phoneLockKey = phoneKey(phone)
    const finalDest = selectedDestination()

    if (!tenantName.value || !tenantPhone.value || !requestedDate.value) {
      toast("Nom, téléphone et date obligatoires ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    if (!finalDest) {
      toast("Destination obligatoire ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    if (phoneLockKey.length < 8) {
      toast("Téléphone invalide ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    const selectedDate = new Date(`${requestedDate.value}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (Number.isFinite(selectedDate.getTime()) && selectedDate < today) {
      toast("Choisis une date à venir ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    isSubmitting.value = true

    await runTransaction(db, async (transaction) => {
      const lockRef = doc(db, "publicSubmissionLocks", `reservation-${phoneLockKey}`)
      const requestRef = doc(collection(db, "reservationRequests"))
      const lockSnap = await transaction.get(lockRef)
      const lastSubmittedAtMs = Number(lockSnap.data()?.lastSubmittedAtMs || 0)
      const cooldownMs = 15 * 60 * 1000

      if (lastSubmittedAtMs && Date.now() - lastSubmittedAtMs < cooldownMs) {
        throw new Error("Une demande a déjà été envoyée récemment avec ce numéro.")
      }

      transaction.set(requestRef, {
        tenantName: tenantName.value.trim().slice(0, 120),
        tenantPhone: phone,
        phoneKey: phoneLockKey,
        requestedDate: requestedDate.value,
        destination: finalDest.slice(0, 80),
        message: message.value.trim().slice(0, 800),
        status: "pending",
        source: "publicRequests",
        createdAt: serverTimestamp(),
      })

      transaction.set(lockRef, {
        phoneKey: `reservation-${phoneLockKey}`,
        lastSubmittedAt: serverTimestamp(),
        lastSubmittedAtMs: Date.now(),
      })
    })

    toast("Demande envoyée ✅", { type: "success", autoClose: 1200 })
    showModal.value = false
    submitted.value = true

    tenantName.value = ""
    tenantPhone.value = ""
    destination.value = ""
    customCountry.value = ""
    message.value = ""
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur lors de l’envoi ❌", { type: "error" })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex w-full max-w-full flex-col gap-4 overflow-x-hidden px-3 py-4 text-slate-900">
    <div class="flex w-full max-w-[1200px] flex-col gap-3 self-center sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-bold">Demande de réservation</h1>
        <p class="text-slate-600 text-xs">Choisis une date souhaitée, puis laisse tes coordonnées.</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showModal = true">Faire une demande</button>
    </div>

    <div v-if="submitted" class="w-full max-w-[1200px] self-center rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
      Merci, ta demande a bien été envoyée. Notre équipe reviendra vers toi pour confirmer la réservation.
    </div>

    <div class="grid w-full max-w-[1200px] grid-cols-1 gap-3 self-center">
      <section>
        <div class="rounded-xl bg-white shadow-md border border-slate-100 p-2 md:p-3">
          <FullCalendar :options="options" />
        </div>
      </section>
    </div>

    <!-- Modal request -->
    <dialog class="modal" :open="showModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-lg text-slate-900">Demande de réservation</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showModal = false">✕</button>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="text-sm font-medium text-slate-800">Nom</label>
            <input v-model="tenantName" class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2" />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Téléphone</label>
            <input v-model="tenantPhone" class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2" />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Date souhaitée</label>
            <input type="date" v-model="requestedDate" class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2" />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Destination</label>
            <select v-model="destination" class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2">
              <option value="">Choisir une destination</option>
              <option v-for="c in countries" :key="c.id" :value="c.name">
                {{ c.name }}
              </option>
              <!-- option “autre” -->
              <option value="__OTHER__">Autre…</option>
            </select>

            <!-- si Autre… -->
            <div v-if="destination === '__OTHER__'" class="mt-2 flex gap-2">
              <input
                v-model="customCountry"
                class="w-full border border-slate-200 rounded-xl px-3 py-2"
                placeholder="Entre le pays (ex: GHANA)"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Message</label>
            <textarea v-model="message" rows="3" class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2" />
          </div>

          <div class="pt-2 flex justify-end gap-2">
            <button class="btn" @click="showModal = false">Annuler</button>
            <button class="btn btn-primary min-w-28" :disabled="isSubmitting" @click="submitRequest">
              <span v-if="isSubmitting" class="loading loading-spinner loading-sm"></span>
              <span v-else>Envoyer</span>
            </button>
          </div>
          <progress v-if="isSubmitting" class="progress progress-primary w-full" />
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
:deep(.fc-daygrid-day) { cursor: pointer; transition: background-color .15s ease; }
:deep(.fc-daygrid-day:hover .fc-daygrid-day-frame) { background: rgba(99,102,241,0.10); }

:deep(.evt-approved) {
  background: rgb(5 150 105) !important;
  color: white !important;
  border: none !important;
  border-radius: 10px !important;
  padding: 2px 8px !important;
  font-weight: 700 !important;
}
:deep(.evt-pending) {
  background: rgb(245 158 11) !important;
  color: rgb(15 23 42) !important;
  border: none !important;
  border-radius: 10px !important;
  padding: 2px 8px !important;
  font-weight: 700 !important;
}
:deep(.fc-daygrid-more-link) { display: none !important; }
</style>
