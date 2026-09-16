<script setup>
import { messagingEndpoint } from "../utils/messagingEndpoint"
import { computed, ref } from "vue"
import { addDoc, collection, query, orderBy, serverTimestamp } from "firebase/firestore"
import { useCollection } from "vuefire"
import { toast } from "vue3-toastify"
import { auth, db } from "../components/firebaseConfig"
import { useAuthStore } from "../stores/useAuthStore"
import { logActivity } from "../utils/activityLog"

const clientsSnap = useCollection(collection(db, "clients"))
const legacyCustomersSnap = useCollection(collection(db, "customers"))
const enlevementsSnap = useCollection(query(collection(db, "enlevements"), orderBy("createdAt", "desc")))
const pickupRequestsSnap = useCollection(query(collection(db, "pickupRequests"), orderBy("createdAt", "desc")))
const plannedPickupsSnap = useCollection(query(collection(db, "plannedPickups"), orderBy("createdAt", "desc")))
const authStore = useAuthStore()

const sendingDirect = ref(false)
const sendingBulk = ref(false)
const selectedClientId = ref("")
const directMessage = ref("")
const clientSearch = ref("")
const activeClientSource = ref("all")
const clientMessageMode = ref("todo")
const sentPickupSearch = ref("")
const clientBulkRows = ref([{ id: 1, name: "", phone: "", address: "" }])

const todayKey = computed(() => new Date().toISOString().slice(0, 10))
const canUseDirectMessage = computed(() => authStore.isSuperAdmin)
const operationInProgress = computed(() => sendingDirect.value || sendingBulk.value)
const operationProgressLabel = computed(() =>
  sendingDirect.value ? "Envoi du message en cours..." : "Envoi des formulaires en cours..."
)

const clients = computed(() => {
  const map = new Map()
  const addContact = (client = {}, source = "client") => {
    const name = clientName(client)
    const phone = cleanSmsPhone(client.phone || client.telephone || client.telephoneExpediteur || client.clientPhone || "")
    const key = phone || `${name}|${client.email || ""}|${client.adresse || client.adresseComplete || client.adresseExpediteur || client.clientAdresse || ""}`.toLowerCase()
    if (!key || map.has(key)) return

    map.set(key, {
      ...client,
      id: client.id || key,
      source,
      searchPhone: phone,
      searchAddress: client.adresse || client.adresseComplete || client.adresseExpediteur || client.clientAdresse || client.pickupAddress || "",
    })
  }

  ;(clientsSnap.value || []).forEach((client) => addContact(client, "client"))
  ;(legacyCustomersSnap.value || []).forEach((client) => addContact(client, "customer"))
  ;(enlevementsSnap.value || []).forEach((item) => addContact({
    id: `enlevement:${item.id}`,
    displayName: item.expediteur || "",
    phone: item.telephoneExpediteur || "",
    adresse: item.adresseExpediteur || item.pickupAddress || "",
    email: item.emailExpediteur || "",
  }, "enlevement"))
  ;(pickupRequestsSnap.value || []).forEach((request) => addContact({
    id: `request:${request.id}`,
    displayName: [request.clientPrenom, request.clientNom].filter(Boolean).join(" ").trim(),
    phone: request.clientPhone || "",
    adresse: request.clientAdresse || request.pickupAddress || "",
    email: request.clientEmail || "",
  }, "pickupRequest"))

  return [...map.values()].sort((a, b) => clientName(a).localeCompare(clientName(b), "fr"))
})

const filteredClients = computed(() => {
  const q = clientSearch.value.trim().toLowerCase()
  const source = activeClientSource.value
  const bySource = source === "all"
    ? clients.value
    : clients.value.filter((item) => item.source === source)

  if (!q) return bySource
  return bySource.filter((item) => clientSearchText(item).includes(q))
})

