<!-- src/views/boxes/InvoicesListView.vue -->
<script setup>
import { computed, ref } from "vue"
import { useRoute } from "vue-router"
import { useCollection, useFirestore } from "vuefire"
import { collection, query, orderBy, updateDoc, doc as fsDoc, serverTimestamp } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { generateInvoicePdf } from "../../utils/invoicePdf"
import {
  norm,
  splitTTC,
  safeISO,
  todayISO,
  buildInvoiceNumber,
  updateInvoiceManually,
  deleteInvoiceSafely,
} from "../../utils/billingSync"

const route = useRoute()
const db = useFirestore()
const auth = getAuth()

const FUNCTIONS_BASE_URL = "https://us-central1-aarontravelgestion.cloudfunctions.net"

/* =========================
  Firestore
========================= */
const invoicesCol = collection(db, "invoices")
const invoicesSnap = useCollection(query(invoicesCol, orderBy("createdAt", "desc")))

/* =========================
  UI State
========================= */
const search = ref("")
const statusFilter = ref("all")
const monthFilter = ref("all")
const showDrawer = ref(false)
const selected = ref(null)

const showEditModal = ref(false)
const savingEdit = ref(false)
const sendingSmsId = ref(null)
const sendingReminderId = ref(null)

const editForm = ref({
  number: "",
  issueDate: "",
  dueDate: "",
  companyName: "",
  representativeName: "",
  address: "",
  email: "",
  phone: "",
  totalTTC: 0,
  paid: 0,
  vatRate: 0,
})

const contractFilter = computed(() => String(route.query.contractId || "").trim())

/* =========================
  Helpers
========================= */
function yyyymmFromAny(dateAny) {
  const iso = safeISO(dateAny)
  return iso ? iso.slice(0, 7) : ""
}

