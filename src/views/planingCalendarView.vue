<script setup>
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/vue3'

import { computed, reactive, ref } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import { collection, addDoc, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore'

import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

/* =========================
   Firestore
========================= */
const db = useFirestore()

// ✅ Chargements validés (admin)
const eventsCol = collection(db, 'events')
const eventsSnap = useCollection(eventsCol)

// ✅ Demandes locataires
const requestsCol = collection(db, 'reservationRequests')
const requestsSnap = useCollection(requestsCol)

/* =========================
   UI State
========================= */
const showAddModal = ref(false)
const showDeleteModal = ref(false)
const deleteId = ref('')

const showValidateModal = ref(false)
const selectedRequest = ref(null)

const title = ref('')
const start = ref('') // YYYY-MM-DD
const startTime = ref('')
const validationTime = ref('')

// ✅ helpers label: "Nom — DESTINATION"
const displayLabel = (name = '', destination = '') => {
  const n = (name || '').trim()
  const d = (destination || '').trim()
  if (n && d) return `${n} — ${d}`
  return n || d || 'Chargement'
}

const buildDateTime = (date = '', time = '') => {
  if (!date) return ''
  return time ? `${date}T${time}` : date
}

const extractTime = (value = '') => {
  const match = String(value || '').match(/T(\d{2}:\d{2})/)
  return match?.[1] || ''
}

/* =========================
   Merge events + pending requests
   => Affichage calendrier : NOM + DESTINATION seulement
========================= */
const eventsList = computed(() => {
  const approvedEvents = (eventsSnap.value || []).map(d => {
    const label = displayLabel(d.tenantName || d.title, d.destination)
    return {
      id: d.id,
      title: label,              // ✅ nom + destination
      start: d.startTime ? buildDateTime(d.start, d.startTime) : d.start,
      allDay: !d.startTime,
      extendedProps: {
        status: 'approved',
        source: 'events',
        destination: d.destination || '',
        tenantName: d.tenantName || '',
        startTime: d.startTime || extractTime(d.start),
        requestId: d.requestId || ''
      }
    }
  })

  const pendingRequests = (requestsSnap.value || [])
    .filter(r => (r.status || 'pending') === 'pending')
    .map(r => {
      const label = displayLabel(r.tenantName, r.destination)
      return {
        id: `req-${r.id}`,
        title: label,             // ✅ nom + destination
        start: r.requestedTime ? buildDateTime(r.requestedDate, r.requestedTime) : r.requestedDate,
        allDay: !r.requestedTime,
        extendedProps: {
          status: 'pending',
          source: 'requests',
          requestId: r.id,
          requestedTime: r.requestedTime || extractTime(r.requestedDate),
          data: r
        }
      }
    })

  return [...approvedEvents, ...pendingRequests]
})

/* =========================
   FullCalendar options
========================= */
const options = reactive({
  handleWindowResize: true,
  height: 650,
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,listDay'
  },
  locale: 'fr',
  firstDay: 1,
  weekNumbers: true,
  editable: true,
  selectable: true,

  navLinks: true,
  expandRows: true,
  stickyHeaderDates: true,

  // ✅ afficher tout (pas de "+n more")
  dayMaxEventRows: false,
  dayMaxEvents: false,

  events: eventsList,
  currentEvents: [],

  eventsSet: (events) => {
    options.currentEvents = events.map(e => ({
      id: e.id,
      title: e.title,
      start: e.startStr,
      time: e.extendedProps?.startTime || e.extendedProps?.requestedTime || extractTime(e.startStr),
      status: e.extendedProps?.status
    }))
  },

  eventClassNames: (arg) => {
    const st = arg.event.extendedProps?.status
    if (st === 'pending') return ['evt-pending']
    if (st === 'approved') return ['evt-approved']
    if (st === 'rejected') return ['evt-rejected']
    return ['evt-default']
  },

  // tooltip simple
  eventDidMount: (info) => {
    const st = info.event.extendedProps?.status || ''
    const time = info.event.extendedProps?.startTime || info.event.extendedProps?.requestedTime || extractTime(info.event.startStr)
    info.el.setAttribute('title', `${time ? `${time} - ` : ''}${info.event.title} (${st})`)
  },

  dateClick: (arg) => {
    start.value = arg.dateStr
    startTime.value = ''
    showAddModal.value = true
  },

  eventClick: (arg) => {
    const st = arg.event.extendedProps?.status
    if (st === 'pending') {
      selectedRequest.value = arg.event.extendedProps?.data || null
      validationTime.value = selectedRequest.value?.requestedTime || extractTime(selectedRequest.value?.requestedDate) || ''
      showValidateModal.value = true
      return
    }
    deleteId.value = arg.event.id
    showDeleteModal.value = true
  },

  eventDrop: async (info) => {
    try {
      const st = info.event.extendedProps?.status
      if (st === 'pending') {
        info.revert()
        toast("Tu peux pas déplacer une demande en attente.", { type: 'info', autoClose: 1200 })
        return
      }
      const refDoc = doc(db, 'events', info.event.id)
      const newDate = info.event.startStr.slice(0, 10)
      const newTime = extractTime(info.event.startStr) || info.event.extendedProps?.startTime || ''
      await updateDoc(refDoc, { start: newDate, startTime: newTime, allDay: !newTime })
      toast('Date mise à jour', { type: 'success', autoClose: 900 })
    } catch (e) {
      info.revert()
      toast('Erreur mise à jour', { type: 'error' })
    }
  }
})