const clientSourceTabs = computed(() => {
  const count = (source) => source === "all"
    ? clients.value.length
    : clients.value.filter((item) => item.source === source).length

  return [
    { key: "all", label: "Tous", count: count("all") },
    { key: "client", label: "Portail", count: count("client") },
    { key: "customer", label: "Interne", count: count("customer") },
    { key: "enlevement", label: "Enlèvements", count: count("enlevement") },
    { key: "pickupRequest", label: "Demandes", count: count("pickupRequest") },
  ]
})

const selectedClient = computed(() =>
  clients.value.find((item) => item.id === selectedClientId.value) || null
)

const selectedClientPhone = computed(() =>
  cleanSmsPhone(
    selectedClient.value?.searchPhone ||
    selectedClient.value?.phone ||
    selectedClient.value?.telephone ||
    selectedClient.value?.telephoneExpediteur ||
    selectedClient.value?.clientPhone ||
    ""
  )
)

const selectedClientAddress = computed(() =>
  selectedClient.value?.searchAddress ||
  selectedClient.value?.adresse ||
  selectedClient.value?.adresseComplete ||
  selectedClient.value?.adresseExpediteur ||
  selectedClient.value?.clientAdresse ||
  selectedClient.value?.pickupAddress ||
  ""
)

const validBulkClientRows = computed(() => {
  const seen = new Set()
  return clientBulkRows.value
    .map((row) => ({
      ...row,
      name: String(row.name || "").trim(),
      phone: cleanSmsPhone(row.phone),
      address: String(row.address || "").trim(),
    }))
    .filter((row) => {
      const key = normalizePhoneKey(row.phone)
      if (!row.phone || seen.has(key)) return false
      seen.add(key)
      return true
    })
})

const reusableSentPickups = computed(() => {
  const map = new Map()

  ;(plannedPickupsSnap.value || []).forEach((pickup) => {
    const cleanPhone = cleanSmsPhone(pickup.clientPhone || "")
    const key = normalizePhoneKey(cleanPhone)
    if (!key || map.has(key)) return
    map.set(key, {
      id: pickup.id || key,
      name: String(pickup.clientName || "").trim() || "Client",
      phone: cleanPhone,
      address: String(pickup.address || "").trim(),
      sentAt: pickup.createdAt || null,
    })
  })

  return [...map.values()]
})
const reusableSentPickupsByPhone = computed(() => {
  const map = new Map()
  reusableSentPickups.value.forEach((pickup) => map.set(normalizePhoneKey(pickup.phone), pickup))
  return map
})
const filteredReusableSentPickups = computed(() => {
  const q = sentPickupSearch.value.trim().toLowerCase()
  const list = reusableSentPickups.value
  if (!q) return list

  return list.filter((pickup) =>
    [pickup.name, pickup.phone, pickup.address]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  )
})

function clientName(client = {}) {
  return client.displayName || client.expediteur || [client.prenom, client.nom].filter(Boolean).join(" ").trim() || client.email || "Client"
}

function sourceLabel(source = "") {
  if (source === "client") return "Portail"
  if (source === "customer") return "Client interne"
  if (source === "enlevement") return "Enlèvement"
  if (source === "pickupRequest") return "Demande"
  return "Contact"
}

