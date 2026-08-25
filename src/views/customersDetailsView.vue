<script setup>
  import { useCollection, useDocument, useFirestore } from 'vuefire'
  import { collection, doc, query, where } from 'firebase/firestore'
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { format } from 'date-fns'
  import frLocale from 'date-fns/locale/fr'
  import { toast } from 'vue3-toastify'
  import { useAuthStore } from '../stores/useAuthStore.js'
  
  import Form from "../views/form.vue" // <— ajuste si besoin
  
  // ======================
  // Firestore + Collections
  // ======================
  const route = useRoute()
  const db = useFirestore()
  const authStore = useAuthStore()
  
  const detailId = ref(route.params.id)
  const myId = detailId.value
  const legacyCustomer = useDocument(doc(db, 'customers', myId))
  const portalClient = useDocument(doc(db, 'clients', myId))
  const EnlevementsCol = useCollection(query(collection(db, 'enlevements'), where('customerId', '==', myId)))
  
  // ======================
  // Client courant (legacy OU portail)
  // ======================
  const clientCurrent = computed(() => {
    return (
      legacyCustomer.value ||
      portalClient.value ||
      null
    )
  })
  
  // ======================
  // Liste des enlèvements du client
  // ======================
  const listeColis = computed(() => {
    return EnlevementsCol.value || []
  })
  
  const formatDateTime = (dateTimeString) => {
    const date = new Date(dateTimeString)
    return format(date, "EEEE d MMMM yyyy à HH'h' mm", { locale: frLocale })
  }
  
  // ======================
  // Modal + Form state
  // ======================
  const modalRef = ref(null)
  const formMode = ref('create') // 'create' | 'edit'
  const formDocId = ref('')
  const initialData = ref({})

  const clientDisplayName = computed(() => {
    const c = clientCurrent.value || {}
    return c.displayName || [c.prenom, c.nom].filter(Boolean).join(' ').trim() || 'Client'
  })

  const isAdminView = computed(() => authStore.initialized && authStore.role !== 'client')
  
  const openCreate = () => {
    formMode.value = 'create'
    formDocId.value = ''
    initialData.value = {}
    modalRef.value?.showModal()
  }
  
  const openEdit = (doc) => {
    formMode.value = 'edit'
    formDocId.value = doc.id
    initialData.value = doc
    modalRef.value?.showModal()
  }
  
  const onSaved = () => {
    modalRef.value?.close()
    toast('Enlèvement enregistré ✅', { type: 'success', autoClose: 1000 })
  }

  </script>
  
  <template>
    <div class="flex flex-col items-center p-6 bg-gray-100 min-h-screen">
      <!-- Titre -->
      <span class="bg-indigo-600 text-white my-6 px-12 py-3 rounded-lg shadow-lg text-2xl font-semibold">
        Enlèvements
      </span>
  
      <!-- Infos client (optional mais utile) -->
      <div v-if="clientCurrent" class="w-full max-w-3xl bg-white rounded-lg shadow p-4 mb-4">
        <p class="text-gray-900 font-semibold">
          {{ clientDisplayName }}
        </p>
        <p class="text-sm text-gray-600">
          📞 {{ clientCurrent.telephone || clientCurrent.phone || '-' }}
        </p>
        <p class="text-sm text-gray-600">
          📍 {{ clientCurrent.adresse || clientCurrent.adresseComplete || '-' }}
        </p>
      </div>
  
      <div v-else class="w-full max-w-3xl bg-white rounded-lg shadow p-4 mb-4">
        <p class="text-sm text-red-600">
          Client introuvable (id: {{ detailId }}) — vérifie la route / l’id.
        </p>
      </div>
  
      <!-- Bouton ajout -->
      <button
        v-if="isAdminView"
        class="flex items-center bg-green-500 text-white px-6 py-2 my-6 rounded-full shadow-lg text-lg font-medium hover:bg-green-600 transition duration-300"
        @click="openCreate"
      >
        Nouvel Envoi
        <svg xmlns="http://www.w3.org/2000/svg" fill="none"
             viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
             class="w-6 h-6 ml-2">
          <path stroke-linecap="round" stroke-linejoin="round"
                d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </button>
  
      <!-- Liste enlèvements -->
      <div class="flex flex-col w-full max-w-3xl space-y-4 pb-20">
        <div
          v-for="(item, i) in listeColis"
          :key="item.id || i"
          class="bg-white border border-gray-200 px-6 py-4 rounded-lg shadow-sm flex justify-between items-center hover:shadow-md transition duration-300"
        >
          <span class="text-gray-700 font-medium">
            Enlèvement du {{ formatDateTime(item.date) }}
          </span>
  
          <div class="flex gap-2">
            <router-link :to="'/liste/' + item.id">
              <button class="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition duration-300">
                Voir
              </button>
            </router-link>
  
            <button
              v-if="isAdminView"
              class="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition duration-300"
              @click="openEdit(item)"
            >
              Éditer
            </button>
          </div>
        </div>
      </div>
    </div>
  
    <!-- Modal Form -->
    <dialog v-if="isAdminView" ref="modalRef" class="modal">
      <div class="modal-box max-h-[92vh] w-[min(1180px,calc(100vw-1.5rem))] max-w-none overflow-hidden bg-white p-0 text-slate-950">
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">
              {{ formMode === 'edit' ? 'Modification' : 'Nouvel envoi' }}
            </p>
            <h3 class="text-lg font-bold text-slate-950">
              {{ formMode === 'edit' ? 'Modifier l’enlèvement' : 'Créer un enlèvement client' }}
            </h3>
          </div>
          <form method="dialog">
            <button
              class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              type="submit"
            >
              X
            </button>
          </form>
        </div>

        <div class="max-h-[calc(92vh-73px)] overflow-y-auto px-5 py-5">
          <Form
            :mode="formMode"
            :doc-id="formDocId"
            :initial-data="initialData"
            :my-id="myId"
            :expediteur-data="clientCurrent"
            embedded
            @saved="onSaved"
          />

          <div class="modal-action sticky bottom-0 bg-white/95 py-3 backdrop-blur">
            <form method="dialog">
              <button class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Fermer
              </button>
            </form>
          </div>
        </div>
      </div>
    </dialog>
  </template>
  
  <style scoped>
  /* Styles spécifiques si besoin */
  </style>
  
