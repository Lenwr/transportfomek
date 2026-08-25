<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFirestore } from 'vuefire'
import {
  collection,
  query,
  orderBy,
  doc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore'
import { toast } from 'vue3-toastify'

const router = useRouter()
const db = useFirestore()

const loading = ref(true)
const error = ref('')
const deletingId = ref(null)
const activeTab = ref('pending') // 'all' | 'pending' | 'validated'
const search = ref('')
const selected = ref(null)

// données brutes venant de Firestore (avec id)
const demandesRaw = ref([])

let unsubscribe = null

// Format date simple
const formatDate = (ts) => {
  if (!ts) return ''
  let d
  if (ts.toDate) d = ts.toDate()
  else d = new Date(ts)
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// on écoute les demandes en live
onMounted(() => {
  const q = query(collection(db, 'pickupRequests'), orderBy('createdAt', 'desc'))

  unsubscribe = onSnapshot(
    q,
    (snap) => {
      demandesRaw.value = snap.docs.map((docSnap) => ({
        id: docSnap.id,          // ✅ ICI l'id Firestore
        ...docSnap.data(),
      }))
      loading.value = false
      error.value = ''
    },
    (err) => {
      console.error(err)
      error.value = "Erreur lors du chargement des demandes"
      loading.value = false
    },
  )
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

// on enrichit avec la date formatée
const demandes = computed(() =>
  demandesRaw.value.map((d) => ({
    ...d,
    createdAtFormatted: d.createdAt ? formatDate(d.createdAt) : '',
  })),
)

// Stats
const pendingCount = computed(
  () =>
    demandes.value.filter(
      (d) => (d.status || 'PENDING').toUpperCase() === 'PENDING',
    ).length,
)
const validatedCount = computed(
  () =>
    demandes.value.filter(
      (d) => (d.status || '').toUpperCase() === 'VALIDATED',
    ).length,
)

// Filtre final selon onglet + recherche
const filteredList = computed(() => {
  let list = demandes.value

  if (activeTab.value === 'pending') {
    list = list.filter(
      (d) => (d.status || 'PENDING').toUpperCase() === 'PENDING',
    )
  } else if (activeTab.value === 'validated') {
    list = list.filter(
      (d) => (d.status || '').toUpperCase() === 'VALIDATED',
    )
  }

  const q = search.value.toLowerCase().trim()
  if (!q) return list

  return list.filter((d) => {
    const txt =
      [
        d.clientNom,
        d.clientPrenom,
        d.destinataire,
        d.destination,
        d.typeDeFret,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    return txt.includes(q)
  })
})

const statusLabel = (status) => {
  const s = (status || 'PENDING').toUpperCase()
  switch (s) {
    case 'PENDING':
      return 'En attente'
    case 'VALIDATED':
      return 'Validée'
    case 'CANCELLED':
      return 'Annulée'
    default:
      return status || 'En attente'
  }
}

const statusClass = (status) => {
  const s = (status || 'PENDING').toUpperCase()
  switch (s) {
    case 'PENDING':
      return 'bg-amber-50 text-amber-700 border border-amber-100'
    case 'VALIDATED':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-100'
    case 'CANCELLED':
      return 'bg-red-50 text-red-700 border border-red-100'
    default:
      return 'bg-slate-50 text-slate-600 border border-slate-100'
  }
}

const openDetails = (d) => {
  selected.value = d
}

const goValidate = (id) => {
  router.push(`/validate-request/${id}`)
}

const goEnlevement = (enlevementId) => {
  router.push(`/liste/${enlevementId}`)
}

const deleteRequest = async (id) => {
  if (!id) return

  const confirmDelete = window.confirm(
    "Tu veux vraiment supprimer cette demande d'enlèvement ?",
  )
  if (!confirmDelete) return

  try {
    deletingId.value = id
    const refDoc = doc(db, 'pickupRequests', id) // ✅ maintenant on a bien l'id
    await deleteDoc(refDoc)
    toast.success('Demande supprimée ✅', { autoClose: 1200 })
    // le onSnapshot va auto rafraîchir la liste
  } catch (e) {
    console.error(e)
    error.value = 'Erreur lors de la suppression de la demande'
    toast.error('Erreur lors de la suppression ❌')
  } finally {
    deletingId.value = null
  }
}
</script>



<template>
  <div class="min-h-screen bg-slate-100 px-4 py-6">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">
            Demandes d’enlèvement
          </h1>
          <p class="text-sm text-slate-500">
            Liste des demandes envoyées par les clients depuis le portail.
          </p>
        </div>

        <div class="flex items-center gap-2 text-xs md:text-sm">
          <span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            En attente : {{ pendingCount }}
          </span>
          <span class="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            Validées : {{ validatedCount }}
          </span>
        </div>
      </header>

      <!-- Onglets statut -->
      <div class="mb-4 flex flex-wrap gap-2">
        <button class="px-3 py-1.5 rounded-full text-xs md:text-sm border transition" :class="activeTab === 'all'
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'" @click="activeTab = 'all'">
          Toutes
        </button>
        <button class="px-3 py-1.5 rounded-full text-xs md:text-sm border transition" :class="activeTab === 'pending'
          ? 'bg-amber-600 text-white border-amber-600'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'" @click="activeTab = 'pending'">
          En attente
        </button>
        <button class="px-3 py-1.5 rounded-full text-xs md:text-sm border transition" :class="activeTab === 'validated'
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'" @click="activeTab = 'validated'">
          Validées
        </button>
      </div>

      <!-- Filtre texte -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <input v-model="search" type="text" placeholder="Recherche (client, destinataire, destination...)"
          class="w-full md:w-80 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
      </div>

      <!-- Contenu -->
      <div v-if="loading" class="py-10 flex justify-center">
        <div class="flex items-center gap-2 text-sm text-slate-600">
          <span class="h-4 w-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin"></span>
          <span>Chargement des demandes…</span>
        </div>
      </div>

      <div v-else>
        <p v-if="error" class="mb-4 text-sm text-red-500">
          {{ error }}
        </p>

        <div v-if="!filteredList.length" class="py-10 text-center text-sm text-slate-500">
          Aucune demande à afficher avec ces filtres.
        </div>

        <!-- Liste -->
        <div class="space-y-3">
          <div v-for="d in filteredList" :key="d.id"
            class="bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-slate-50 transition">
            <div class="space-y-1 text-sm">
              <!-- Ligne principale -->
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-slate-900">
                  {{ d.clientPrenom }} {{ d.clientNom }}
                </span>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs text-slate-600">
                  {{ d.destination || 'Destination inconnue' }} • {{ d.typeDeFret || 'Fret' }}
                </span>

                <span :class="[
                  'text-[11px] px-2 py-0.5 rounded-full font-medium',
                  statusClass(d.status)
                ]">
                  {{ statusLabel(d.status) }}
                </span>
              </div>

              <!-- Détails secondaires -->
              <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span v-if="d.destinataire">
                  Destinataire :
                  <span class="font-medium text-slate-700">{{ d.destinataire }}</span>
                </span>
                <span v-if="d.createdAtFormatted">
                  Créée le {{ d.createdAtFormatted }}
                </span>
                <span v-if="d.nombreDeColis">
                  📦 {{ d.nombreDeColis }} colis
                </span>
                <span v-else-if="d.colis?.length">
                  📦 {{ d.colis.length }} types de colis
                </span>
                <span v-if="d.enlevementId"
                  class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px]">
                  Enlèvement créé
                </span>

              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-wrap items-center justify-end gap-2 text-xs">
              <button class="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white" @click="openDetails(d)">
                Détails
              </button>

              <!-- Action validation -->
              <button v-if="(d.status || 'PENDING').toUpperCase() === 'PENDING'"
                class="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-500" @click="goValidate(d.id)">
                Valider
              </button>

              <!-- Action voir enlèvement -->
              <button v-else-if="d.enlevementId"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                @click="goEnlevement(d.enlevementId)">
                Voir enlèvement
              </button>

              <!-- Supprimer -->
              <button
                class="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="deletingId === d.id" @click="deleteRequest(d.id)">
                <span v-if="deletingId === d.id">Suppression…</span>
                <span v-else>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal détails -->
      <div v-if="selected" class="fixed inset-0 bg-black/40 flex items-center justify-center z-20">
        <div class="bg-white rounded-2xl shadow-lg w-full max-w-xl p-6 relative">
          <button class="absolute top-3 right-3 text-slate-400 hover:text-slate-600" @click="selected = null">
            ✕
          </button>

          <h2 class="text-lg font-semibold text-slate-900 mb-3">
            Détails de la demande
          </h2>

          <div class="space-y-2 text-sm text-slate-700">
            <p>
              <span class="font-medium">Client :</span>
              {{ selected.clientPrenom }} {{ selected.clientNom }}
            </p>
            <p v-if="selected.clientPhone">
              <span class="font-medium">Téléphone client :</span>
              {{ selected.clientPhone }}
            </p>
            <p v-if="selected.clientAdresse">
              <span class="font-medium">Adresse client :</span>
              {{ selected.clientAdresse }}
            </p>
            <p>
              <span class="font-medium">Destination :</span>
              {{ selected.destination || '—' }}
            </p>
            <p>
              <span class="font-medium">Type de fret :</span>
              {{ selected.typeDeFret || '—' }}
            </p>
            <p v-if="selected.destinataire">
              <span class="font-medium">Destinataire :</span>
              {{ selected.destinataire }}
            </p>
            <p v-if="selected.telephoneDestinataire">
              <span class="font-medium">Téléphone destinataire :</span>
              {{ selected.telephoneDestinataire }}
            </p>
            <p>
              <span class="font-medium">Statut :</span>
              {{ statusLabel(selected.status) }}
            </p>
            <p v-if="selected.createdAtFormatted">
              <span class="font-medium">Créée le :</span>
              {{ selected.createdAtFormatted }}
            </p>
          </div>

          <div class="mt-4">
            <h3 class="text-sm font-semibold text-slate-900 mb-1">
              Colis
            </h3>
            <ul class="text-xs text-slate-700 list-disc list-inside space-y-1 max-h-40 overflow-auto">
              <li v-for="(c, idx) in selected.colis || []" :key="idx">
                {{ c.quantite || c.details?.length || 1 }} × {{ c.nom || c.article }}
              </li>
            </ul>
          </div>

          <div v-if="selected.imageUrls?.length" class="mt-4">
            <h3 class="text-sm font-semibold text-slate-900 mb-1">
              Photos
            </h3>
            <div class="grid grid-cols-3 gap-2">
              <a v-for="(url, idx) in selected.imageUrls" :key="idx" :href="url" target="_blank" rel="noreferrer">
                <img :src="url" alt="photo colis" class="h-20 w-full object-cover rounded-lg border border-slate-200" />
              </a>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <button class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
              @click="selected = null">
              Fermer
            </button>

            <button v-if="(selected.status || 'PENDING').toUpperCase() === 'PENDING'"
              class="text-xs px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500"
              @click="goValidate(selected.id)">
              Aller à la validation
            </button>

            <button v-else-if="selected.enlevementId"
              class="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              @click="goEnlevement(selected.enlevementId)">
              Voir l’enlèvement
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
