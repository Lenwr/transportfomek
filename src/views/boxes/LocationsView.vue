<script setup>
import { computed, ref } from "vue"
import { RouterLink } from "vue-router"
import { getAuth } from "firebase/auth"
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp } from "firebase/firestore"
import { useCollection, useFirestore } from "vuefire"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { safeISO, todayISO } from "../../utils/billingSync"
import { useAuthStore } from "../../stores/useAuthStore"

const db = useFirestore()
const authStore = useAuthStore()
const FUNCTIONS_BASE_URL = "https://us-central1-aarontravelgestion.cloudfunctions.net"

const contractsSnap = useCollection(query(collection(db, "contracts"), orderBy("createdAt", "desc")))
const paymentsSnap = useCollection(query(collection(db, "payments"), orderBy("period", "desc")))
const invoicesSnap = useCollection(query(collection(db, "invoices"), orderBy("createdAt", "desc")))
const boxesSnap = useCollection(query(collection(db, "boxes"), orderBy("code", "asc")))
const depotContactsSnap = useCollection(query(collection(db, "boxDepotContacts"), orderBy("name", "asc")))

const search = ref("")
const statusFilter = ref("all")
const paymentFilter = ref("all")
const broadcastAudience = ref("active")
const broadcastMessage = ref("")
const selectedBroadcastPhones = ref(new Set())
const isSendingBroadcast = ref(false)
const depotContactName = ref("")
const depotContactPhone = ref("")
const isSavingDepotContact = ref(false)
const closingContractId = ref("")

const contracts = computed(() => contractsSnap.value || [])
const payments = computed(() => paymentsSnap.value || [])
const invoices = computed(() => invoicesSnap.value || [])
const boxes = computed(() => boxesSnap.value || [])
const depotContacts = computed(() => depotContactsSnap.value || [])

const boxesById = computed(() => {
  const map = new Map()
  boxes.value.forEach((box) => map.set(box.id, box))
  return map
})

const paymentsByContract = computed(() => {
  const map = new Map()
  for (const payment of payments.value) {
    const contractId = String(payment.contractId || "")
    if (!contractId) continue
    if (!map.has(contractId)) map.set(contractId, [])
    map.get(contractId).push(payment)
  }
  return map
})

const invoicesByContract = computed(() => {
  const map = new Map()
  for (const invoice of invoices.value) {
    const contractId = String(invoice.contractId || "")
    if (!contractId) continue
    if (!map.has(contractId)) map.set(contractId, [])
    map.get(contractId).push(invoice)
  }
  return map
})

const locations = computed(() =>
  contracts.value.map((contract) => {
    const contractPayments = paymentsByContract.value.get(contract.id) || []
    const contractInvoices = invoicesByContract.value.get(contract.id) || []
    const box = contract.boxId ? boxesById.value.get(contract.boxId) : null
    const paid = contractPayments.reduce((sum, payment) => sum + Number(payment.amountTTC ?? payment.amount ?? 0), 0)
    const due = contractInvoices.reduce((sum, invoice) => sum + Number(invoice?.totals?.due || 0), 0)
    const latestPayment = contractPayments[0] || null
    const nextDue = contract.nextDueDate || nextDueFromInvoices(contractInvoices)

    return {
      id: contract.id,
      contract,
      box,
      clientName: clientName(contract),
      boxCode: contract.boxCode || box?.code || "Box",
      status: normalizeStatus(contract.status),
      paymentState: due > 0 ? "due" : contractPayments.length ? "paid" : "none",
      paid,
      due,
      invoicesCount: contractInvoices.length,
      paymentsCount: contractPayments.length,
      latestPaymentPeriod: latestPayment?.period || "",
      nextDue,
      isLate: due > 0 && nextDue && nextDue < todayISO(),
    }
  })
)

const filteredLocations = computed(() => {
  const q = normalize(search.value)
  return locations.value.filter((location) => {
    const text = [
      location.clientName,
      location.boxCode,
      location.contract.phone,
      location.contract.email,
      location.contract.clientNumber,
      location.contract.id,
      location.latestPaymentPeriod,
    ].join(" ").toLowerCase()

    return (
      (!q || text.includes(q)) &&
      (statusFilter.value === "all" || location.status === statusFilter.value) &&
      (paymentFilter.value === "all" || location.paymentState === paymentFilter.value)
    )
  })
})

const stats = computed(() => ({
  all: locations.value.length,
  draft: locations.value.filter((item) => item.status === "draft").length,
  active: locations.value.filter((item) => item.status === "active" || item.status === "signed").length,
  late: locations.value.filter((item) => item.isLate).length,
  due: locations.value.reduce((sum, item) => sum + item.due, 0),
}))