function fmtMoney(n) {
  const v = Number(n || 0)
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function dueLeft(inv) {
  const due = Number(inv?.totals?.due ?? 0)
  return Math.max(0, due)
}

function isLate(inv) {
  const dueDate = safeISO(inv?.dueDate)
  if (!dueDate) return false
  if (dueLeft(inv) <= 0) return false
  return dueDate < todayISO()
}

function statusLabel(st) {
  const v = norm(st).toLowerCase()
  if (v === "paid") return "Payée"
  if (v === "partial") return "Partielle"
  if (v === "unpaid") return "Impayée"
  return st || "—"
}

function statusBadge(st, late = false) {
  const v = norm(st).toLowerCase()
  if (late) return "bg-red-100 text-red-800 border-red-200"
  if (v === "paid") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (v === "partial") return "bg-amber-100 text-amber-800 border-amber-200"
  if (v === "unpaid") return "bg-slate-100 text-slate-800 border-slate-200"
  return "bg-slate-100 text-slate-800 border-slate-200"
}

function totalTTCValue(inv) {
  return Number(inv?.totals?.ttc ?? inv?.totals?.totalTTC ?? 0)
}

function totalPaidValue(inv) {
  return Number(inv?.totals?.paid ?? 0)
}

function totalHTValue(inv) {
  if (inv?.totals?.ht != null) return Number(inv.totals.ht)
  return splitTTC(
    totalTTCValue(inv),
    Number(inv?.totals?.vatRate ?? inv?.tvaRate ?? inv?.vatRate ?? 0)
  ).ht
}

function totalTVAValue(inv) {
  if (inv?.totals?.tva != null) return Number(inv.totals.tva)
  return splitTTC(
    totalTTCValue(inv),
    Number(inv?.totals?.vatRate ?? inv?.tvaRate ?? inv?.vatRate ?? 0)
  ).tva
}

function invoiceNumberValue(inv) {
  return (
    inv?.number ||
    buildInvoiceNumber({
      boxName: inv?.boxName,
      boxCode: inv?.boxCode,
      boxId: inv?.boxId,
      contractId: inv?.contractId,
      period: inv?.period,
    })
  )
}

function buildInvoiceFileName(inv) {
  return `${invoiceNumberValue(inv)}.pdf`
}

function openDrawer(inv) {
  selected.value = inv
  showDrawer.value = true
}

function closeDrawer() {
  showDrawer.value = false
  selected.value = null
}

function openEditModal(inv) {
  editForm.value = {
    number: String(inv?.number || invoiceNumberValue(inv)),
    issueDate: safeISO(inv?.issueDate) || todayISO(),
    dueDate: safeISO(inv?.dueDate) || "",
    companyName: String(inv?.client?.companyName || ""),
    representativeName: String(inv?.client?.representativeName || ""),
    address: String(inv?.client?.address || ""),
    email: String(inv?.client?.email || ""),
    phone: String(inv?.client?.phone || ""),
    totalTTC: Number(inv?.totals?.ttc ?? inv?.totals?.totalTTC ?? 0),
    paid: Number(inv?.totals?.paid ?? 0),
    vatRate: Number(inv?.totals?.vatRate ?? inv?.tvaRate ?? inv?.vatRate ?? 0),
  }
  selected.value = inv
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
}

/* =========================
  Computeds
========================= */
const invoices = computed(() => invoicesSnap.value || [])

const monthOptions = computed(() => {
  const set = new Set()
  for (const i of invoices.value) {
    const m = i.period || yyyymmFromAny(i.issueDate) || yyyymmFromAny(i.createdAt)
    if (m) set.add(m)
  }
  return ["all", ...Array.from(set).sort().reverse()]
})

const filteredInvoices = computed(() => {
  const s = norm(search.value).toLowerCase()
  const st = statusFilter.value
  const mo = monthFilter.value
  const cId = contractFilter.value

  return invoices.value.filter((inv) => {
    if (cId && String(inv.contractId || "").trim() !== cId) return false

    const text = [
      inv.number,
      inv.contractId,
      inv.period,
      inv.boxCode,
      inv.boxName,
      inv.boxId,
      inv.client?.clientNumber,
      inv.client?.companyName,
      inv.client?.representativeName,
      inv.client?.email,
      inv.client?.phone,
      safeISO(inv.issueDate),
    ]
      .map((x) => String(x || ""))
      .join(" ")
      .toLowerCase()

    const matchSearch = !s || text.includes(s)
    const matchStatus = st === "all" ? true : norm(inv.status).toLowerCase() === st

    const invMonth = inv.period || yyyymmFromAny(inv.issueDate)
    const matchMonth = mo === "all" ? true : invMonth === mo

    return matchSearch && matchStatus && matchMonth
  })
})

const kpis = computed(() => {
  const all = filteredInvoices.value.length
  const paid = filteredInvoices.value.filter((i) => norm(i.status).toLowerCase() === "paid").length
  const unpaid = filteredInvoices.value.filter((i) => norm(i.status).toLowerCase() === "unpaid").length
  const partial = filteredInvoices.value.filter((i) => norm(i.status).toLowerCase() === "partial").length
  const late = filteredInvoices.value.filter((i) => isLate(i)).length
  const totalDue = filteredInvoices.value.reduce((acc, i) => acc + dueLeft(i), 0)
  return { all, paid, unpaid, partial, late, totalDue }
})

/* =========================
  Actions
========================= */
function openPdf(inv) {
  if (!inv?.pdfUrl) {
    toast("Pas de PDF enregistré. Génère-le d’abord.", { type: "warning", autoClose: 1400 })
    return
  }
  window.open(inv.pdfUrl, "_blank", "noopener,noreferrer")
}

function generateInvoicePDF(inv) {
  if (!inv) return

  const vatRate = Number(inv?.totals?.vatRate ?? inv?.tvaRate ?? inv?.vatRate ?? 0)
  const totalTTC = totalTTCValue(inv)
  const totalPaid = totalPaidValue(inv)
  const totalDue = Number(inv?.totals?.due ?? Math.max(0, totalTTC - totalPaid))
  const split = splitTTC(totalTTC, vatRate)

  const invoiceNumber = invoiceNumberValue(inv)
  const issueDateISO = safeISO(inv?.issueDate) || todayISO()
  const paidAtISO = safeISO(inv?.paidAt) || issueDateISO

  generateInvoicePdf(
    {
      invoiceNumber,
      invoiceDateISO: issueDateISO,
      paidAt: paidAtISO,
      vatRate,
      provider: {
        title: "CGL/ Aaron travel",
        contactName: "Boubakar CAMARA",
        tva: "FR61828534214",
        siret: "82853421400014",
        addressLines: [
          "15 rue des écoles, 95500 Le Thillay",
          "11 rue des velettes, 92150 Suresnes",
        ],
        phone: "+33 6 03 67 50 62",
        website: "http://www.aaron-travel.com",
        email: "aarontravel@outlook.fr",
      },
      billTo: {
        name:
          inv?.client?.companyName ||
          inv?.client?.representativeName ||
          inv?.client?.displayName ||
          "Client",
        representativeName: inv?.client?.representativeName || "",
        address: inv?.client?.address || "",
        email: inv?.client?.email || "",
        phone: inv?.client?.phone || "",
      },
      items: [
        {
          label: `Mise a disposition Box ${inv?.boxName || inv?.boxCode || "BOX"}\n${inv?.period || yyyymmFromAny(inv?.issueDate) || ""}`,
          unitPriceTTC: split.ttc,
          qty: 1,
          amountTTC: split.ttc,
        },
      ],
      totals: {
        totalHT: split.ht,
        tva: split.tva,
        totalTTC: split.ttc,
        paid: totalPaid,
        balanceDue: totalDue,
        vatRate,
      },
      paymentInfo: {
        primary: { title: "PAYPAL", value: "aarontravel@outlook.fr" },
        iban: "FR4620041010125200472C03349",
        bic: "PSSTFRPPSCE",
        chequeTo: "AARON TRAVEL",
        other: "Règlement par PayLib : 06.03.67.50.62",
      },
      fileName: buildInvoiceFileName(inv),
    },
    { download: true }
  )
}

function buildInvoiceMessage(inv) {
  const num = invoiceNumberValue(inv)
  const box = inv.boxName || inv.boxCode || "—"
  const period = inv.period || yyyymmFromAny(inv.issueDate) || "—"
  const due = fmtMoney(dueLeft(inv))
  const url = inv.pdfUrl || "(PDF à générer)"
  const client = inv.client?.companyName || inv.client?.representativeName || inv.client?.displayName || "Client"
  return `AARON TRAVEL — Facture ${num}\nClient: ${client}\nBox: ${box}\nPériode: ${period}\nSolde dû: ${due} €\n${url}`
}

function sendByEmail(inv) {
  const to = inv.client?.email || ""
  const subject = encodeURIComponent(`AARON TRAVEL - Facture ${invoiceNumberValue(inv)}`)
  const body = encodeURIComponent(buildInvoiceMessage(inv))
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
}

function sendBySMS(inv) {
  const phone = String(inv.client?.phone || "").replace(/\s+/g, "")
  const body = encodeURIComponent(buildInvoiceMessage(inv))
  window.location.href = `sms:${phone}?&body=${body}`
}

function sendByWhatsApp(inv) {
  const phone = String(inv.client?.phone || "").replace(/[^\d]/g, "")
  const text = encodeURIComponent(buildInvoiceMessage(inv))
  window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer")
}

async function getIdTokenOrThrow() {
  const user = auth.currentUser
  if (!user) throw new Error("Utilisateur non connecté")
  return user.getIdToken()
}

async function sendInvoiceSmsViaFunction(inv) {
  try {
    sendingSmsId.value = inv.id

    const token = await getIdTokenOrThrow()
    const res = await fetch(`${FUNCTIONS_BASE_URL}/sendInvoiceBySMS`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invoiceId: inv.id }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erreur envoi SMS")
    }

    toast("Facture envoyée par SMS ✅", { type: "success", autoClose: 1200 })
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur envoi SMS ❌", { type: "error" })
  } finally {
    sendingSmsId.value = null
  }
}

