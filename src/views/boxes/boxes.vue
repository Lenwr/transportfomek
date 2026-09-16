<!-- src/views/BoxesView.vue -->
<script setup>
import { confirmToast } from "../../utils/confirmToast.js"
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useCollection, useFirestore } from "vuefire"
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { getAuth } from "firebase/auth"
import Depot3DPlan from "./components/Depot3DPlan.vue"

/* =========================
   Router
========================= */
const router = useRouter()

/* =========================
   Firestore
========================= */
const db = useFirestore()
const boxesCol = collection(db, "boxes")
const contractsCol = collection(db, "contracts")
const invoicesCol = collection(db, "invoices")

const boxesSnap = useCollection(query(boxesCol, orderBy("code", "asc")))
const contractsSnap = useCollection(query(contractsCol, orderBy("createdAt", "desc")))
const invoicesSnap = useCollection(query(invoicesCol, orderBy("createdAt", "desc")))

/* =========================
   Functions URLs
========================= */
const CLOSE_CONTRACT_URL =
  "https://us-central1-aarontravelgestion.cloudfunctions.net/closeContract"
const DELETE_BOX_SAFE_URL =
  "https://us-central1-aarontravelgestion.cloudfunctions.net/deleteBoxSafe"

async function callFunction(url, body) {
  const auth = getAuth()
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error("Tu dois être connecté")

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    throw new Error(json.error || "Erreur serveur")
  }

  return json
}

/* =========================
   UI State
========================= */
const search = ref("")
const statusFilter = ref("all")
const sizeFilter = ref("all")

const showAddModal = ref(false)
const showBulkModal = ref(false)
const isSaving = ref(false)

const drawerOpen = ref(false)
const selectedBox = ref(null)

const showEditModal = ref(false)
const isUpdating = ref(false)
const editForm = ref({
  code: "",
  size: "S",
  volumeM3: 0,
  priceMonthly: 0,
  locationNote: "",
  status: "available",
})

/* =========================
   Add Box Form
========================= */
const form = ref({
  code: "",
  size: "S",
  volumeM3: 0,
  priceMonthly: 0,
  locationNote: "",
  status: "available",
})

function resetForm() {
  form.value = {
    code: "",
    size: "S",
    volumeM3: 0,
    priceMonthly: 0,
    locationNote: "",
    status: "available",
  }
}

/* =========================
   Bulk Create
========================= */
const bulk = ref({
  prefix: "B-",
  startNumber: 1,
  count: 10,
  pad: 3,
  size: "S",
  volumeM3: 0,
  priceMonthly: 0,
  locationNote: "",
  status: "available",
})

/* =========================
   Helpers
========================= */
function norm(s) {
  return String(s || "").toLowerCase().trim()
}

function statusLabel(st) {
  const v = norm(st)
  if (v === "late") return "En retard"
  if (v === "unrented") return "Non loué"
  if (v === "available") return "Disponible"
  if (v === "rented") return "Loué"
  if (v === "maintenance") return "Maintenance"
  if (v === "reserved") return "Réservé"
  return st || "—"
}

function statusBadgeClasses(st) {
  const v = norm(st)
  if (v === "late") return "bg-red-100 text-red-800 border-red-200"
  if (v === "unrented") return "bg-amber-100 text-amber-800 border-amber-200"
  if (v === "available") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (v === "rented") return "bg-indigo-100 text-indigo-800 border-indigo-200"
  if (v === "maintenance") return "bg-slate-100 text-slate-800 border-slate-200"
  if (v === "reserved") return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-slate-100 text-slate-800 border-slate-200"
}

function cardRingClasses(st) {
  const v = norm(st)
  if (v === "late") return "ring-red-200 hover:ring-red-300"
  if (v === "unrented") return "ring-amber-200 hover:ring-amber-300"
  if (v === "available") return "ring-emerald-200 hover:ring-emerald-300"
  if (v === "rented") return "ring-indigo-200 hover:ring-indigo-300"
  if (v === "maintenance") return "ring-slate-200 hover:ring-slate-300"
  if (v === "reserved") return "ring-amber-200 hover:ring-amber-300"
  return "ring-slate-200 hover:ring-slate-300"
}