const broadcastRecipients = computed(() => {
  const map = new Map()
  const audience = broadcastAudience.value

  for (const location of locations.value) {
    const isActive = location.status === "active" || location.status === "signed"
    if (audience === "active" && !isActive) continue
    if (audience === "late" && !location.isLate) continue

    const phone = normalizePhone(location.contract.phone)
    if (!phone) continue

    if (!map.has(phone)) {
      map.set(phone, {
        phone,
        label: location.clientName,
        detail: `${location.boxCode}${location.isLate ? " · en retard" : ""}`,
      })
    }
  }

  for (const contact of depotContacts.value) {
    if (contact.disabled) continue

    const phone = normalizePhone(contact.phone)
    if (!phone || map.has(phone)) continue

    map.set(phone, {
      phone,
      label: contact.name || "Contact depot",
      detail: "Equipe depot",
      type: "depot",
    })
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"))
})

const depotBroadcastRecipientsCount = computed(
  () => broadcastRecipients.value.filter((recipient) => recipient.type === "depot").length
)

const selectedBroadcastCount = computed(() => selectedBroadcastPhones.value.size)
const allBroadcastRecipientsSelected = computed(
  () => broadcastRecipients.value.length > 0 && selectedBroadcastCount.value === broadcastRecipients.value.length
)

const selectedBroadcastPayload = computed(() =>
  broadcastRecipients.value
    .filter((recipient) => selectedBroadcastPhones.value.has(recipient.phone))
    .map((recipient) => recipient.phone)
)

const canUseBoxBroadcast = computed(
  () => authStore.isSuperAdmin || (Array.isArray(authStore.permissions) && authStore.permissions.includes("boxBroadcast"))
)

function normalize(value = "") {
  return String(value || "").trim().toLowerCase()
}

function normalizePhone(value = "") {
  const raw = String(value || "").trim()
  const digits = raw.replace(/\D/g, "")
  if (!digits) return ""
  if (raw.startsWith("+")) return `+${digits}`
  if (digits.startsWith("00")) return `+${digits.slice(2)}`
  if (digits.startsWith("0")) return `+33${digits.slice(1)}`
  return `+${digits}`
}

function clientName(contract = {}) {
  return contract.companyName || contract.representativeName || contract.clientName || "Client"
}

function normalizeStatus(status = "") {
  const value = normalize(status)
  if (value === "signed") return "signed"
  if (value === "closed" || value === "ended") return "closed"
  if (value === "draft" || value === "reserved") return "draft"
  return value || "active"
}

function statusLabel(status = "") {
  if (status === "signed") return "Signé"
  if (status === "active") return "Actif"
  if (status === "draft") return "À signer"
  if (status === "closed") return "Clôturé"
  return status || "Actif"
}

function statusClass(status = "") {
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "active") return "border-cyan-200 bg-cyan-50 text-cyan-800"
  if (status === "draft") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "closed") return "border-slate-200 bg-slate-100 text-slate-600"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

function paymentLabel(state = "") {
  if (state === "due") return "Solde ouvert"
  if (state === "paid") return "Paiement reçu"
  return "Aucun paiement"
}

function paymentClass(location) {
  if (location.isLate) return "border-red-200 bg-red-50 text-red-700"
  if (location.paymentState === "due") return "border-amber-200 bg-amber-50 text-amber-700"
  if (location.paymentState === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

function money(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0))
}

function formatDate(value) {
  const iso = safeISO(value)
  if (!iso) return "-"
  return new Intl.DateTimeFormat("fr-FR").format(new Date(`${iso}T00:00:00`))
}

function nextDueFromInvoices(contractInvoices = []) {
  const open = contractInvoices
    .filter((invoice) => Number(invoice?.totals?.due || 0) > 0)
    .map((invoice) => safeISO(invoice.dueDate || invoice.issueDate))
    .filter(Boolean)
    .sort()
  return open[0] || ""
}

function audienceLabel(value = broadcastAudience.value) {
  if (value === "late") return "Locataires en retard"
  if (value === "all") return "Tous les locataires"
  return "Locations actives"
}

function toggleBroadcastRecipient(phone, checked) {
  const next = new Set(selectedBroadcastPhones.value)
  if (checked) next.add(phone)
  else next.delete(phone)
  selectedBroadcastPhones.value = next
}

function toggleAllBroadcastRecipients(checked) {
  selectedBroadcastPhones.value = new Set(checked ? broadcastRecipients.value.map((item) => item.phone) : [])
}

