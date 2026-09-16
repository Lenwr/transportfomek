<script setup>
import { confirmToast } from "../utils/confirmToast.js"
import { getAuth } from "firebase/auth"
import { messagingEndpoint } from "../utils/messagingEndpoint"
import { onMounted, ref, computed } from 'vue'
import { useFirestore, useCollection } from 'vuefire'
import { collection, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { toast } from 'vue3-toastify'
import { useCustomersStore } from '../stores/modules/customers.js'
import { storeToRefs } from 'pinia'

// ======================
// Firestore
// ======================
const db = useFirestore()

// ======================
// Ancien système : collection "customers" via Pinia
// ======================
const customersStore = useCustomersStore()
const { customers, loading, error } = storeToRefs(customersStore)

onMounted(async () => {
  await customersStore.fetchCustomers()
})

// ======================
// Nouveau système : collection "clients" (portail)
// ======================
const portalClientsCol = useCollection(collection(db, 'clients'))

const query = ref('')
const columnsOpen = ref(false)
const columnOptions = [
  { key: 'numeroClient', label: 'N° client' },
  { key: 'nom', label: 'Nom' },
  { key: 'prenom', label: 'Prénom' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'ville', label: 'Ville' },
  { key: 'codePostal', label: 'Code postal' },
  { key: 'email', label: 'Email' },
  { key: 'societe', label: 'Société' },
]
const defaultColumns = ['numeroClient', 'nom', 'prenom', 'telephone', 'adresse', 'ville']
const storedColumns = JSON.parse(localStorage.getItem('fomek-client-columns') || 'null')
const visibleColumns = ref(Array.isArray(storedColumns) && storedColumns.length ? storedColumns : defaultColumns)
const isColumnVisible = (key) => visibleColumns.value.includes(key)
const toggleColumn = (key) => {
  const next = isColumnVisible(key)
    ? visibleColumns.value.filter((column) => column !== key)
    : [...visibleColumns.value, key]
  if (!next.length) return
  visibleColumns.value = next
  localStorage.setItem('fomek-client-columns', JSON.stringify(next))
}

// ======================
// Helpers société
// ======================
const getClientCompany = (item) => {
  return (
    item?.societe ||
    item?.company ||
    item?.selectedCompany ||
    item?.entreprise ||
    ''
  )
    .toString()
    .trim()
}

const formatLastName = (value) => String(value || '').trim().toLocaleUpperCase('fr-FR')
const formatFirstName = (value) => {
  const name = String(value || '').trim().toLocaleLowerCase('fr-FR')
  return name ? name.charAt(0).toLocaleUpperCase('fr-FR') + name.slice(1) : ''
}
const formatClientAddress = (item) => {
  const street = String(item?.adresse || item?.adresseComplete || '').trim()
  const postalCode = String(item?.codePostal || '').trim()
  const city = String(item?.ville || '').trim()
  return [street, postalCode, city].filter(Boolean).join(', ')
}

// ======================
// Filtres
// ======================
const allClients = computed(() => {
  const merged = new Map()

  for (const item of customers.value || []) {
    merged.set(`customers:${item.id}`, {
      ...item,
      _source: 'customers',
      _customerId: item.id,
      _portalId: '',
    })
  }
  for (const item of portalClientsCol.value || []) {
    const duplicate = Array.from(merged.values()).find((client) => {
      const samePhone = client.telephone && (client.telephone === item.telephone || client.telephone === item.phone)
      const sameEmail = client.email && item.email && client.email.toLowerCase() === item.email.toLowerCase()
      return samePhone || sameEmail
    })
    if (duplicate) {
      // Ne jamais remplacer l'identifiant du document `customers` par celui du
      // document portail : les actions modifier/supprimer cibleraient le mauvais document.
      const customerId = duplicate._customerId || duplicate.id
      Object.assign(duplicate, item, {
        id: customerId,
        _source: 'customers',
        _customerId: customerId,
        _portalId: item.id,
      })
    } else {
      merged.set(`clients:${item.id}`, {
        ...item,
        _source: 'clients',
        _customerId: '',
        _portalId: item.id,
      })
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    `${a.nom || ''} ${a.prenom || ''}`.localeCompare(`${b.nom || ''} ${b.prenom || ''}`, 'fr')
  )
})

const filteredClients = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return allClients.value

  return allClients.value.filter((item) =>
    (
      `${item.numeroClient || ''} ${item.nom || ''} ${item.prenom || ''} ${item.email || ''} ${item.adresse || item.adresseComplete || ''} ${item.codePostal || ''} ${item.ville || ''} ${item.telephone || item.phone || ''} ${getClientCompany(item)}`
    )
      .toLowerCase()
      .includes(q),
  )
})