function clientSearchText(item = {}) {
  return [
    clientName(item),
    item.email,
    item.phone,
    item.telephone,
    item.searchPhone,
    item.telephoneExpediteur,
    item.clientPhone,
    item.adresse,
    item.adresseComplete,
    item.searchAddress,
    item.adresseExpediteur,
    item.clientAdresse,
    item.pickupAddress,
    item.destination,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function selectClient(client) {
  selectedClientId.value = client.id
  clientSearch.value = clientName(client)
}

function normalizePhoneKey(value = "") {
  return cleanSmsPhone(value).replace(/\D/g, "")
}

function knownContactForRow(row = {}) {
  return reusableSentPickupsByPhone.value.get(normalizePhoneKey(row.phone)) || null
}

function applyReusableContact(row, force = false) {
  const contact = knownContactForRow(row)
  if (!contact) return

  if (force || !String(row.name || "").trim()) row.name = contact.name
  if (force || !String(row.address || "").trim()) row.address = contact.address
  row.phone = contact.phone || row.phone
}

function reuseSentPickup(pickup = {}) {
  const phone = cleanSmsPhone(pickup.phone || "")
  const key = normalizePhoneKey(phone)
  if (!key) return

  const existingRow = clientBulkRows.value.find((row) => normalizePhoneKey(row.phone) === key)
  const emptyRow = clientBulkRows.value.find((row) => !row.name && !row.phone && !row.address)
  const row = existingRow || emptyRow
  const payload = {
    id: row?.id || Date.now() + Math.random(),
    name: pickup.name || "Client",
    phone,
    address: pickup.address || "",
  }

  if (row) {
    Object.assign(row, payload)
  } else {
    clientBulkRows.value = [...clientBulkRows.value, payload]
  }
}

function addSelectedClientToBulk() {
  if (!selectedClient.value) {
    toast("Choisis un client.", { type: "warning" })
    return
  }

  const emptyRow = clientBulkRows.value.find((row) => !row.name && !row.phone && !row.address)
  const payload = {
    id: emptyRow?.id || Date.now() + Math.random(),
    name: clientName(selectedClient.value),
    phone: selectedClientPhone.value,
    address: selectedClientAddress.value,
  }

  if (emptyRow) {
    Object.assign(emptyRow, payload)
  } else {
    clientBulkRows.value = [...clientBulkRows.value, payload]
  }
}

function cleanSmsPhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "")
}

function inviteExpiryDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
}

function buildClientPickupLink(client = {}, inviteId = "") {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://aarontravelgestion.web.app"
  const params = new URLSearchParams()
  if (inviteId) params.set("invite", inviteId)
  if (String(client.name || "").trim()) params.set("nom", String(client.name || "").trim())
  if (String(client.phone || "").trim()) params.set("phone", String(client.phone || "").trim())
  if (String(client.address || "").trim()) params.set("adresse", String(client.address || "").trim())
  const query = params.toString()
  return `${origin}/#/client/enlevement${query ? `?${query}` : ""}`
}

async function createPickupFormInvite(client = {}) {
  const inviteRef = await addDoc(collection(db, "pickupFormInvites"), {
    clientName: String(client.name || "").trim() || "Client",
    clientPhone: cleanSmsPhone(client.phone || ""),
    address: String(client.address || "").trim(),
    status: "pending",
    source: "clientFollowup",
    createdAt: serverTimestamp(),
    expireAt: inviteExpiryDate(),
    submittedAt: null,
  })

  return inviteRef.id
}

function buildClientFormMessage(client, link, mode = "todo") {
  const name = client.name || "client"
  if (mode === "missed") {
    return [
      `TRANSPORT FOMEK - Bonjour ${name},`,
      "suite a notre dernier passage, merci de completer ce formulaire pour enregistrer votre enlevement :",
      link,
    ].join("\n")
  }

  return [
    `TRANSPORT FOMEK - Bonjour ${name},`,
    "merci de remplir ce formulaire avant l'arrivée du chauffeur :",
    link,
  ].join("\n")
}

async function sendSms(phoneNumber, message) {
  const user = auth.currentUser
  if (!user) throw new Error("Reconnecte-toi pour envoyer un SMS")

  const token = await user.getIdToken()
  const response = await fetch(messagingEndpoint("sendInvoiceSMS"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phoneNumber, message }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Erreur envoi SMS")
  }
  return data
}

async function savePlannedPickup(client, link) {
  const address = String(client.address || "").trim()

  await addDoc(collection(db, "plannedPickups"), {
    clientName: String(client.name || "").trim() || "Client",
    clientPhone: cleanSmsPhone(client.phone || ""),
    address,
    link,
    inviteId: client.inviteId || "",
    dateKey: todayKey.value,
    status: "sent",
    source: "clientFollowupSms",
    createdAt: serverTimestamp(),
  })
}