function clearUnavailableBroadcastRecipients() {
  const available = new Set(broadcastRecipients.value.map((item) => item.phone))
  selectedBroadcastPhones.value = new Set([...selectedBroadcastPhones.value].filter((phone) => available.has(phone)))
}

async function addDepotContact() {
  if (!canUseBoxBroadcast.value) {
    toast("Acces reserve a la diffusion boxes.", { type: "warning" })
    return
  }

  const name = depotContactName.value.trim()
  const phone = normalizePhone(depotContactPhone.value)

  if (!name) {
    toast("Ajoute le nom du contact depot", { type: "warning" })
    return
  }

  if (!phone) {
    toast("Ajoute un telephone valide", { type: "warning" })
    return
  }

  const alreadyExists = depotContacts.value.some((contact) => normalizePhone(contact.phone) === phone)
  if (alreadyExists) {
    toast("Ce numero est deja dans les contacts depot", { type: "warning" })
    return
  }

  try {
    isSavingDepotContact.value = true
    const auth = getAuth()
    await addDoc(collection(db, "boxDepotContacts"), {
      name,
      phone,
      createdAt: serverTimestamp(),
      createdByUid: auth.currentUser?.uid || "",
      createdByEmail: auth.currentUser?.email || "",
      createdByName: auth.currentUser?.displayName || "",
    })

    selectedBroadcastPhones.value = new Set([...selectedBroadcastPhones.value, phone])
    depotContactName.value = ""
    depotContactPhone.value = ""
    toast("Contact depot ajoute", { type: "success" })
  } catch (error) {
    console.error("Erreur ajout contact depot:", error)
    toast(error?.message || "Erreur ajout contact depot", { type: "error" })
  } finally {
    isSavingDepotContact.value = false
  }
}

async function removeDepotContact(contact) {
  if (!contact?.id) return

  try {
    await deleteDoc(doc(db, "boxDepotContacts", contact.id))
    const phone = normalizePhone(contact.phone)
    if (phone) {
      const next = new Set(selectedBroadcastPhones.value)
      next.delete(phone)
      selectedBroadcastPhones.value = next
    }
    toast("Contact depot supprime", { type: "success" })
  } catch (error) {
    console.error("Erreur suppression contact depot:", error)
    toast(error?.message || "Erreur suppression contact depot", { type: "error" })
  }
}

async function sendBoxesBroadcast() {
  if (!canUseBoxBroadcast.value) {
    toast("Acces reserve a la diffusion boxes.", { type: "warning" })
    return
  }

  clearUnavailableBroadcastRecipients()
  const phones = selectedBroadcastPayload.value
  const message = broadcastMessage.value.trim()

  if (!phones.length) {
    toast("Selectionne au moins un locataire", { type: "warning" })
    return
  }

  if (!message) {
    toast("Le message est vide", { type: "warning" })
    return
  }

  try {
    isSendingBroadcast.value = true
    const auth = getAuth()
    const token = await auth.currentUser?.getIdToken(true)
    if (!token) throw new Error("Session expiree. Reconnecte-toi.")

    const response = await fetch(`${FUNCTIONS_BASE_URL}/sendBoxTenantBroadcastSMS`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phones, message }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || "Erreur pendant l'envoi de la diffusion")
    }

    const results = Array.isArray(data?.results) ? data.results : []
    const sentCount = results.length ? results.filter((item) => item.ok).length : phones.length
    const failedCount = results.filter((item) => !item.ok).length

    await addDoc(collection(db, "boxBroadcastMessages"), {
      audience: broadcastAudience.value,
      audienceLabel: audienceLabel(),
      message,
      phones,
      recipientsCount: phones.length,
      depotRecipientsCount: selectedBroadcastPayload.value.filter((phone) =>
        depotContacts.value.some((contact) => normalizePhone(contact.phone) === phone)
      ).length,
      sentCount,
      failedCount,
      results,
      createdAt: serverTimestamp(),
      createdByUid: auth.currentUser?.uid || "",
      createdByEmail: auth.currentUser?.email || "",
    })

    toast(
      failedCount
        ? `Diffusion envoyee a ${sentCount} numero(s), ${failedCount} echec(s)`
        : `Diffusion envoyee a ${sentCount} numero(s)`,
      { type: failedCount ? "warning" : "success" }
    )

    broadcastMessage.value = ""
    selectedBroadcastPhones.value = new Set()
  } catch (error) {
    console.error("Erreur diffusion locataires boxes:", error)
    toast(error?.message || "Erreur envoi diffusion", { type: "error" })
  } finally {
    isSendingBroadcast.value = false
  }
}