/* =========================
   Lists
========================= */
const futureEvents = computed(() =>
  (options.currentEvents || []).filter(ev => new Date(ev.start) >= new Date())
)

const pendingCount = computed(() =>
  (requestsSnap.value || []).filter(r => (r.status || 'pending') === 'pending').length
)

/* =========================
   CRUD
========================= */
async function addLoading() {
  try {
    if (!title.value?.trim() || !start.value) {
      toast('Titre et date requis', { type: 'warning', autoClose: 1200 })
      return
    }

    await addDoc(eventsCol, {
      title: title.value.trim(),
      start: new Date(start.value).toISOString().slice(0, 10),
      startTime: startTime.value || '',
      allDay: !startTime.value,
      createdAt: serverTimestamp()
    })

    title.value = ''
    start.value = ''
    startTime.value = ''
    showAddModal.value = false
    toast('Chargement enregistré', { type: 'success', autoClose: 1000 })
  } catch (e) {
    toast('Erreur lors de la création', { type: 'error' })
  }
}

async function confirmDelete() {
  try {
    if (!deleteId.value) return
    await deleteDoc(doc(db, 'events', deleteId.value))
    showDeleteModal.value = false
    toast('Chargement supprimé', { type: 'success', autoClose: 1000 })
  } catch (e) {
    toast('Erreur de suppression', { type: 'error' })
  }
}

async function validateRequest() {
  try {
    const req = selectedRequest.value
    if (!req?.id) {
      toast("Demande introuvable", { type: 'error' })
      return
    }

    const label = displayLabel(req.tenantName, req.destination)

    const newEvent = await addDoc(eventsCol, {
      title: label, // ✅ label final = nom + destination
      start: req.requestedDate,
      startTime: validationTime.value || req.requestedTime || '',
      allDay: !(validationTime.value || req.requestedTime),
      destination: req.destination || '',
      tenantName: req.tenantName || '',
      tenantPhone: req.tenantPhone || '',
      requestId: req.id,
      createdAt: serverTimestamp()
    })

    await updateDoc(doc(db, 'reservationRequests', req.id), {
      status: 'approved',
      linkedEventId: newEvent.id,
      validatedAt: serverTimestamp()
    })

    toast('Demande validée ✅', { type: 'success', autoClose: 1200 })
    showValidateModal.value = false
    selectedRequest.value = null
    validationTime.value = ''
  } catch (e) {
    console.error(e)
    toast('Erreur validation', { type: 'error' })
  }
}

async function rejectRequest() {
  try {
    const req = selectedRequest.value
    if (!req?.id) return

    await updateDoc(doc(db, 'reservationRequests', req.id), {
      status: 'rejected',
      validatedAt: serverTimestamp()
    })

    toast('Demande refusée', { type: 'info', autoClose: 1200 })
    showValidateModal.value = false
    selectedRequest.value = null
    validationTime.value = ''
  } catch (e) {
    console.error(e)
    toast('Erreur refus', { type: 'error' })
  }
}
</script>