// ======================
// Formulaire création (uniquement pour "customers" legacy)
// ======================
const customer = ref({
  nom: '',
  prenom: '',
  adresse: '',
  ville: '',
  codePostal: '',
  telephone: '',
  envois: [{ expediteur: '', colis: '' }],
})

const resetCustomerForm = () => {
  customer.value = {
    nom: '',
    prenom: '',
    adresse: '',
    ville: '',
    codePostal: '',
    telephone: '',
    envois: [{ expediteur: '', colis: '' }],
  }
}

const createCustomers = async () => {
  try {
    await customersStore.createCutomers(customer.value)
    resetCustomerForm()

    toast('Nouveau client créé', {
      theme: 'auto',
      type: 'success',
      autoClose: 1000,
      dangerouslyHTMLString: true,
    })
  } catch (e) {
    console.error('Erreur lors de la création:', e)
    toast('Erreur lors de la création du client', {
      type: 'error',
      autoClose: 1500,
    })
  }
}

const deleteCustomers = async (id) => {
  if (await confirmToast('Êtes-vous sûr de vouloir supprimer ce client ?')) {
    try {
      await customersStore.deleteCustomer(id)
      toast('Client supprimé', {
        theme: 'auto',
        type: 'error',
        autoClose: 1000,
        dangerouslyHTMLString: true,
      })
    } catch (e) {
      console.error('Erreur lors de la suppression:', e)
      toast('Erreur lors de la suppression', {
        type: 'error',
        autoClose: 1500,
      })
    }
  }
}

const deletePortalClient = async (id) => {
  if (await confirmToast('Êtes-vous sûr de vouloir supprimer ce client portail ?')) {
    try {
      await deleteDoc(doc(db, 'clients', id))
      toast('Client portail supprimé', {
        theme: 'auto',
        type: 'success',
        autoClose: 1000,
      })
    } catch (e) {
      console.error('Erreur suppression client portail:', e)
      toast('Erreur lors de la suppression du client portail', {
        type: 'error',
        autoClose: 1500,
      })
    }
  }
}

// ======================
// Modification client
// ======================
const editingClient = ref(null)
const editForm = ref({})
const editingSaving = ref(false)

const openEditClient = (item) => {
  editingClient.value = {
    ...item,
    _customerId: item._customerId || (item._source === 'customers' ? item.id : ''),
    _portalId: item._portalId || (item._source === 'clients' ? item.id : ''),
  }
  editForm.value = {
    numeroClient: item.numeroClient || '',
    nom: item.nom || '',
    prenom: item.prenom || '',
    telephone: item.telephone || item.phone || '',
    adresse: item.adresse || item.adresseComplete || '',
    ville: item.ville || '',
    codePostal: item.codePostal || '',
    email: item.email || '',
  }
  document.getElementById('editClientModal')?.showModal()
}

const saveEditedClient = async () => {
  if (!editingClient.value || editingSaving.value) return
  editingSaving.value = true
  try {
    const { _customerId, _portalId } = editingClient.value
    const updates = { ...editForm.value, updatedAt: serverTimestamp() }
    const writes = []

    if (_customerId) {
      writes.push(customersStore.updateCustomers(_customerId, updates))
    }
    if (_portalId) {
      writes.push(updateDoc(doc(db, 'clients', _portalId), {
        ...updates,
        phone: editForm.value.telephone,
        adresseComplete: editForm.value.adresse,
      }))
    }
    if (!writes.length) throw new Error('Document client introuvable')

    await Promise.all(writes)
    document.getElementById('editClientModal')?.close()
    toast('Client modifié', { type: 'success', autoClose: 1200 })
  } catch (e) {
    console.error('Erreur modification client:', e)
    toast(`Erreur lors de la modification : ${e.message || 'accès refusé'}`, { type: 'error' })
  } finally {
    editingSaving.value = false
  }
}
const closeEditClient = () => document.getElementById('editClientModal')?.close()