function formatCode(prefix, n, pad = 3) {
  const num = String(Math.max(0, Number(n) || 0)).padStart(pad, "0")
  return `${prefix}${num}`
}

function money(n) {
  return Number(n || 0).toLocaleString("fr-FR")
}

function contractClientName(contract) {
  if (!contract) return "Aucun"
  return (
    contract.companyName ||
    contract.representativeName ||
    contract.clientName ||
    contract.client?.companyName ||
    contract.client?.representativeName ||
    "Client —"
  )
}

/* =========================
   Computeds
========================= */
const rawBoxes = computed(() => boxesSnap.value || [])
const contracts = computed(() => contractsSnap.value || [])
const invoices = computed(() => invoicesSnap.value || [])

const contractsById = computed(() => {
  const map = new Map()
  for (const c of contracts.value) {
    if (c?.id) map.set(c.id, c)
  }
  return map
})

const openInvoicesByContractId = computed(() => {
  const map = new Map()
  for (const invoice of invoices.value) {
    const contractId = String(invoice.contractId || "").trim()
    const due = Number(invoice?.totals?.due || 0)
    if (!contractId || due <= 0) continue
    if (!map.has(contractId)) map.set(contractId, [])
    map.get(contractId).push(invoice)
  }
  return map
})

function safeISO(value) {
  if (!value) return ""
  if (typeof value === "string") return value.slice(0, 10)
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return ""
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function operationalStatus(box, contract) {
  const rawStatus = norm(box?.status)
  if (rawStatus === "maintenance") return "maintenance"
  if (rawStatus === "available") return "available"
  if (rawStatus === "reserved") return "unrented"

  const openInvoices = contract?.id ? openInvoicesByContractId.value.get(contract.id) || [] : []
  const hasLateInvoice = openInvoices.some((invoice) => {
    const dueDate = safeISO(invoice.dueDate || invoice.issueDate || invoice.createdAt)
    return dueDate && dueDate < todayISO()
  })
  if (hasLateInvoice) return "late"
  if (rawStatus === "rented") return "rented"
  return rawStatus || "other"
}

const boxes = computed(() => {
  return rawBoxes.value.map((b) => {
    const currentContract = b.currentContractId
      ? contractsById.value.get(b.currentContractId) || null
      : null

    return {
      id: b.id,
      code: b.code || "",
      siteId: b.siteId || "",
      size: b.size || "S",
      volumeM3: Number(b.volumeM3 || 0),
      priceMonthly: Number(b.priceMonthly || 0),
      locationNote: b.locationNote || "",
      status: b.status || "available",
      operationalStatus: operationalStatus(b, currentContract),
      openInvoiceCount: currentContract?.id
        ? (openInvoicesByContractId.value.get(currentContract.id) || []).length
        : 0,
      currentContractId: b.currentContractId || null,
      createdAt: b.createdAt || null,
      updatedAt: b.updatedAt || null,
      currentContract,
      currentClientName: contractClientName(currentContract),
    }
  })
})

const filteredBoxes = computed(() => {
  const s = norm(search.value)
  const st = statusFilter.value
  const sz = sizeFilter.value

  return boxes.value.filter((b) => {
    const matchSearch =
      !s ||
      norm(b.code).includes(s) ||
      norm(b.locationNote).includes(s) ||
      norm(b.size).includes(s) ||
      norm(b.currentClientName).includes(s)

    const matchStatus = st === "all" ? true : norm(b.status) === st
    const matchSize = sz === "all" ? true : norm(b.size) === norm(sz)

    return matchSearch && matchStatus && matchSize
  })
})

const kpis = computed(() => {
  const all = boxes.value.length
  const available = boxes.value.filter((b) => norm(b.status) === "available").length
  const rented = boxes.value.filter((b) => norm(b.status) === "rented").length
  const maintenance = boxes.value.filter((b) => norm(b.status) === "maintenance").length
  const reserved = boxes.value.filter((b) => norm(b.status) === "reserved").length

  return {
    all,
    available,
    rented,
    maintenance,
    reserved,
  }
})

/* =========================
   Drawer
========================= */
function openDrawer(box) {
  selectedBox.value = box
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  selectedBox.value = null
}

/* =========================
   Routing
========================= */
function goCreateContractForBox(box) {
  if (!box?.id) {
    toast("ID du box introuvable ❌", { type: "error", autoClose: 1400 })
    return
  }

  router.push(`/contracts/create?boxId=${box.id}`)
}

function goContractDetails(box) {
  if (!box?.currentContractId) {
    toast("Aucun contrat lié à ce box.", { type: "info", autoClose: 1200 })
    return
  }

  router.push(`/contracts/${box.currentContractId}`)
}

function goEditContract(box) {
  if (!box?.currentContractId) {
    toast("Aucun contrat lié à ce box.", { type: "info", autoClose: 1200 })
    return
  }

  router.push(`/contracts/${box.currentContractId}/edit`)
}

/* =========================
   Firestore actions
========================= */
async function createBox() {
  try {
    if (!form.value.code?.trim()) {
      toast("Code obligatoire ⚠️", { type: "warning", autoClose: 1200 })
      return
    }

    const code = form.value.code.trim()
    const exists = boxes.value.some((b) => norm(b.code) === norm(code))

    if (exists) {
      toast("Ce code existe déjà 😅", { type: "error", autoClose: 1300 })
      return
    }

    isSaving.value = true

    await addDoc(boxesCol, {
      code,
      siteId: "site-1",
      size: form.value.size,
      volumeM3: Number(form.value.volumeM3) || 0,
      priceMonthly: Number(form.value.priceMonthly) || 0,
      locationNote: form.value.locationNote?.trim() || "",
      status: form.value.status,
      currentContractId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    toast("Box ajouté ✅", { type: "success", autoClose: 1100 })
    showAddModal.value = false
    resetForm()
  } catch (e) {
    console.error(e)
    toast("Erreur création ❌", { type: "error" })
  } finally {
    isSaving.value = false
  }
}

async function bulkCreateBoxes() {
  try {
    const count = Math.min(200, Math.max(1, Number(bulk.value.count) || 1))
    const startN = Math.max(0, Number(bulk.value.startNumber) || 0)
    const pad = Math.min(6, Math.max(1, Number(bulk.value.pad) || 3))
    const prefix = String(bulk.value.prefix || "B-")

    isSaving.value = true

    const planned = []
    for (let i = 0; i < count; i++) {
      planned.push(formatCode(prefix, startN + i, pad))
    }

    const existing = new Set(boxes.value.map((b) => norm(b.code)))
    const duplicates = planned.filter((c) => existing.has(norm(c)))

    if (duplicates.length) {
      toast(
        `Codes déjà existants: ${duplicates.slice(0, 6).join(", ")}${
          duplicates.length > 6 ? "…" : ""
        }`,
        {
          type: "error",
          autoClose: 2200,
        }
      )
      return
    }

    for (let i = 0; i < count; i++) {
      const code = formatCode(prefix, startN + i, pad)

      await addDoc(boxesCol, {
        code,
        siteId: "site-1",
        size: bulk.value.size,
        volumeM3: Number(bulk.value.volumeM3) || 0,
        priceMonthly: Number(bulk.value.priceMonthly) || 0,
        locationNote: bulk.value.locationNote?.trim() || "",
        status: bulk.value.status,
        currentContractId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    toast(`${count} boxes créés ✅`, { type: "success", autoClose: 1200 })
    showBulkModal.value = false
  } catch (e) {
    console.error(e)
    toast("Erreur bulk ❌", { type: "error" })
  } finally {
    isSaving.value = false
  }
}

async function setStatus(box, status) {
  try {
    if (!box?.id) return

    await updateDoc(doc(db, "boxes", box.id), {
      status,
      updatedAt: serverTimestamp(),
    })

    if (selectedBox.value?.id === box.id) {
      selectedBox.value = { ...selectedBox.value, status }
    }

    toast("Statut mis à jour ✅", { type: "success", autoClose: 900 })
  } catch (e) {
    console.error(e)
    toast("Erreur statut ❌", { type: "error" })
  }
}

async function quickToggleMaintenance(box) {
  const cur = norm(box?.status)
  const next = cur === "maintenance" ? "available" : "maintenance"
  await setStatus(box, next)
}

/* =========================
   EDIT box
========================= */
function openEditModal() {
  if (!selectedBox.value) return

  editForm.value = {
    code: selectedBox.value.code || "",
    size: selectedBox.value.size || "S",
    volumeM3: Number(selectedBox.value.volumeM3 || 0),
    priceMonthly: Number(selectedBox.value.priceMonthly || 0),
    locationNote: selectedBox.value.locationNote || "",
    status: selectedBox.value.status || "available",
  }

  showEditModal.value = true
}

async function updateSelectedBox() {
  try {
    if (!selectedBox.value?.id) return

    const newCode = String(editForm.value.code || "").trim()

    if (!newCode) {
      toast("Code obligatoire ⚠️", { type: "warning", autoClose: 1200 })
      return
    }

    const dup = boxes.value.some(
      (b) => b.id !== selectedBox.value.id && norm(b.code) === norm(newCode)
    )

    if (dup) {
      toast("Ce code existe déjà 😅", { type: "error", autoClose: 1300 })
      return
    }

    isUpdating.value = true

    await updateDoc(doc(db, "boxes", selectedBox.value.id), {
      code: newCode,
      size: editForm.value.size,
      volumeM3: Number(editForm.value.volumeM3) || 0,
      priceMonthly: Number(editForm.value.priceMonthly) || 0,
      locationNote: String(editForm.value.locationNote || "").trim(),
      status: editForm.value.status,
      updatedAt: serverTimestamp(),
    })

    selectedBox.value = {
      ...selectedBox.value,
      code: newCode,
      size: editForm.value.size,
      volumeM3: Number(editForm.value.volumeM3) || 0,
      priceMonthly: Number(editForm.value.priceMonthly) || 0,
      locationNote: String(editForm.value.locationNote || "").trim(),
      status: editForm.value.status,
    }

    toast("Box modifié ✅", { type: "success", autoClose: 1100 })
    showEditModal.value = false
  } catch (e) {
    console.error(e)
    toast("Erreur modification ❌", { type: "error" })
  } finally {
    isUpdating.value = false
  }
}

/* =========================
   RELEASE box = clôturer contrat
========================= */
async function releaseSelectedBox() {
  try {
    const b = selectedBox.value

    if (!b?.currentContractId) {
      toast("Aucun contrat à clôturer.", { type: "info", autoClose: 1200 })
      return
    }

    const ok = await confirmToast(`Clôturer le contrat et libérer le box ${b.code} ?`)
    if (!ok) return

    await callFunction(CLOSE_CONTRACT_URL, {
      contractId: b.currentContractId,
      reason: "manual",
    })

    toast("Contrat clôturé + box libéré ✅", { type: "success", autoClose: 1200 })
  } catch (e) {
    console.error(e)
    toast(e.message || "Erreur libération ❌", {
      type: "error",
      autoClose: 1800,
    })
  }
}

/* =========================
   DELETE box safe (via function)
========================= */
async function deleteSelectedBox() {
  try {
    const b = selectedBox.value
    if (!b?.id) return

    const ok = await confirmToast(
      `Supprimer le box ${b.code} ?\n(refus si box loué/contrat actif)`
    )
    if (!ok) return

    await callFunction(DELETE_BOX_SAFE_URL, { boxId: b.id })
    toast("Box supprimé ✅", { type: "success", autoClose: 1100 })
    closeDrawer()
  } catch (e) {
    console.error(e)
    toast(e.message || "Erreur suppression ❌", {
      type: "error",
      autoClose: 1800,
    })
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50 text-slate-900">
    <div class="max-w-[1400px] mx-auto px-4 py-6 space-y-5">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">Boxes</h1>
          <p class="text-sm text-slate-600">
            Stock + location. Clique un box pour voir les actions.
          </p>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" @click="showAddModal = true">
            + Ajouter un box
          </button>
          <button class="btn btn-sm" @click="showBulkModal = true">Bulk create</button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Total</div>
          <div class="text-2xl font-extrabold">{{ kpis.all }}</div>
        </div>

        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Disponibles</div>
          <div class="text-2xl font-extrabold text-emerald-700">
            {{ kpis.available }}
          </div>
        </div>

        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Loués</div>
          <div class="text-2xl font-extrabold text-indigo-700">{{ kpis.rented }}</div>
        </div>

        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Réservés</div>
          <div class="text-2xl font-extrabold text-amber-700">
            {{ kpis.reserved }}
          </div>
        </div>

        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Maintenance</div>
          <div class="text-2xl font-extrabold text-slate-700">
            {{ kpis.maintenance }}
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-3">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div class="md:col-span-6">
            <input
              v-model="search"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Rechercher (code, emplacement, taille, client)…"
            />
          </div>

          <div class="md:col-span-3">
            <select
              v-model="statusFilter"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous statuts</option>
              <option value="available">Disponible</option>
              <option value="rented">Loué</option>
              <option value="reserved">Réservé</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div class="md:col-span-3">
            <select
              v-model="sizeFilter"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Toutes tailles</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
            </select>
          </div>
        </div>
      </div>

      <Depot3DPlan
        :boxes="filteredBoxes"
        :selected-box-id="selectedBox?.id || ''"
        @select="openDrawer"
      />

      <!-- Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <div
          v-for="b in filteredBoxes"
          :key="b.id"
          class="text-left rounded-2xl bg-white border border-slate-100 shadow-sm p-4 ring-1 transition hover:shadow-md cursor-pointer"
          :class="cardRingClasses(b.operationalStatus)"
          @click="openDrawer(b)"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-lg font-extrabold tracking-tight">{{ b.code }}</div>
              <div class="text-xs text-slate-600">
                Taille:
                <span class="font-semibold text-slate-800">{{ b.size || "—" }}</span>
                <span v-if="b.volumeM3"> • {{ b.volumeM3 }} m³</span>
              </div>
            </div>

            <span
              class="text-xs font-bold px-2 py-1 rounded-full border"
              :class="statusBadgeClasses(b.operationalStatus)"
            >
              {{ statusLabel(b.operationalStatus) }}
            </span>
          </div>

          <div class="mt-3 text-sm text-slate-900 font-bold">
            {{ money(b.priceMonthly) }} € / mois
          </div>

          <div class="mt-1 text-xs text-slate-500 truncate" :title="b.locationNote">
            {{ b.locationNote || "—" }}
          </div>

          <div class="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-2">
            <div class="text-[11px] text-slate-500">Contrat en cours</div>
            <div
              class="text-sm font-semibold text-slate-900 truncate"
              :title="b.currentClientName"
            >
              {{ b.currentContractId ? b.currentClientName : "Aucun" }}
            </div>
          </div>

          <div class="mt-3 flex gap-2 flex-wrap">
            <button class="btn btn-xs" type="button" @click.stop="quickToggleMaintenance(b)">
              {{ norm(b.status) === "maintenance" ? "Rendre dispo" : "Maintenance" }}
            </button>

            <button
              v-if="norm(b.status) === 'available'"
              class="btn btn-xs btn-primary"
              type="button"
              @click.stop="goCreateContractForBox(b)"
            >
              Créer contrat
            </button>

            <template v-else-if="['rented', 'reserved'].includes(norm(b.status)) && b.currentContractId">
              <button
                class="btn btn-xs btn-outline"
                type="button"
                @click.stop="goContractDetails(b)"
              >
                Voir contrat
              </button>

              <button
                class="btn btn-xs btn-outline"
                type="button"
                @click.stop="goEditContract(b)"
              >
                Modifier contrat
              </button>
            </template>
          </div>
        </div>

        <div
          v-if="filteredBoxes.length === 0"
          class="col-span-full rounded-2xl bg-white border border-slate-100 shadow-sm p-6 text-center text-slate-600"
        >
          Aucun box trouvé.
        </div>
      </div>
    </div>

    <!-- Drawer -->
    <div v-if="drawerOpen" class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/40" @click="closeDrawer"></div>

      <div
        class="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-slate-200 p-5 overflow-y-auto"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xl font-extrabold">{{ selectedBox?.code }}</div>
            <div class="text-sm text-slate-600">
              Taille:
              <span class="font-semibold text-slate-900">{{ selectedBox?.size || "—" }}</span>
              <span v-if="selectedBox?.volumeM3"> • {{ selectedBox?.volumeM3 }} m³</span>
            </div>
          </div>

          <button class="btn btn-sm" @click="closeDrawer">Fermer</button>
        </div>

        <div class="mt-4 flex items-center gap-2">
          <span
            class="text-xs font-bold px-2 py-1 rounded-full border"
            :class="statusBadgeClasses(selectedBox?.operationalStatus || selectedBox?.status)"
          >
            {{ statusLabel(selectedBox?.operationalStatus || selectedBox?.status) }}
          </span>

          <div class="text-sm font-bold text-slate-900">
            {{ money(selectedBox?.priceMonthly) }} € / mois
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-slate-200 p-3">
          <div class="text-xs text-slate-500">Client du contrat en cours</div>
          <div class="text-sm font-semibold text-slate-900">
            {{ selectedBox?.currentClientName || "Aucun" }}
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            v-if="norm(selectedBox?.status) === 'available'"
            class="btn btn-primary"
            @click="goCreateContractForBox(selectedBox)"
          >
            Créer un contrat
          </button>

          <template
            v-else-if="['rented', 'reserved'].includes(norm(selectedBox?.status)) && selectedBox?.currentContractId"
          >
            <button class="btn" @click="goContractDetails(selectedBox)">
              Voir le contrat
            </button>

            <button class="btn btn-outline" @click="goEditContract(selectedBox)">
              Modifier contrat
            </button>
          </template>

          <button class="btn btn-outline" @click="openEditModal">Modifier box</button>

          <button
            v-if="selectedBox?.currentContractId"
            class="btn btn-outline"
            @click="releaseSelectedBox"
          >
            Libérer (clôturer contrat)
          </button>

          <button class="btn btn-error" @click="deleteSelectedBox">Supprimer</button>
        </div>

        <div class="mt-4 space-y-3">
          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Contrat en cours</div>
            <div class="text-sm font-semibold text-slate-900">
              {{ selectedBox?.currentClientName || "Aucun" }}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              {{ selectedBox?.currentContractId || "Aucun contrat lié" }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Edit -->
    <dialog class="modal" :open="showEditModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-extrabold text-lg text-slate-900">Modifier le box</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showEditModal = false">
            ✕
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="text-sm font-medium text-slate-800">Code *</label>
            <input
              v-model="editForm.code"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Taille</label>
              <select
                v-model="editForm.size"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Statut</label>
              <select
                v-model="editForm.status"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Réservé</option>
                <option value="rented">Loué</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Superficie (m³)</label>
              <input
                v-model.number="editForm.volumeM3"
                type="number"
                min="0"
                step="0.1"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Prix / mois (€)</label>
              <input
                v-model.number="editForm.priceMonthly"
                type="number"
                min="0"
                step="1"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Emplacement</label>
            <input
              v-model="editForm.locationNote"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>

          <div class="pt-2 flex justify-end gap-2">
            <button class="btn" :disabled="isUpdating" @click="showEditModal = false">
              Annuler
            </button>
            <button class="btn btn-primary" :disabled="isUpdating" @click="updateSelectedBox">
              {{ isUpdating ? "Modification..." : "Enregistrer" }}
            </button>
          </div>
        </div>
      </div>
    </dialog>

    <!-- Modal Add -->
    <dialog class="modal" :open="showAddModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-extrabold text-lg text-slate-900">Ajouter un box</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showAddModal = false">
            ✕
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="text-sm font-medium text-slate-800">Code *</label>
            <input
              v-model="form.code"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: B-001"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Taille</label>
              <select
                v-model="form.size"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Statut</label>
              <select
                v-model="form.status"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Réservé</option>
                <option value="rented">Loué</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Superficie</label>
              <input
                v-model.number="form.volumeM3"
                type="number"
                min="0"
                step="0.1"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Prix / mois (€)</label>
              <input
                v-model.number="form.priceMonthly"
                type="number"
                min="0"
                step="1"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Emplacement</label>
            <input
              v-model="form.locationNote"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Allée 2 — Rangée B"
            />
          </div>

          <div class="pt-2 flex justify-end gap-2">
            <button class="btn" :disabled="isSaving" @click="showAddModal = false">
              Annuler
            </button>
            <button class="btn btn-primary" :disabled="isSaving" @click="createBox">
              {{ isSaving ? "Enregistrement..." : "Créer" }}
            </button>
          </div>
        </div>
      </div>
    </dialog>

    <!-- Modal Bulk -->
    <dialog class="modal" :open="showBulkModal">
      <div class="modal-box bg-white">
        <div class="flex items-center justify-between">
          <h3 class="font-extrabold text-lg text-slate-900">Bulk create</h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showBulkModal = false">
            ✕
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Préfixe</label>
              <input
                v-model="bulk.prefix"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="B-"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Zéros (pad)</label>
              <input
                v-model.number="bulk.pad"
                type="number"
                min="1"
                max="6"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Numéro départ</label>
              <input
                v-model.number="bulk.startNumber"
                type="number"
                min="0"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Quantité (max 200)</label>
              <input
                v-model.number="bulk.count"
                type="number"
                min="1"
                max="200"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Taille</label>
              <select
                v-model="bulk.size"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Statut</label>
              <select
                v-model="bulk.status"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Réservé</option>
                <option value="rented">Loué</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-sm font-medium text-slate-800">Volume (m³)</label>
              <input
                v-model.number="bulk.volumeM3"
                type="number"
                min="0"
                step="0.1"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Prix / mois (€)</label>
              <input
                v-model.number="bulk.priceMonthly"
                type="number"
                min="0"
                step="1"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Emplacement (optionnel)</label>
            <input
              v-model="bulk.locationNote"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Allée 2 — Rangée B"
            />
          </div>

          <div class="text-xs text-slate-600">
            Exemple généré:
            <span class="font-semibold text-slate-900">
              {{ formatCode(bulk.prefix, bulk.startNumber, bulk.pad) }}
            </span>
          </div>

          <div class="pt-2 flex justify-end gap-2">
            <button class="btn" :disabled="isSaving" @click="showBulkModal = false">
              Annuler
            </button>
            <button class="btn btn-primary" :disabled="isSaving" @click="bulkCreateBoxes">
              {{ isSaving ? "Création..." : "Créer" }}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
/* Full Tailwind only. */
</style>