async function saveClientMessage({ clientId = "", clientName = "", phone = "", message = "", type = "direct", sid = "" }) {
  await addDoc(collection(db, "clientMessages"), {
    clientId,
    clientName,
    phone,
    message,
    type,
    sid,
    createdAt: serverTimestamp(),
  })
}

function addClientBulkRow() {
  clientBulkRows.value = [...clientBulkRows.value, { id: Date.now() + Math.random(), name: "", phone: "", address: "" }]
}

function removeClientBulkRow(rowId) {
  if (clientBulkRows.value.length === 1) {
    clientBulkRows.value = [{ id: Date.now(), name: "", phone: "", address: "" }]
    return
  }
  clientBulkRows.value = clientBulkRows.value.filter((row) => row.id !== rowId)
}

function fillSelectedClientMessage(template = "custom") {
  const name = clientName(selectedClient.value || {})
  if (template === "pickup") {
    directMessage.value = `TRANSPORT FOMEK - Bonjour ${name}, merci de confirmer votre disponibilité pour l'enlèvement.`
    return
  }
  if (template === "missing") {
    directMessage.value = `TRANSPORT FOMEK - Bonjour ${name}, il nous manque des informations pour finaliser votre dossier. Merci de nous répondre.`
    return
  }
  directMessage.value = ""
}

async function sendDirectMessage() {
  if (!canUseDirectMessage.value) {
    toast("Réservé au superadmin.", { type: "warning" })
    return
  }
  if (!selectedClient.value) {
    toast("Choisis un client.", { type: "warning" })
    return
  }
  if (!selectedClientPhone.value) {
    toast("Téléphone client manquant.", { type: "warning" })
    return
  }
  if (!directMessage.value.trim()) {
    toast("Saisis un message.", { type: "warning" })
    return
  }

  sendingDirect.value = true
  try {
    const data = await sendSms(selectedClientPhone.value, directMessage.value)
    await saveClientMessage({
      clientId: selectedClient.value.id,
      clientName: clientName(selectedClient.value),
      phone: selectedClientPhone.value,
      message: directMessage.value,
      type: "direct",
      sid: data.sid || "",
    })
    await logActivity({
      action: "direct_message_sent",
      targetType: "client",
      targetId: selectedClient.value.id,
      label: clientName(selectedClient.value),
      details: { phone: selectedClientPhone.value },
    })
    toast("Message envoyé au client.", { type: "success" })
  } catch (error) {
    toast(error.message || "Envoi impossible.", { type: "error" })
  } finally {
    sendingDirect.value = false
  }
}