// ======================
// Diffusion SMS (Broadcast)
// ======================
const showBroadcast = ref(false)
const isSendingBroadcast = ref(false)
const broadcastMsg = ref('')
const selectedPhones = ref(new Set())

const normalizeFR = (n) => {
  const d = String(n || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0')) return '+33' + d.slice(1)
  if (d.startsWith('33')) return '+' + d
  if (d.startsWith('336') || d.startsWith('337')) return '+' + d
  return n
}

const phonesList = computed(() => {
  const map = new Map()

  for (const c of filteredClients.value) {
    const raw = c.telephone || c.phone

    const phone = normalizeFR(raw)
    if (!phone) continue

    const label = `${c.nom || ''} ${c.prenom || ''}`.trim() || '—'
    if (!map.has(phone)) map.set(phone, { phone, label })
  }

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  )
})

function toggleAllPhones(checked) {
  selectedPhones.value = new Set(
    checked ? phonesList.value.map((p) => p.phone) : [],
  )
}

function toggleOnePhone(phone, checked) {
  const s = new Set(selectedPhones.value)
  if (checked) s.add(phone)
  else s.delete(phone)
  selectedPhones.value = s
}

function clearSelectedPhones() {
  selectedPhones.value = new Set()
}

function selectAllFilteredPhones() {
  selectedPhones.value = new Set(phonesList.value.map((p) => p.phone))
}

async function sendBroadcast() {
  const phones = Array.from(selectedPhones.value)

  if (!phones.length) {
    toast('Sélectionne au moins un destinataire', { type: 'warning' })
    return
  }

  if (!broadcastMsg.value.trim()) {
    toast('Message vide', { type: 'warning' })
    return
  }

  try {
    isSendingBroadcast.value = true

    const endpoint =
      messagingEndpoint("sendBroadcastSMS")

    const token = await getAuth().currentUser?.getIdToken()
    if (!token) throw new Error('Reconnecte-toi pour envoyer un SMS')
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phones, message: broadcastMsg.value.trim() }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Erreur diffusion')

    toast(`✅ Diffusion envoyée à ${data.sent || phones.length} numéro(s)`, {
      type: 'success',
    })

    showBroadcast.value = false
    broadcastMsg.value = ''
    selectedPhones.value = new Set()
  } catch (e) {
    console.error(e)
    toast(e.message || 'Erreur envoi diffusion', { type: 'error' })
  } finally {
    isSendingBroadcast.value = false
  }
}
</script>