async function sendInvoiceReminderViaFunction(inv) {
  try {
    sendingReminderId.value = inv.id

    const token = await getIdTokenOrThrow()
    const res = await fetch(`${FUNCTIONS_BASE_URL}/sendInvoiceReminderSMS`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invoiceId: inv.id }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erreur rappel SMS")
    }

    toast("Rappel envoyé par SMS ✅", { type: "success", autoClose: 1200 })
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur rappel SMS ❌", { type: "error" })
  } finally {
    sendingReminderId.value = null
  }
}

async function markReminderSent(inv) {
  try {
    if (!inv?.id) return
    await updateDoc(fsDoc(db, "invoices", inv.id), {
      lastReminderAt: serverTimestamp(),
      reminderCount: Number(inv.reminderCount || 0) + 1,
      updatedAt: serverTimestamp(),
    })
    toast("Rappel noté ✅", { type: "success", autoClose: 1000 })
  } catch (e) {
    console.error(e)
    toast("Erreur rappel ❌", { type: "error" })
  }
}

async function saveInvoiceEdit() {
  try {
    if (!selected.value?.id) return

    const ttc = Number(editForm.value.totalTTC || 0)
    const paid = Number(editForm.value.paid || 0)
    const vatRate = Number(editForm.value.vatRate || 0)

    if (ttc <= 0) {
      toast("Montant TTC obligatoire ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    savingEdit.value = true

    const split = splitTTC(ttc, vatRate)

    await updateInvoiceManually(db, {
      invoiceId: selected.value.id,
      currentInvoice: selected.value,
      patch: {
        number: String(editForm.value.number || "").trim(),
        issueDate: editForm.value.issueDate || todayISO(),
        dueDate: editForm.value.dueDate || "",
        client: {
          ...(selected.value.client || {}),
          companyName: String(editForm.value.companyName || "").trim(),
          representativeName: String(editForm.value.representativeName || "").trim(),
          address: String(editForm.value.address || "").trim(),
          email: String(editForm.value.email || "").trim(),
          phone: String(editForm.value.phone || "").trim(),
          displayName:
            String(editForm.value.companyName || "").trim() ||
            String(editForm.value.representativeName || "").trim() ||
            "Client",
        },
        totals: {
          ht: split.ht,
          tva: split.tva,
          ttc,
          paid,
          vatRate,
        },
      },
    })

    toast("Facture modifiée ✅", { type: "success", autoClose: 1200 })
    closeEditModal()
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur modification facture ❌", { type: "error" })
  } finally {
    savingEdit.value = false
  }
}

async function removeInvoice(inv) {
  try {
    if (!inv?.id) return
    const ok = window.confirm(
      `Supprimer la facture ${inv?.number || ""} ?\nLa suppression sera refusée si des paiements sont liés.`
    )
    if (!ok) return

    await deleteInvoiceSafely(db, { invoiceId: inv.id })

    if (selected.value?.id === inv.id) {
      closeDrawer()
    }

    toast("Facture supprimée ✅", { type: "success", autoClose: 1200 })
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur suppression facture ❌", { type: "error" })
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50 text-slate-900">
    <div class="max-w-[1400px] mx-auto px-4 py-6 space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">Factures</h1>
          <p class="text-sm text-slate-600">
            Suivi paiements + relances
            <span v-if="contractFilter" class="font-semibold">
              — Contrat: {{ contractFilter }}
            </span>
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Total</div>
          <div class="text-2xl font-extrabold">{{ kpis.all }}</div>
        </div>
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Payées</div>
          <div class="text-2xl font-extrabold text-emerald-700">{{ kpis.paid }}</div>
        </div>
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Partielles</div>
          <div class="text-2xl font-extrabold text-amber-700">{{ kpis.partial }}</div>
        </div>
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Impayées</div>
          <div class="text-2xl font-extrabold text-slate-700">{{ kpis.unpaid }}</div>
        </div>
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">En retard</div>
          <div class="text-2xl font-extrabold text-red-700">{{ kpis.late }}</div>
        </div>
        <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div class="text-xs text-slate-500">Total dû</div>
          <div class="text-2xl font-extrabold">{{ fmtMoney(kpis.totalDue) }} €</div>
        </div>
      </div>

      <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-3">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div class="md:col-span-6">
            <input
              v-model="search"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Rechercher (facture, client, box, tel, email, contrat)…"
            />
          </div>

          <div class="md:col-span-3">
            <select
              v-model="monthFilter"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option v-for="m in monthOptions" :key="m" :value="m">
                {{ m === 'all' ? 'Tous les mois' : m }}
              </option>
            </select>
          </div>

          <div class="md:col-span-3">
            <select
              v-model="statusFilter"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous statuts</option>
              <option value="paid">Payée</option>
              <option value="partial">Partielle</option>
              <option value="unpaid">Impayée</option>
            </select>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <button
          v-for="inv in filteredInvoices"
          :key="inv.id"
          type="button"
          class="text-left rounded-2xl bg-white border border-slate-100 shadow-sm p-4 ring-1 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          @click="openDrawer(inv)"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-lg font-extrabold tracking-tight">
                Facture #{{ invoiceNumberValue(inv) }}
              </div>
              <div class="text-xs text-slate-600 mt-0.5">
                Contrat: <span class="font-semibold text-slate-900">{{ inv.contractId || '—' }}</span>
              </div>
              <div class="text-xs text-slate-600 mt-0.5">
                Box: <span class="font-semibold text-slate-900">{{ inv.boxName || inv.boxCode || '—' }}</span>
                <span class="mx-1">•</span>
                Période: <span class="font-semibold text-slate-900">{{ inv.period || '—' }}</span>
              </div>
              <div class="text-xs text-slate-500 mt-1 truncate max-w-[32rem]">
                Client: {{ inv.client?.companyName || inv.client?.representativeName || inv.client?.displayName || '—' }}
              </div>
            </div>

            <div class="flex flex-col items-end gap-2">
              <span
                class="text-xs font-bold px-2 py-1 rounded-full border"
                :class="statusBadge(inv.status, isLate(inv))"
              >
                {{ isLate(inv) ? 'En retard' : statusLabel(inv.status) }}
              </span>

              <div class="text-sm font-extrabold">
                {{ fmtMoney(totalTTCValue(inv)) }} €
              </div>

              <div v-if="dueLeft(inv) > 0" class="text-xs text-slate-600">
                Reste:
                <span class="font-bold text-red-700">{{ fmtMoney(dueLeft(inv)) }} €</span>
              </div>
              <div v-else class="text-xs text-emerald-700 font-bold">Soldée</div>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button class="btn btn-xs btn-outline" type="button" @click.stop="generateInvoicePDF(inv)">
              Générer PDF
            </button>
            <button class="btn btn-xs" type="button" @click.stop="openPdf(inv)">
              Ouvrir PDF
            </button>
            <button class="btn btn-xs btn-primary" type="button" @click.stop="sendByEmail(inv)">
              Envoyer (email)
            </button>
            <button
              class="btn btn-xs btn-outline"
              type="button"
              :disabled="sendingSmsId === inv.id"
              @click.stop="sendInvoiceSmsViaFunction(inv)"
            >
              {{ sendingSmsId === inv.id ? "Envoi..." : "SMS facture" }}
            </button>
            <button
              class="btn btn-xs btn-outline"
              type="button"
              :disabled="sendingReminderId === inv.id || dueLeft(inv) <= 0"
              @click.stop="sendInvoiceReminderViaFunction(inv)"
            >
              {{ sendingReminderId === inv.id ? "Envoi..." : "Rappel SMS" }}
            </button>
            <button class="btn btn-xs btn-outline" type="button" @click.stop="openEditModal(inv)">
              Modifier
            </button>
            <button class="btn btn-xs btn-error" type="button" @click.stop="removeInvoice(inv)">
              Supprimer
            </button>
          </div>
        </button>

        <div
          v-if="filteredInvoices.length === 0"
          class="col-span-full rounded-2xl bg-white border border-slate-100 shadow-sm p-6 text-center text-slate-600"
        >
          Aucune facture.
        </div>
      </div>
    </div>

    <div v-if="showDrawer" class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/40" @click="closeDrawer"></div>

      <div class="absolute right-0 top-0 h-full w-full sm:w-[540px] bg-white shadow-2xl border-l border-slate-200 p-5 overflow-y-auto">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xl font-extrabold">
              Facture #{{ invoiceNumberValue(selected) }}
            </div>
            <div class="text-sm text-slate-600 mt-1">
              Contrat: <span class="font-semibold text-slate-900">{{ selected?.contractId || '—' }}</span>
            </div>
            <div class="text-sm text-slate-600">
              Box: <span class="font-semibold text-slate-900">{{ selected?.boxName || selected?.boxCode || '—' }}</span>
              <span class="mx-1">•</span>
              Période: <span class="font-semibold text-slate-900">{{ selected?.period || '—' }}</span>
            </div>
          </div>

          <button class="btn btn-sm" @click="closeDrawer">Fermer</button>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold px-2 py-1 rounded-full border" :class="statusBadge(selected?.status, isLate(selected))">
            {{ isLate(selected) ? 'En retard' : statusLabel(selected?.status) }}
          </span>

          <div class="text-sm font-bold text-slate-900">
            Total: {{ fmtMoney(totalTTCValue(selected)) }} €
          </div>

          <div class="text-sm text-slate-600">
            Payé: {{ fmtMoney(totalPaidValue(selected)) }} €
          </div>

          <div v-if="dueLeft(selected) > 0" class="text-sm font-extrabold text-red-700">
            Reste: {{ fmtMoney(dueLeft(selected)) }} €
          </div>
        </div>

        <div class="mt-4 space-y-3">
          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Client</div>
            <div class="text-sm font-semibold text-slate-900">
              {{ selected?.client?.companyName || selected?.client?.representativeName || selected?.client?.displayName || '—' }}
            </div>
            <div class="text-xs text-slate-600 mt-1">
              {{ selected?.client?.address || '—' }}
            </div>
            <div class="text-xs text-slate-600 mt-1">
              {{ selected?.client?.email || '—' }} • {{ selected?.client?.phone || '—' }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Montants</div>
            <div class="text-sm text-slate-900">
              HT: <span class="font-semibold">{{ fmtMoney(totalHTValue(selected)) }} €</span>
            </div>
            <div class="text-sm text-slate-900">
              TVA: <span class="font-semibold">{{ fmtMoney(totalTVAValue(selected)) }} €</span>
            </div>
            <div class="text-sm text-slate-900">
              TTC: <span class="font-semibold">{{ fmtMoney(totalTTCValue(selected)) }} €</span>
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Taux TVA: {{ Number(selected?.totals?.vatRate ?? selected?.tvaRate ?? selected?.vatRate ?? 0) }} %
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Dates</div>
            <div class="text-sm text-slate-900">
              Émise le: <span class="font-semibold">{{ safeISO(selected?.issueDate) || '—' }}</span>
            </div>
            <div class="text-sm text-slate-900">
              Échéance: <span class="font-semibold">{{ safeISO(selected?.dueDate) || '—' }}</span>
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Relances: {{ selected?.reminderCount || 0 }}
              • Dernière: {{ selected?.lastReminderAt?.toDate?.()?.toLocaleDateString?.('fr-FR') || '—' }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500 mb-2">Actions</div>
            <div class="flex flex-wrap gap-2">
              <button class="btn btn-sm btn-outline" @click="generateInvoicePDF(selected)">Générer PDF</button>
              <button class="btn btn-sm" @click="openPdf(selected)">Ouvrir PDF</button>
              <button class="btn btn-sm btn-primary" @click="sendByEmail(selected)">Envoyer email</button>
              <button class="btn btn-sm btn-outline" @click="sendBySMS(selected)">Envoyer SMS tel</button>
              <button class="btn btn-sm btn-outline" @click="sendByWhatsApp(selected)">WhatsApp</button>
              <button
                class="btn btn-sm btn-outline"
                :disabled="sendingSmsId === selected?.id"
                @click="sendInvoiceSmsViaFunction(selected)"
              >
                {{ sendingSmsId === selected?.id ? "Envoi..." : "SMS facture" }}
              </button>
              <button
                class="btn btn-sm btn-outline"
                :disabled="sendingReminderId === selected?.id || dueLeft(selected) <= 0"
                @click="sendInvoiceReminderViaFunction(selected)"
              >
                {{ sendingReminderId === selected?.id ? "Envoi..." : "Rappel SMS" }}
              </button>
              <button class="btn btn-sm btn-outline" @click="openEditModal(selected)">Modifier</button>
              <button class="btn btn-sm btn-error" @click="removeInvoice(selected)">Supprimer</button>
              <button class="btn btn-sm btn-outline" @click="markReminderSent(selected)">
                Rappel échéance (log)
              </button>
            </div>

            <div class="text-xs text-slate-500 mt-2">
              “Rappel échéance (log)” met juste à jour Firestore. Les boutons “SMS facture” et “Rappel SMS” appellent les Cloud Functions.
            </div>
          </div>
        </div>
      </div>
    </div>

    <dialog class="modal" :open="showEditModal">
      <div class="modal-box bg-white w-[95vw] max-w-xl">
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-extrabold text-lg text-slate-900">Modifier la facture</h3>
          <button class="btn btn-sm btn-circle btn-ghost shrink-0" @click="closeEditModal">✕</button>
        </div>

        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label class="text-sm font-medium text-slate-800">Numéro</label>
            <input
              v-model="editForm.number"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Date émission</label>
            <input
              v-model="editForm.issueDate"
              type="date"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Date échéance</label>
            <input
              v-model="editForm.dueDate"
              type="date"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Société</label>
            <input
              v-model="editForm.companyName"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Représentant</label>
            <input
              v-model="editForm.representativeName"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div class="sm:col-span-2">
            <label class="text-sm font-medium text-slate-800">Adresse</label>
            <input
              v-model="editForm.address"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Email</label>
            <input
              v-model="editForm.email"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Téléphone</label>
            <input
              v-model="editForm.phone"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Montant TTC (€)</label>
            <input
              v-model.number="editForm.totalTTC"
              type="number"
              min="0"
              step="0.01"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">Montant payé (€)</label>
            <input
              v-model.number="editForm.paid"
              type="number"
              min="0"
              step="0.01"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-slate-800">TVA (%)</label>
            <input
              v-model.number="editForm.vatRate"
              type="number"
              min="0"
              step="0.01"
              class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div class="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button class="btn w-full sm:w-auto" :disabled="savingEdit" @click="closeEditModal">
            Annuler
          </button>
          <button class="btn btn-primary w-full sm:w-auto" :disabled="savingEdit" @click="saveInvoiceEdit">
            {{ savingEdit ? "Enregistrement..." : "Mettre à jour" }}
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
/* Tailwind only */
</style>