<template>
  <div class="flex w-full max-w-full flex-col gap-4 overflow-x-hidden py-4 text-slate-900">
    <div class="flex w-full max-w-[1400px] flex-col gap-3 self-center px-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-bold text-slate-900">Planning des chargements</h1>
        <p class="text-slate-600 text-xs">
          Demandes en attente :
          <span class="font-semibold text-amber-600">{{ pendingCount }}</span>
        </p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showAddModal = true">Ajouter</button>
    </div>

    <div class="grid w-full max-w-[1400px] grid-cols-1 gap-3 self-center px-2 md:grid-cols-7">
      <aside class="md:col-span-2">
        <div class="w-full rounded-xl bg-white shadow-md border border-slate-100 px-3 py-3">
          <h2 class="font-semibold mb-3 text-slate-900 flex items-center justify-between">
            <span>À venir</span>
            <span class="px-2 py-0.5 text-xs rounded-full bg-cyan-700 text-white">{{ futureEvents.length }}</span>
          </h2>

          <ul class="space-y-2">
            <li v-for="ev in futureEvents" :key="ev.id" class="flex items-center gap-2">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="ev.status === 'pending' ? 'bg-amber-500' : 'bg-emerald-600'"
              />
              <span class="text-sm text-slate-800 truncate">
                <span v-if="ev.time" class="font-bold text-slate-950">{{ ev.time }}</span>
                {{ ev.title }}
              </span>
            </li>

            <li v-if="futureEvents.length === 0" class="text-sm text-slate-500">
              Rien de prévu
            </li>
          </ul>

          <div class="mt-4 text-xs text-slate-700 space-y-1">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              Validé
            </div>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              En attente
            </div>
          </div>
        </div>
      </aside>

      <section class="md:col-span-5">
        <div class="rounded-xl bg-white shadow-md border border-slate-100 p-2 md:p-3 mb-[20%]">
          <FullCalendar class="w-full text-[13px] md:text-[15px]" :options="options" />
        </div>
      </section>
    </div>

    <!-- Modal Add -->
    <dialog class="modal" :open="showAddModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-lg text-slate-900">Nouveau chargement</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showAddModal = false">✕</button>
        </div>

        <div class="mt-4">
          <label class="block text-sm font-medium text-slate-800">Date</label>
          <input
            type="date"
            v-model="start"
            class="mt-1 mb-4 block w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />

          <label class="block text-sm font-medium text-slate-800">Heure</label>
          <input
            type="time"
            v-model="startTime"
            class="mt-1 mb-4 block w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />

          <label class="block text-sm font-medium text-slate-800">Titre</label>
          <input
            type="text"
            v-model="title"
            class="mt-2 block w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            placeholder="Ex: Jules — TOGO"
          />

          <div class="mt-6 flex justify-end gap-2">
            <button class="btn" @click="showAddModal = false">Annuler</button>
            <button class="btn btn-primary" @click="addLoading">Enregistrer</button>
          </div>
        </div>
      </div>
    </dialog>

    <!-- Modal Delete -->
    <dialog class="modal" :open="showDeleteModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-lg text-slate-900">Suppression</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showDeleteModal = false">✕</button>
        </div>
        <p class="py-4 text-slate-800">Supprimer ce chargement ?</p>
        <div class="modal-action">
          <button class="btn" @click="showDeleteModal = false">Non</button>
          <button class="btn btn-error text-white" @click="confirmDelete">Oui</button>
        </div>
      </div>
    </dialog>

    <!-- Modal Validate -->
    <dialog class="modal" :open="showValidateModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-lg text-slate-900">Demande de réservation</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showValidateModal = false">✕</button>
        </div>

        <div class="mt-4 text-sm text-slate-800 space-y-2">
          <p><span class="font-semibold">Nom :</span> {{ selectedRequest?.tenantName }}</p>
          <p><span class="font-semibold">Destination :</span> {{ selectedRequest?.destination }}</p>
          <p><span class="font-semibold">Date :</span> {{ selectedRequest?.requestedDate }}</p>
          <label class="block pt-2">
            <span class="font-semibold">Heure de réservation :</span>
            <input
              v-model="validationTime"
              type="time"
              class="mt-2 block w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </label>
          <p v-if="selectedRequest?.message">
            <span class="font-semibold">Message :</span> {{ selectedRequest?.message }}
          </p>
        </div>

        <div class="modal-action">
          <button class="btn" @click="showValidateModal = false">Annuler</button>
          <button class="btn btn-error text-white" @click="rejectRequest">Refuser</button>
          <button class="btn btn-success text-white" @click="validateRequest">Valider</button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
:deep(.fc-daygrid-day) {
  cursor: pointer;
  transition: background-color .15s ease;
}
:deep(.fc-daygrid-day:hover .fc-daygrid-day-frame) {
  background: rgba(99,102,241,0.10);
}
:deep(.fc-daygrid-day.fc-day-today .fc-daygrid-day-frame) {
  background: rgba(99,102,241,0.12);
  outline: 2px solid rgba(99,102,241,0.18);
  outline-offset: -2px;
}

/* ✅ Couleurs */
:deep(.evt-approved) {
  background: rgb(5 150 105) !important;
  color: #fff !important;
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
:deep(.evt-rejected) {
  background: rgb(239 68 68) !important;
  color: #fff !important;
  border: none !important;
  border-radius: 10px !important;
  padding: 2px 8px !important;
  font-weight: 700 !important;
}

:deep(.fc-daygrid-more-link) {
  display: none !important;
}
</style>