<template>
  <div class="min-h-screen w-full bg-gray-50">
    <div class="flex flex-col gap-3 bg-primary px-5 py-5 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <p class="font-semibold text-white sm:px-4">Rechercher</p>

        <input
          v-model="query"
          type="text"
          placeholder="Nom / prénom / email / téléphone"
          class="input input-bordered input-primary w-full bg-white sm:max-w-xl"
        />

        <button class="btn btn-sm w-full border-white/50 bg-white/10 text-white hover:border-white hover:bg-white hover:text-primary sm:w-auto" @click="showBroadcast = true">
          Diffusion SMS
        </button>

        <span
          class="mx-2 w-6 cursor-pointer text-white duration-500 hover:w-8"
          onclick="formModal.showModal()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z"
            />
          </svg>
        </span>
      </div>

      <p class="px-4 text-sm font-medium text-white/80">
        {{ filteredClients.length }} client<span v-if="filteredClients.length !== 1">s</span>
      </p>
    </div>

    <!-- Modal Diffusion SMS -->
    <dialog v-if="showBroadcast" open class="modal">
      <div class="modal-box w-[calc(100vw-1rem)] max-w-2xl bg-white text-black">
        <h3 class="font-bold text-lg mb-2">Diffusion SMS aux clients</h3>

        <!-- Actions rapides de sélection -->
        <div class="flex flex-wrap gap-2 mb-4">
          <button
            class="btn btn-sm btn-outline"
            type="button"
            @click="selectAllFilteredPhones"
          >
            Sélectionner les clients affichés
          </button>

          <button
            class="btn btn-sm btn-outline"
            type="button"
            @click="clearSelectedPhones"
          >
            Tout désélectionner
          </button>

        </div>

        <!-- Destinataires -->
        <div class="mb-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600">
              Destinataires : {{ phonesList.length }}
            </span>

            <label class="cursor-pointer text-sm flex items-center gap-2">
              <input
                type="checkbox"
                :checked="
                  selectedPhones.size === phonesList.length &&
                  phonesList.length > 0
                "
                @change="toggleAllPhones($event.target.checked)"
              />
              Tout sélectionner
            </label>
          </div>

          <div class="mt-2 max-h-44 overflow-auto border rounded-md p-2 space-y-1">
            <label
              v-for="p in phonesList"
              :key="p.phone"
            class="flex min-w-0 items-center gap-2 text-sm"
          >
              <input
                type="checkbox"
                :checked="selectedPhones.has(p.phone)"
                @change="toggleOnePhone(p.phone, $event.target.checked)"
              />
              <span class="min-w-0 flex-1 truncate font-medium">{{ p.label }}</span>
              <span class="shrink-0 text-gray-500">{{ p.phone }}</span>
            </label>

            <p v-if="phonesList.length === 0" class="text-gray-500 text-sm">
              Aucun numéro détecté sur cet onglet.
            </p>
          </div>
        </div>

        <!-- Message -->
        <div class="mb-2">
          <label class="block text-sm font-medium mb-1">Message</label>
          <textarea
            v-model="broadcastMsg"
            rows="4"
            class="textarea bg-white textarea-bordered w-full"
            placeholder="Ex: Bonjour, votre colis est prêt."
          ></textarea>

          <div class="text-xs text-gray-500 mt-1 flex justify-between">
            <span>Sélection : {{ selectedPhones.size }} numéro(s)</span>
            <span>~{{ Math.ceil((broadcastMsg || '').length / 160) }} SMS / destinataire</span>
          </div>
        </div>

        <div class="modal-action">
          <button
            class="btn btn-ghost"
            @click="showBroadcast = false"
            :disabled="isSendingBroadcast"
          >
            Annuler
          </button>

          <button
            class="btn btn-primary"
            @click="sendBroadcast"
            :disabled="
              isSendingBroadcast ||
              !selectedPhones.size ||
              !broadcastMsg.trim()
            "
          >
            <span
              v-if="isSendingBroadcast"
              class="loading loading-spinner loading-sm mr-2"
            ></span>
            Envoyer
          </button>
        </div>
      </div>
    </dialog>

    <!-- Modal création client -->
    <dialog id="formModal" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box w-[calc(100vw-1rem)] max-w-lg bg-white text-black">
        <h1 class="text-center my-3">Ajouter un nouveau client</h1>

        <form class="space-y-6" @submit.prevent="createCustomers">
          <div>
            <label for="nom" class="block text-sm font-medium leading-6 text-gray-900">Nom</label>
            <div class="mt-2">
              <input
                id="nom"
                name="nom"
                v-model="customer.nom"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Nom"
              />
            </div>
          </div>

          <div>
            <label for="prenom" class="block text-sm font-medium leading-6 text-gray-900">Prénoms</label>
            <div class="mt-2">
              <input
                id="prenom"
                name="prenom"
                v-model="customer.prenom"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Prénoms"
              />
            </div>
          </div>

          <div class="adresse">
            <label for="adresse" class="block text-sm font-medium leading-6 text-gray-900">Adresse</label>
            <div class="mt-2">
              <input
                type="text"
                id="adresse"
                name="adresse"
                v-model="customer.adresse"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Adresse"
              />
            </div>
          </div>

          <div>
            <label for="ville" class="block text-sm font-medium leading-6 text-gray-900">Ville</label>
            <div class="mt-2">
              <input id="ville" v-model="customer.ville" type="text" class="block h-[3em] w-full rounded-md border-0 py-1.5 pl-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300" placeholder="Ville" />
            </div>
          </div>

          <div>
            <label for="codePostal" class="block text-sm font-medium leading-6 text-gray-900">Code Postal</label>
            <div class="mt-2">
              <input
                type="text"
                id="codePostal"
                name="codePostal"
                v-model="customer.codePostal"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="95500 , 91000 , ......"
              />
            </div>
          </div>

          <div class="telephone">
            <label for="telephone" class="block text-sm font-medium leading-6 text-gray-900">Téléphone</label>
            <div class="mt-2">
              <input
                type="tel"
                id="telephone"
                name="telephone"
                v-model="customer.telephone"
                class="block h-[3em] w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-4"
                placeholder="Téléphone"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              class="flex h-[3em] w-full justify-center rounded-md bg-primary px-3 py-1.5 mb-[2em] text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Enregistrer
            </button>
          </div>
        </form>

        <div class="modal-action">
          <form method="dialog">
            <button class="w-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-6"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </dialog>

    <!-- Modal modification client -->
    <dialog id="editClientModal" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box w-[calc(100vw-1rem)] max-w-2xl bg-white text-black">
        <h2 class="mb-5 text-xl font-bold">Modifier le client</h2>
        <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveEditedClient">
          <label class="form-control">
            <span class="mb-1 text-sm font-medium">N° client</span>
            <input v-model="editForm.numeroClient" class="input input-bordered bg-white" />
          </label>
          <label class="form-control">
            <span class="mb-1 text-sm font-medium">Nom</span>
            <input v-model="editForm.nom" required class="input input-bordered bg-white" />
          </label>
          <label class="form-control">
            <span class="mb-1 text-sm font-medium">Prénom</span>
            <input v-model="editForm.prenom" class="input input-bordered bg-white" />
          </label>
          <label class="form-control">
            <span class="mb-1 text-sm font-medium">Téléphone</span>
            <input v-model="editForm.telephone" type="tel" class="input input-bordered bg-white" />
          </label>
          <label class="form-control sm:col-span-2">
            <span class="mb-1 text-sm font-medium">Adresse</span>
            <input v-model="editForm.adresse" class="input input-bordered bg-white" />
          </label>
          <label class="form-control">
            <span class="mb-1 text-sm font-medium">Ville</span>
            <input v-model="editForm.ville" class="input input-bordered bg-white" />
          </label>
          <label class="form-control">
            <span class="mb-1 text-sm font-medium">Code postal</span>
            <input v-model="editForm.codePostal" class="input input-bordered bg-white" />
          </label>
          <label class="form-control sm:col-span-2">
            <span class="mb-1 text-sm font-medium">Email</span>
            <input v-model="editForm.email" type="email" class="input input-bordered bg-white" />
          </label>
          <div class="modal-action sm:col-span-2">
            <button type="button" class="btn btn-ghost" @click="closeEditClient">Annuler</button>
            <button type="submit" class="btn btn-primary text-white" :disabled="editingSaving">
              {{ editingSaving ? 'Enregistrement…' : 'Enregistrer les modifications' }}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>Fermer</button></form>
    </dialog>

    <!-- Tableau -->
    <div v-if="loading" class="p-4">Chargement...</div>

    <div v-else class="w-full px-4 py-5 pb-20 lg:px-8">
      <div class="relative mb-3 flex justify-end">
        <button type="button" class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-cyan-300" @click="columnsOpen = !columnsOpen">
          Colonnes affichées
        </button>
        <div v-if="columnsOpen" class="absolute right-0 top-12 z-20 grid w-64 gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <p class="mb-1 text-sm font-bold text-slate-950">Choisir les colonnes</p>
          <label v-for="column in columnOptions" :key="column.key" class="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" class="checkbox checkbox-sm" :checked="isColumnVisible(column.key)" @change="toggleColumn(column.key)" />
            {{ column.label }}
          </label>
        </div>
      </div>
      <div class="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table class="w-full min-w-[900px]">
              <thead class="bg-white border-b">
                <tr>
                  <th v-if="isColumnVisible('numeroClient')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">N° client</th>
                  <th v-if="isColumnVisible('nom')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Nom</th>
                  <th v-if="isColumnVisible('prenom')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Prénom</th>
                  <th v-if="isColumnVisible('telephone')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Téléphone</th>
                  <th v-if="isColumnVisible('adresse')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Adresse</th>
                  <th v-if="isColumnVisible('ville')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Ville</th>
                  <th v-if="isColumnVisible('codePostal')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Code postal</th>
                  <th v-if="isColumnVisible('email')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Email</th>
                  <th v-if="isColumnVisible('societe')" class="px-5 py-4 text-left text-sm font-bold text-gray-900">Société</th>
                  <th class="px-5 py-4 text-center text-sm font-bold text-gray-900">Actions</th>
                </tr>
              </thead>

              <tbody class="divide-y divide-slate-100">
                <tr
                  class="bg-white transition hover:bg-cyan-50/40"
                  v-for="(item, i) in filteredClients"
                  :key="item.id || i"
                >
                  <td v-if="isColumnVisible('numeroClient')" class="whitespace-nowrap px-5 py-4 text-sm font-bold text-cyan-800">{{ item.numeroClient || '—' }}</td>
                  <td v-if="isColumnVisible('nom')" class="whitespace-nowrap px-5 py-4 text-sm font-semibold text-gray-900">{{ formatLastName(item.nom) || '—' }}</td>
                  <td v-if="isColumnVisible('prenom')" class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ formatFirstName(item.prenom) || '—' }}</td>
                  <td v-if="isColumnVisible('telephone')" class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ item.telephone || item.phone || '—' }}</td>
                  <td v-if="isColumnVisible('adresse')" class="max-w-xs truncate px-5 py-4 text-sm text-gray-700" :title="formatClientAddress(item)">{{ formatClientAddress(item) || '—' }}</td>
                  <td v-if="isColumnVisible('ville')" class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ item.ville || '—' }}</td>
                  <td v-if="isColumnVisible('codePostal')" class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ item.codePostal || '—' }}</td>
                  <td v-if="isColumnVisible('email')" class="max-w-xs truncate px-5 py-4 text-sm text-gray-700" :title="item.email">{{ item.email || '—' }}</td>
                  <td v-if="isColumnVisible('societe')" class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ getClientCompany(item) || '—' }}</td>
                  <td class="px-5 py-4">
                    <div class="flex items-center justify-center gap-3">
                    <router-link :to="'/customersDetails/' + item.id" class="rounded-lg p-2 text-cyan-800 transition hover:bg-cyan-100 hover:text-cyan-950" title="Ouvrir la fiche client" aria-label="Ouvrir la fiche client">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                        stroke="currentColor" class="h-5 w-5">
                        <path stroke-linecap="round" stroke-linejoin="round"
                          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    </router-link>
                    <button type="button" class="rounded-lg p-2 text-amber-600 transition hover:bg-amber-100 hover:text-amber-800" title="Modifier le client" aria-label="Modifier le client" @click="openEditClient(item)">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487Zm0 0L19.5 7.125M18 14.25V19.5A1.5 1.5 0 0 1 16.5 21h-12A1.5 1.5 0 0 1 3 19.5v-12A1.5 1.5 0 0 1 4.5 6H9.75" />
                      </svg>
                    </button>
                    <svg @click="item._source === 'clients' ? deletePortalClient(item.id) : deleteCustomers(item.id)" xmlns="http://www.w3.org/2000/svg" fill="none"
                      viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5 cursor-pointer text-red-500 hover:text-red-700" aria-label="Supprimer le client">
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                    </div>
                  </td>
                </tr>
                <tr v-if="!filteredClients.length">
                  <td :colspan="visibleColumns.length + 1" class="px-6 py-12 text-center text-sm text-slate-500">Aucun client trouvé.</td>
                </tr>
              </tbody>
            </table>

          <div v-if="error" class="text-red-600 text-sm p-3">
            Erreur: {{ error }}
          </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-primary {
  color: #176b8a;
}
</style>