async function sendBulkClientPickupLink() {
  const rows = validBulkClientRows.value
  if (!rows.length) {
    toast("Ajoute au moins une ligne avec un téléphone.", { type: "warning" })
    return
  }

  sendingBulk.value = true
  try {
    let okCount = 0
    for (const client of rows) {
      const inviteId = await createPickupFormInvite(client)
      const clientWithInvite = { ...client, inviteId }
      const link = buildClientPickupLink(client, inviteId)
      const message = buildClientFormMessage(client, link, clientMessageMode.value)
      try {
        const data = await sendSms(client.phone, message)
        await savePlannedPickup(clientWithInvite, link)
        await saveClientMessage({
          clientName: client.name || "Client",
          phone: client.phone,
          message,
          type: "pickupForm",
          sid: data.sid || "",
        })
        await logActivity({
          action: "pickup_form_link_sent",
          targetType: "pickupFormInvite",
          targetId: inviteId,
          label: client.name || "Client",
          details: { phone: client.phone },
        })
        okCount += 1
      } catch (error) {
        console.warn("Erreur SMS client", client.phone, error)
      }
    }
    toast(`Formulaire envoyé à ${okCount}/${rows.length} client(s)`, { type: okCount ? "success" : "warning" })
  } catch (error) {
    toast(error.message || "Impossible d'envoyer les SMS clients.", { type: "error" })
  } finally {
    sendingBulk.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Clients</p>
      <h2 class="mt-2 text-2xl font-bold text-slate-950">Suivi client</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Envoie les formulaires d'enlèvement et garde les échanges client hors du suivi chauffeur.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6">
      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="text-lg font-bold text-slate-950">Formulaire d'enlèvement client</h3>
        <p class="mt-1 text-sm text-slate-600">Ajoute les clients à prévenir avant ou après passage chauffeur.</p>

        <div v-if="operationInProgress" class="operation-progress mt-4">
          <div class="operation-progress__label">
            <span>{{ operationProgressLabel }}</span>
            <span>Patiente...</span>
          </div>
          <div class="operation-progress__track">
            <div class="operation-progress__bar"></div>
          </div>
        </div>

        <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Message envoyé</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              class="rounded-lg px-3 py-2 text-sm font-bold transition"
              type="button"
              :class="clientMessageMode === 'todo' ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-white text-slate-700'"
              @click="clientMessageMode = 'todo'"
            >
              À faire
            </button>
            <button
              class="rounded-lg px-3 py-2 text-sm font-bold transition"
              type="button"
              :class="clientMessageMode === 'missed' ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-white text-slate-700'"
              @click="clientMessageMode = 'missed'"
            >
              Déjà passé
            </button>
          </div>
        </div>

        <div class="mt-4 space-y-3">
          <div
            v-for="(row, index) in clientBulkRows"
            :key="row.id"
            class="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_190px_minmax(0,1.3fr)_44px]"
          >
            <input v-model="row.name" class="h-11 rounded-lg border border-slate-300 px-3 text-sm" :placeholder="index === 0 ? 'Nom client' : 'Nom'" />
            <div>
              <input
                v-model="row.phone"
                class="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="Téléphone"
                @blur="applyReusableContact(row)"
              />
              <button
                v-if="knownContactForRow(row)"
                class="mt-1 text-left text-xs font-semibold text-cyan-800 hover:text-cyan-900"
                type="button"
                @click="applyReusableContact(row, true)"
              >
                Réutiliser {{ knownContactForRow(row).name }} · {{ knownContactForRow(row).address || "adresse non renseignée" }}
              </button>
            </div>
            <input v-model="row.address" class="h-11 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Adresse optionnelle" />
            <button class="h-11 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700 disabled:opacity-50" type="button" :disabled="sendingBulk" @click="removeClientBulkRow(row.id)">
              X
            </button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50" type="button" :disabled="sendingBulk" @click="addClientBulkRow">
            Ajouter une ligne
          </button>
          <button class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" type="button" :disabled="sendingBulk" @click="sendBulkClientPickupLink">
            {{ sendingBulk ? "Envoi..." : `Envoyer à ${validBulkClientRows.length} client(s)` }}
          </button>
        </div>

        <div class="mt-6 rounded-lg border border-slate-200">
          <div class="border-b border-slate-200 px-4 py-3">
            <p class="font-bold text-slate-950">Derniers formulaires envoyés</p>
            <input
              v-model="sentPickupSearch"
              class="mt-3 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="Rechercher nom, téléphone, adresse..."
            />
          </div>
          <div class="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            <button
              v-for="item in filteredReusableSentPickups.slice(0, 20)"
              :key="item.id"
              class="block w-full p-4 text-left text-sm hover:bg-slate-50"
              type="button"
              @click="reuseSentPickup(item)"
            >
              <span class="block font-bold text-slate-950">{{ item.name || "Client" }}</span>
              <span class="mt-1 block text-slate-500">{{ item.phone || "-" }} · {{ item.address || "Adresse non renseignée" }}</span>
              <span class="mt-2 inline-flex rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">
                Réutiliser
              </span>
            </button>
            <p v-if="!filteredReusableSentPickups.length" class="p-6 text-sm text-slate-500">
              Aucun formulaire envoyé trouvé.
            </p>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