async function closeContract(location) {
  if (!location?.id || location.status === "closed" || closingContractId.value) return

  const confirmed = window.confirm(
    `Clôturer le contrat de ${location.clientName} et libérer le box ${location.boxCode} ?`
  )
  if (!confirmed) return

  try {
    closingContractId.value = location.id
    const auth = getAuth()
    const token = await auth.currentUser?.getIdToken(true)
    if (!token) throw new Error("Session expirée. Reconnecte-toi.")

    const response = await fetch(`${FUNCTIONS_BASE_URL}/closeContract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contractId: location.id, reason: "manual" }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || "Impossible de clôturer le contrat")
    }

    toast("Contrat clôturé et box libéré", { type: "success", autoClose: 1400 })
  } catch (error) {
    console.error("Erreur clôture contrat:", error)
    toast(error?.message || "Erreur pendant la clôture", { type: "error" })
  } finally {
    closingContractId.value = ""
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Boxes</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Locations boxes</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Suis les contrats, signatures, paiements et factures depuis un seul tableau de bord.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <RouterLink to="/boxes" class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-cyan-200 hover:text-cyan-800">
            Voir les boxes
          </RouterLink>
          <RouterLink to="/contracts/create" class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800">
            Nouvelle location
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium text-slate-500">Locations</p>
        <p class="mt-1 text-2xl font-bold text-slate-950">{{ stats.all }}</p>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium text-slate-500">À signer</p>
        <p class="mt-1 text-2xl font-bold text-amber-700">{{ stats.draft }}</p>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium text-slate-500">Actives</p>
        <p class="mt-1 text-2xl font-bold text-cyan-800">{{ stats.active }}</p>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium text-slate-500">En retard</p>
        <p class="mt-1 text-2xl font-bold text-red-700">{{ stats.late }}</p>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium text-slate-500">Solde ouvert</p>
        <p class="mt-1 text-2xl font-bold text-slate-950">{{ money(stats.due) }}</p>
      </div>
    </div>

    <div v-if="canUseBoxBroadcast" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Diffusion locataires</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950">Message SMS boxes</h3>
          <p class="mt-1 text-sm text-slate-500">
            {{ selectedBroadcastCount }} selectionne(s) sur {{ broadcastRecipients.length }} destinataire(s),
            dont {{ depotBroadcastRecipientsCount }} contact(s) depot.
          </p>
        </div>

        <div class="flex w-full flex-col gap-3 xl:max-w-3xl">
          <div class="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <select
              v-model="broadcastAudience"
              class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              @change="clearUnavailableBroadcastRecipients"
            >
              <option value="active">Locations actives</option>
              <option value="late">Locataires en retard</option>
              <option value="all">Tous les locataires</option>
            </select>

            <textarea
              v-model="broadcastMessage"
              rows="3"
              class="min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800"
              placeholder="Ex: Bonjour, votre facture box du mois est disponible. Merci de regulariser votre paiement."
            ></textarea>

            <button
              type="button"
              class="h-11 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              :disabled="isSendingBroadcast || !selectedBroadcastCount || !broadcastMessage.trim()"
              @click="sendBoxesBroadcast"
            >
              {{ isSendingBroadcast ? "Envoi..." : "Envoyer" }}
            </button>
          </div>

          <div class="rounded-lg border border-cyan-100 bg-cyan-50 p-3">
            <div class="grid gap-2 md:grid-cols-[1fr_170px_auto]">
              <input
                v-model="depotContactName"
                class="h-10 rounded-lg border border-cyan-200 bg-white px-3 text-sm text-slate-800"
                placeholder="Nom contact depot"
                @keyup.enter="addDepotContact"
              />
              <input
                v-model="depotContactPhone"
                class="h-10 rounded-lg border border-cyan-200 bg-white px-3 text-sm text-slate-800"
                placeholder="Telephone"
                @keyup.enter="addDepotContact"
              />
              <button
                type="button"
                class="h-10 rounded-lg bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                :disabled="isSavingDepotContact || !depotContactName.trim() || !depotContactPhone.trim()"
                @click="addDepotContact"
              >
                {{ isSavingDepotContact ? "Ajout..." : "Ajouter depot" }}
              </button>
            </div>

            <div v-if="depotContacts.length" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="contact in depotContacts"
                :key="contact.id"
                class="inline-flex max-w-full items-center gap-2 rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                <span class="truncate">{{ contact.name || "Contact depot" }} · {{ normalizePhone(contact.phone) }}</span>
                <button
                  type="button"
                  class="rounded px-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Supprimer le contact depot"
                  @click="removeDepotContact(contact)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>

          <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label class="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300"
                  :checked="allBroadcastRecipientsSelected"
                  @change="toggleAllBroadcastRecipients($event.target.checked)"
                />
                Tout selectionner
              </label>
              <button type="button" class="text-xs font-bold text-slate-500 hover:text-cyan-800" @click="selectedBroadcastPhones = new Set()">
                Vider
              </button>
            </div>

            <div v-if="broadcastRecipients.length" class="mt-3 grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              <label
                v-for="recipient in broadcastRecipients"
                :key="recipient.phone"
                class="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-slate-300"
                  :checked="selectedBroadcastPhones.has(recipient.phone)"
                  @change="toggleBroadcastRecipient(recipient.phone, $event.target.checked)"
                />
                <span class="min-w-0">
                  <span class="block truncate font-bold text-slate-800">{{ recipient.label }}</span>
                  <span class="block truncate text-xs text-slate-500">
                    {{ recipient.phone }} · {{ recipient.detail }}
                    <span v-if="recipient.type === 'depot'" class="font-bold text-cyan-800">· Depot</span>
                  </span>
                </span>
              </label>
            </div>

            <p v-else class="mt-3 text-sm text-slate-500">Aucun locataire avec telephone pour cette audience.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px]">
        <input
          v-model="search"
          class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          placeholder="Rechercher client, box, téléphone, email, contrat..."
        />
        <select v-model="statusFilter" class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="all">Tous statuts</option>
          <option value="draft">À signer</option>
          <option value="active">Actif</option>
          <option value="signed">Signé</option>
          <option value="closed">Clôturé</option>
        </select>
        <select v-model="paymentFilter" class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="all">Tous paiements</option>
          <option value="due">Solde ouvert</option>
          <option value="paid">Paiement reçu</option>
          <option value="none">Aucun paiement</option>
        </select>
      </div>
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="hidden border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[1.2fr_.8fr_.8fr_.8fr_.9fr_280px]">
        <span>Client</span>
        <span>Box</span>
        <span>Contrat</span>
        <span>Paiement</span>
        <span>Solde</span>
        <span class="text-right">Actions</span>
      </div>

      <div class="divide-y divide-slate-100">
        <article
          v-for="location in filteredLocations"
          :key="location.id"
          class="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_.8fr_.8fr_.8fr_.9fr_280px] lg:items-center"
        >
          <div class="min-w-0">
            <p class="truncate font-bold text-slate-950">{{ location.clientName }}</p>
            <p class="mt-1 truncate text-sm text-slate-500">{{ location.contract.phone || "-" }} · {{ location.contract.email || "-" }}</p>
          </div>

          <div>
            <p class="font-bold text-slate-950">{{ location.boxCode }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ location.box?.locationNote || location.contract.boxLocation || "-" }}</p>
          </div>

          <div>
            <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold" :class="statusClass(location.status)">
              {{ statusLabel(location.status) }}
            </span>
            <p class="mt-1 text-xs text-slate-500">Début {{ formatDate(location.contract.startDate) }}</p>
          </div>

          <div>
            <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold" :class="paymentClass(location)">
              {{ location.isLate ? "En retard" : paymentLabel(location.paymentState) }}
            </span>
            <p class="mt-1 text-xs text-slate-500">
              {{ location.latestPaymentPeriod ? `Dernier ${location.latestPaymentPeriod}` : "Aucun mois payé" }}
            </p>
          </div>

          <div>
            <p class="font-bold" :class="location.due > 0 ? 'text-red-700' : 'text-slate-950'">{{ money(location.due) }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ location.invoicesCount }} facture(s) · {{ location.paymentsCount }} paiement(s)</p>
          </div>

          <div class="flex flex-wrap justify-start gap-2 lg:justify-end">
            <RouterLink :to="`/contracts/${location.id}`" class="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-800">
              Dossier
            </RouterLink>
            <RouterLink :to="`/contracts/${location.id}/pay`" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-200">
              Paiement
            </RouterLink>
            <RouterLink :to="`/invoices?contractId=${location.id}`" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-200">
              Factures
            </RouterLink>
            <RouterLink :to="`/contracts/${location.id}/edit`" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-200">
              Modifier
            </RouterLink>
            <button
              v-if="location.status !== 'closed'"
              type="button"
              class="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
              :disabled="closingContractId === location.id"
              @click="closeContract(location)"
            >
              {{ closingContractId === location.id ? "Clôture..." : "Clôturer" }}
            </button>
          </div>
        </article>

        <p v-if="!filteredLocations.length" class="p-8 text-center text-sm text-slate-500">
          Aucune location trouvée.
        </p>
      </div>
    </div>
  </section>
</template>
