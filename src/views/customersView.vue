<script setup>
import { onMounted, ref, computed } from 'vue'
import { useFirestore, useCollection } from 'vuefire'
import { collection, doc, deleteDoc } from 'firebase/firestore'
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

// ======================
// Filtres
// ======================
const allClients = computed(() => {
  const merged = new Map()

  for (const item of customers.value || []) {
    merged.set(`customers:${item.id}`, { ...item, _source: 'customers' })
  }
  for (const item of portalClientsCol.value || []) {
    const duplicate = Array.from(merged.values()).find((client) => {
      const samePhone = client.telephone && (client.telephone === item.telephone || client.telephone === item.phone)
      const sameEmail = client.email && item.email && client.email.toLowerCase() === item.email.toLowerCase()
      return samePhone || sameEmail
    })
    if (duplicate) Object.assign(duplicate, item)
    else merged.set(`clients:${item.id}`, { ...item, _source: 'clients' })
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
      `${item.nom || ''} ${item.prenom || ''} ${item.email || ''} ${item.adresse || item.adresseComplete || ''} ${item.codePostal || ''} ${item.telephone || item.phone || ''} ${getClientCompany(item)}`
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
  codePostal: '',
  telephone: '',
  envois: [{ expediteur: '', colis: '' }],
})

const resetCustomerForm = () => {
  customer.value = {
    nom: '',
    prenom: '',
    adresse: '',
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
  if (confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
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
  if (confirm('Êtes-vous sûr de vouloir supprimer ce client portail ?')) {
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
      'https://us-central1-aarontravelgestion.cloudfunctions.net/sendBroadcastSMS'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    <!-- Tableau -->
    <div v-if="loading" class="p-4">Chargement...</div>

    <div v-else class="w-full px-4 py-5 pb-20 lg:px-8">
      <div class="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table class="w-full min-w-[980px] table-fixed">
              <thead class="bg-white border-b">
                <tr>
                  <th class="w-[14%] px-5 py-4 text-left text-sm font-bold text-gray-900">Nom</th>
                  <th class="w-[14%] px-5 py-4 text-left text-sm font-bold text-gray-900">Prénoms</th>
                  <th class="w-[27%] px-5 py-4 text-left text-sm font-bold text-gray-900">Adresse</th>
                  <th class="w-[20%] px-5 py-4 text-left text-sm font-bold text-gray-900">Email</th>
                  <th class="w-[15%] px-5 py-4 text-left text-sm font-bold text-gray-900">Téléphone</th>
                  <th class="w-[10%] px-5 py-4 text-center text-sm font-bold text-gray-900">Actions</th>
                </tr>
              </thead>

              <tbody class="divide-y divide-slate-100">
                <tr
                  class="bg-white transition hover:bg-cyan-50/40"
                  v-for="(item, i) in filteredClients"
                  :key="item.id || i"
                >
                  <td class="truncate px-5 py-4 text-sm font-semibold text-gray-900">{{ item.nom || '—' }}</td>
                  <td class="truncate px-5 py-4 text-sm text-gray-700">{{ item.prenom || '—' }}</td>
                  <td class="truncate px-5 py-4 text-sm text-gray-700" :title="item.adresse || item.adresseComplete">{{ item.adresse || item.adresseComplete || '—' }}</td>
                  <td class="truncate px-5 py-4 text-sm text-gray-700" :title="item.email">{{ item.email || '—' }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ item.telephone || item.phone || '—' }}</td>
                  <td class="px-5 py-4">
                    <div class="flex items-center justify-center gap-3">
                    <router-link :to="'/customersDetails/' + item.id" class="text-cyan-800 hover:text-cyan-950" title="Voir le client">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                        stroke="currentColor" class="w-6 h-6">
                        <path stroke-linecap="round" stroke-linejoin="round"
                          d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </router-link>
                    <svg @click="item._source === 'clients' ? deletePortalClient(item.id) : deleteCustomers(item.id)" xmlns="http://www.w3.org/2000/svg" fill="none"
                      viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6 cursor-pointer text-red-500 hover:text-red-700" aria-label="Supprimer le client">
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                    </div>
                  </td>
                </tr>
                <tr v-if="!filteredClients.length">
                  <td colspan="6" class="px-6 py-12 text-center text-sm text-slate-500">Aucun client trouvé.</td>
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
