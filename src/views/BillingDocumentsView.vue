<script setup>
import { computed, ref } from "vue"
import { addDoc, collection, deleteDoc, doc, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore"
import { useCollection } from "vuefire"
import { toast } from "vue3-toastify"
import { db } from "../components/firebaseConfig"
import { generateInvoicePdf } from "../utils/invoicePdf"
import { useAuthStore } from "../stores/useAuthStore"

const documentsCol = collection(db, "billingDocuments")
const documentsSnap = useCollection(query(documentsCol, orderBy("createdAt", "desc")))
const authStore = useAuthStore()

const todayISO = () => new Date().toISOString().slice(0, 10)
const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0))

const form = ref({
  type: "FACTURE",
  number: "",
  issueDate: todayISO(),
  dueDate: "",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  clientAddress: "",
  vatRate: 20,
  discountType: "amount",
  discountValue: 0,
  paid: 0,
  notes: "",
})

const items = ref([{ label: "", qty: 1, unitPriceTTC: 0 }])
const saving = ref(false)
const historySearch = ref("")
const historyType = ref("")
const historyStatus = ref("")
const historyDateFrom = ref("")
const historyDateTo = ref("")

const documents = computed(() => documentsSnap.value || [])

const subtotalTTC = computed(() =>
  items.value.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPriceTTC || 0), 0)
)

const discountTTC = computed(() => {
  const value = Math.max(0, Number(form.value.discountValue || 0))
  if (form.value.discountType === "percent") {
    return Math.min(subtotalTTC.value, subtotalTTC.value * value / 100)
  }
  return Math.min(subtotalTTC.value, value)
})

const totalTTC = computed(() => Math.max(0, subtotalTTC.value - discountTTC.value))

const due = computed(() => Math.max(0, totalTTC.value - Number(form.value.paid || 0)))

const documentStats = computed(() => {
  const invoices = documents.value.filter((item) => item.type === "FACTURE")
  const quotes = documents.value.filter((item) => item.type === "DEVIS")
  const unpaid = documents.value.filter((item) => getDocumentStatus(item) !== "paid")
  const totalDue = documents.value.reduce((sum, item) => sum + getDocumentDue(item), 0)

  return {
    invoices: invoices.length,
    quotes: quotes.length,
    unpaid: unpaid.length,
    totalDue,
  }
})

const filteredDocuments = computed(() => {
  const search = normalizeText(historySearch.value)
  const from = historyDateFrom.value ? new Date(historyDateFrom.value).getTime() : null
  const to = historyDateTo.value ? new Date(`${historyDateTo.value}T23:59:59`).getTime() : null

  return documents.value.filter((item) => {
    const itemDate = getDocumentDate(item)
    const haystack = normalizeText([
      item.type,
      item.number,
      item.invoiceNumber,
      item.billTo?.name,
      item.billTo?.phone,
      item.billTo?.email,
      item.status,
    ].filter(Boolean).join(" "))

    return (
      (!search || haystack.includes(search)) &&
      (!historyType.value || item.type === historyType.value) &&
      (!historyStatus.value || getDocumentStatus(item) === historyStatus.value) &&
      (!from || itemDate.getTime() >= from) &&
      (!to || itemDate.getTime() <= to)
    )
  })
})

function generatedNumber(type = form.value.type) {
  const prefix = type === "DEVIS" ? "DEV" : "FAC"
  const now = new Date()
  const date = now.toISOString().slice(2, 10).replaceAll("-", "")
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0")
  return `${prefix}-${date}-${rand}`
}

async function generateUniqueDocumentNumber(type = form.value.type) {
  const normalizedType = type === "DEVIS" ? "DEVIS" : "FACTURE"
  const prefix = normalizedType === "DEVIS" ? "DEV" : "FAC"
  const year = new Date().getFullYear()
  const field = `${normalizedType}_${year}`
  const counterRef = doc(db, "counters", "billingDocuments")

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef)
    const current = Number(snap.exists() ? snap.data()?.[field] || 0 : 0)
    const next = current + 1

    transaction.set(counterRef, { [field]: next, updatedAt: serverTimestamp() }, { merge: true })

    return `${prefix}-${year}-${String(next).padStart(4, "0")}`
  })
}

function toDate(value) {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDocumentDate(item) {
  return toDate(item.issueDate || item.invoiceDateISO || item.createdAt) || new Date(0)
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return "-"
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
}

function getDocumentTotal(item) {
  return Number(item.totals?.totalTTC || item.totalTTC || 0)
}

function getDocumentPaid(item) {
  return Number(item.totals?.paid || item.paid || 0)
}

function getDocumentDue(item) {
  return Number(item.totals?.due ?? Math.max(0, getDocumentTotal(item) - getDocumentPaid(item)))
}

function getDocumentStatus(item) {
  return item.status || (getDocumentDue(item) <= 0 ? "paid" : getDocumentPaid(item) > 0 ? "partial" : "unpaid")
}

function statusLabel(status = "") {
  if (status === "paid") return "Payé"
  if (status === "partial") return "Partiel"
  return "Non payé"
}

function statusClass(status = "") {
  if (status === "paid") return "bg-green-50 text-green-700"
  if (status === "partial") return "bg-amber-50 text-amber-700"
  return "bg-red-50 text-red-700"
}

function typeClass(type = "") {
  return type === "DEVIS" ? "bg-purple-50 text-purple-700" : "bg-cyan-50 text-cyan-800"
}

function resetHistoryFilters() {
  historySearch.value = ""
  historyType.value = ""
  historyStatus.value = ""
  historyDateFrom.value = ""
  historyDateTo.value = ""
}

function duplicateDocument(item) {
  form.value = {
    type: item.type || "FACTURE",
    number: "",
    issueDate: todayISO(),
    dueDate: item.dueDate || "",
    clientName: item.billTo?.name || "",
    clientPhone: item.billTo?.phone || "",
    clientEmail: item.billTo?.email || "",
    clientAddress: item.billTo?.address || "",
    vatRate: Number(item.totals?.vatRate ?? item.vatRate ?? 0.2) * 100,
    discountType: item.totals?.discountType || "amount",
    discountValue: Number(item.totals?.discountValue ?? item.totals?.discountTTC ?? item.totals?.discount ?? 0),
    paid: 0,
    notes: item.notes || "",
  }

  items.value = Array.isArray(item.items) && item.items.length
    ? item.items.map((line) => ({
        label: line.label || "",
        qty: Number(line.qty || 1),
        unitPriceTTC: Number(line.unitPriceTTC || 0),
      }))
    : [{ label: "", qty: 1, unitPriceTTC: 0 }]

  window.scrollTo({ top: 0, behavior: "smooth" })
}

function convertQuoteToInvoice(item) {
  duplicateDocument({ ...item, type: "FACTURE" })
}

async function removeDocument(item) {
  if (!item?.id) return
  if (!window.confirm(`Supprimer ${item.type || "document"} ${item.number || ""} ?`)) return

  try {
    await deleteDoc(doc(db, "billingDocuments", item.id))
    toast("Document supprimé.", { type: "success", autoClose: 1200 })
  } catch (error) {
    console.error(error)
    toast("Erreur suppression document.", { type: "error" })
  }
}

function addItem() {
  items.value.push({ label: "", qty: 1, unitPriceTTC: 0 })
}

function removeItem(index) {
  if (items.value.length === 1) {
    items.value[0] = { label: "", qty: 1, unitPriceTTC: 0 }
    return
  }
  items.value.splice(index, 1)
}

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function titleCase(value = "") {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function extractBetween(text, starts, ends) {
  const match = text.match(new RegExp(`(?:${starts.join("|")})\\s+(.+?)(?=\\s+(?:${ends.join("|")})|[,.;]|$)`, "i"))
  return match?.[1]?.trim() || ""
}

const quantityWords = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
}

function parseQty(value = "") {
  const key = normalizeText(value).trim()
  return Number(key) || quantityWords[key] || 1
}

function cleanClientName(value = "") {
  return value
    .replace(/^(facture|devis)\s+(pour\s+)?/i, "")
    .replace(/^(client|facturer)\s+/i, "")
    .replace(/[,. ;]+$/g, "")
    .trim()
}

function parseItemsChunk(chunk = "") {
  const itemRegex = /\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)?\s*([a-zA-ZÀ-ÿ0-9' -]{2,}?)\s+(?:a|à|prix)\s+(\d+(?:[,.]\d+)?)(?:\s*€|\s*euros?)?/gi
  const parsed = []
  let match

  while ((match = itemRegex.exec(chunk)) !== null) {
    const label = match[2]
      .replace(/\b(facture|devis|client|pour|avec|article|articles|prestation|prestations)\b/gi, "")
      .trim()

    if (!label) continue
    parsed.push({
      label: titleCase(label),
      qty: parseQty(match[1]),
      unitPriceTTC: Number(match[3].replace(",", ".")),
    })
  }

  return parsed
}

function parseSpokenBillingSentence(text) {
  const body = text
    .replace(/^(facture|devis)\s+(pour\s+)?/i, "")
    .trim()

  const firstItem = body.match(/\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+[a-zA-ZÀ-ÿ0-9' -]{2,}?\s+(?:a|à|prix)\s+\d/i)
  if (!firstItem || firstItem.index == null) return null

  const clientName = cleanClientName(body.slice(0, firstItem.index))
  const parsedItems = parseItemsChunk(body.slice(firstItem.index))

  if (!clientName || !parsedItems.length) return null
  return {
    clientName: titleCase(clientName),
    items: parsedItems,
  }
}

function parseDirectBillingSentence(text) {
  const directMatch = text.match(
    /^(?:(facture|devis)\s+)?(?:(monsieur|madame|mr|mme|m)\s+)?([a-zA-ZÀ-ÿ' -]{2,}?)\s+(?:de|pour)\s+([a-zA-ZÀ-ÿ0-9' -]{2,}?)\s+(?:a|à|prix)\s+(\d+(?:[,.]\d+)?)/i
  )

  if (!directMatch) return null

  const [, type, civilite = "", clientName = "", label = "", price = "0"] = directMatch
  return {
    type: type ? type.toUpperCase() : "",
    clientName: titleCase(`${civilite} ${clientName}`.trim()),
    item: {
      label: titleCase(label),
      qty: 1,
      unitPriceTTC: Number(price.replace(",", ".")),
    },
  }
}

function buildPayload(numberOverride = "") {
  const number = numberOverride || form.value.number || generatedNumber()
  const cleanItems = items.value
    .filter((item) => item.label && Number(item.qty || 0) > 0)
    .map((item) => ({
      label: item.label,
      qty: Number(item.qty || 1),
      unitPriceTTC: Number(item.unitPriceTTC || 0),
      amountTTC: Number(item.qty || 1) * Number(item.unitPriceTTC || 0),
    }))

  return {
    type: form.value.type,
    documentTitle: form.value.type,
    number,
    invoiceNumber: number,
    invoiceDateISO: form.value.issueDate,
    issueDate: form.value.issueDate,
    dueDate: form.value.dueDate,
    vatRate: Number(form.value.vatRate || 0) / 100,
    amountDueLabel: form.value.dueDate ? `Échéance ${form.value.dueDate}` : form.value.type === "DEVIS" ? "Validité 30 jours" : "Dû à réception",
    billTo: {
      name: form.value.clientName,
      phone: form.value.clientPhone,
      email: form.value.clientEmail,
      address: form.value.clientAddress,
    },
    items: cleanItems,
    totals: {
      subtotalTTC: subtotalTTC.value,
      discountTTC: discountTTC.value,
      discountType: form.value.discountType,
      discountValue: Number(form.value.discountValue || 0),
      totalTTC: totalTTC.value,
      paid: Number(form.value.paid || 0),
      due: due.value,
      vatRate: Number(form.value.vatRate || 0) / 100,
    },
    notes: form.value.notes,
    status: due.value <= 0 ? "paid" : Number(form.value.paid || 0) > 0 ? "partial" : "unpaid",
  }
}

function generatePDF(document = null) {
  const payload = document || buildPayload()
  if (!payload.items.length) {
    toast("Ajoute au moins une ligne.", { type: "warning" })
    return
  }
  generateInvoicePdf({
    ...payload,
    fileName: `${payload.type?.toLowerCase() || "document"}-${payload.number}.pdf`,
  })
}

async function saveDocument() {
  const hasItems = items.value.some((item) => item.label && Number(item.qty || 0) > 0)
  if (!form.value.clientName || !hasItems) {
    toast("Client et lignes obligatoires.", { type: "warning" })
    return
  }

  saving.value = true
  try {
    const number = await generateUniqueDocumentNumber(form.value.type)
    const payload = buildPayload(number)

    await addDoc(documentsCol, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    toast(`${payload.type === "DEVIS" ? "Devis" : "Facture"} enregistré ✅`, { type: "success", autoClose: 1300 })
    form.value = {
      type: "FACTURE",
      number: "",
      issueDate: todayISO(),
      dueDate: "",
      clientName: "",
      clientPhone: "",
      clientEmail: "",
      clientAddress: "",
      vatRate: 20,
      discountType: "amount",
      discountValue: 0,
      paid: 0,
      notes: "",
    }
    items.value = [{ label: "", qty: 1, unitPriceTTC: 0 }]
  } catch (error) {
    console.error(error)
    toast("Erreur sauvegarde document.", { type: "error" })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Facturation</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Factures & devis</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Crée des documents professionnels avec lignes, TVA, remise, acompte et PDF.
          </p>
          <a
            href="#historique-facturation"
            class="mt-4 inline-flex rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100"
          >
            Voir l'historique
          </a>
        </div>
        <div class="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
          <div class="rounded-md bg-white px-4 py-2">
            <p class="text-xs font-medium text-slate-500">Total TTC</p>
            <p class="text-lg font-bold text-slate-950">{{ money(totalTTC) }}</p>
          </div>
          <div class="rounded-md bg-white px-4 py-2">
            <p class="text-xs font-medium text-slate-500">Solde</p>
            <p class="text-lg font-bold text-slate-950">{{ money(due) }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form class="space-y-6" @submit.prevent="saveDocument">
        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-bold text-slate-950">Document</h3>
          <div class="mt-5 grid gap-4 md:grid-cols-3">
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Type</span>
              <select v-model="form.type" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option>FACTURE</option>
                <option>DEVIS</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Numéro</span>
              <input
                :value="form.number || 'Automatique à l’enregistrement'"
                readonly
                class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-500"
              />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Date</span>
              <input v-model="form.issueDate" type="date" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-bold text-slate-950">Client</h3>
          <div class="mt-5 grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Nom client</span>
              <input v-model="form.clientName" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="Nom ou société" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Téléphone</span>
              <input v-model="form.clientPhone" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Email</span>
              <input v-model="form.clientEmail" type="email" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Adresse</span>
              <input v-model="form.clientAddress" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-lg font-bold text-slate-950">Lignes</h3>
            <button type="button" class="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-800" @click="addItem">
              Ajouter
            </button>
          </div>

          <div class="mt-5 space-y-3">
            <div v-for="(item, index) in items" :key="index" class="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_90px_140px_44px]">
              <input v-model="item.label" class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="Prestation ou article" />
              <input v-model.number="item.qty" type="number" min="1" class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-center text-sm" />
              <input v-model.number="item.unitPriceTTC" type="number" min="0" step="0.01" class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="Prix TTC" />
              <button type="button" class="h-11 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700" @click="removeItem(index)">X</button>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-bold text-slate-950">Paiement</h3>
          <div class="mt-5 grid gap-4 md:grid-cols-5">
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">TVA %</span>
              <input v-model.number="form.vatRate" type="number" min="0" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Type remise</span>
              <select v-model="form.discountType" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="amount">€</option>
                <option value="percent">%</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Remise</span>
              <input v-model.number="form.discountValue" type="number" min="0" step="0.01" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Acompte / payé</span>
              <input v-model.number="form.paid" type="number" min="0" step="0.01" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Échéance</span>
              <input v-model="form.dueDate" type="date" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </div>
        </section>

        <div class="flex flex-wrap justify-end gap-3">
          <a
            href="#historique-facturation"
            class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-cyan-200 hover:text-cyan-800"
          >
            Historique
          </a>
          <button type="button" class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-cyan-200" @click="generatePDF()">
            Générer PDF
          </button>
          <button type="submit" class="rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60" :disabled="saving">
            {{ saving ? "Enregistrement..." : "Enregistrer" }}
          </button>
        </div>
      </form>

      <aside class="space-y-4 xl:sticky xl:top-28 xl:self-start">
        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-base font-bold text-slate-950">Résumé</h3>
          <div class="mt-4 space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">Type</span><span class="font-bold">{{ form.type }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Client</span><span class="font-bold">{{ form.clientName || "-" }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Sous-total</span><span class="font-bold">{{ money(subtotalTTC) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Remise</span><span class="font-bold text-red-700">-{{ money(discountTTC) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Total TTC</span><span class="font-bold">{{ money(totalTTC) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Payé</span><span class="font-bold">{{ money(form.paid) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Solde</span><span class="font-bold text-cyan-800">{{ money(due) }}</span></div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-base font-bold text-slate-950">Derniers documents</h3>
          <div class="mt-4 divide-y divide-slate-100">
            <div v-for="doc in documents.slice(0, 8)" :key="doc.id" class="py-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-bold text-slate-950">{{ doc.type }} {{ doc.number }}</p>
                  <p class="mt-1 text-sm text-slate-500">{{ doc.billTo?.name || "Client" }}</p>
                </div>
                <button type="button" class="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600" @click="generatePDF(doc)">
                  PDF
                </button>
              </div>
            </div>
            <p v-if="!documents.length" class="py-6 text-sm text-slate-500">Aucun document enregistré.</p>
          </div>
        </section>
      </aside>
    </div>

    <section id="historique-facturation" class="scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-200 px-5 py-4">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Historique</p>
            <h3 class="mt-1 text-lg font-bold text-slate-950">Factures & devis enregistrés</h3>
            <p class="mt-1 text-sm text-slate-500">
              Recherche, filtre et regénère les documents sauvegardés dans la facturation.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded-lg bg-slate-50 px-3 py-2">
              <p class="text-xs font-medium text-slate-500">Factures</p>
              <p class="text-lg font-bold text-slate-950">{{ documentStats.invoices }}</p>
            </div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">
              <p class="text-xs font-medium text-slate-500">Devis</p>
              <p class="text-lg font-bold text-slate-950">{{ documentStats.quotes }}</p>
            </div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">
              <p class="text-xs font-medium text-slate-500">À encaisser</p>
              <p class="text-lg font-bold text-slate-950">{{ documentStats.unpaid }}</p>
            </div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">
              <p class="text-xs font-medium text-slate-500">Solde</p>
              <p class="text-lg font-bold text-slate-950">{{ money(documentStats.totalDue) }}</p>
            </div>
          </div>
        </div>

        <div class="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.2fr)_repeat(4,minmax(0,1fr))_auto]">
          <input
            v-model="historySearch"
            class="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            placeholder="Client, numéro, téléphone..."
          />

          <select v-model="historyType" class="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950">
            <option value="">Tous types</option>
            <option value="FACTURE">Factures</option>
            <option value="DEVIS">Devis</option>
          </select>

          <select v-model="historyStatus" class="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950">
            <option value="">Tous statuts</option>
            <option value="paid">Payé</option>
            <option value="partial">Partiel</option>
            <option value="unpaid">Non payé</option>
          </select>

          <input v-model="historyDateFrom" type="date" class="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" />
          <input v-model="historyDateTo" type="date" class="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" />

          <button
            type="button"
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            @click="resetHistoryFilters"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      <div class="divide-y divide-slate-100 lg:hidden">
        <article v-for="item in filteredDocuments" :key="item.id" class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap gap-2">
                <span class="rounded-md px-2.5 py-1 text-xs font-bold" :class="typeClass(item.type)">
                  {{ item.type || "DOCUMENT" }}
                </span>
                <span class="rounded-md px-2.5 py-1 text-xs font-bold" :class="statusClass(getDocumentStatus(item))">
                  {{ statusLabel(getDocumentStatus(item)) }}
                </span>
              </div>
              <p class="mt-2 font-bold text-slate-950">{{ item.number || item.invoiceNumber || "-" }}</p>
              <p class="mt-1 text-sm text-slate-500">{{ item.billTo?.name || "Client" }}</p>
            </div>
            <p class="text-right text-sm font-bold text-slate-950">{{ money(getDocumentTotal(item)) }}</p>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
            <p>Date : {{ formatDate(item.issueDate || item.invoiceDateISO || item.createdAt) }}</p>
            <p>Solde : {{ money(getDocumentDue(item)) }}</p>
            <p class="col-span-2">Téléphone : {{ item.billTo?.phone || "-" }}</p>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" class="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white" @click="generatePDF(item)">
              PDF
            </button>
            <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700" @click="duplicateDocument(item)">
              Dupliquer
            </button>
            <button v-if="item.type === 'DEVIS'" type="button" class="rounded-lg border border-green-200 px-3 py-2 text-xs font-bold text-green-700" @click="convertQuoteToInvoice(item)">
              En facture
            </button>
            <button type="button" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700" @click="removeDocument(item)">
              Supprimer
            </button>
          </div>
        </article>

        <p v-if="!filteredDocuments.length" class="px-5 py-10 text-center text-sm text-slate-500">
          Aucun document trouvé.
        </p>
      </div>

      <div class="hidden overflow-x-auto lg:block">
        <table class="min-w-[1120px] w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-5 py-3">Date</th>
              <th class="px-5 py-3">Type</th>
              <th class="px-5 py-3">Numéro</th>
              <th class="px-5 py-3">Client</th>
              <th class="px-5 py-3">Téléphone</th>
              <th class="px-5 py-3 text-right">Total</th>
              <th class="px-5 py-3 text-right">Payé</th>
              <th class="px-5 py-3 text-right">Solde</th>
              <th class="px-5 py-3">Statut</th>
              <th class="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in filteredDocuments" :key="item.id" class="hover:bg-slate-50">
              <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ formatDate(item.issueDate || item.invoiceDateISO || item.createdAt) }}</td>
              <td class="whitespace-nowrap px-5 py-4">
                <span class="rounded-md px-2.5 py-1 text-xs font-bold" :class="typeClass(item.type)">
                  {{ item.type || "-" }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">{{ item.number || item.invoiceNumber || "-" }}</td>
              <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.billTo?.name || "-" }}</td>
              <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.billTo?.phone || "-" }}</td>
              <td class="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-950">{{ money(getDocumentTotal(item)) }}</td>
              <td class="whitespace-nowrap px-5 py-4 text-right text-slate-600">{{ money(getDocumentPaid(item)) }}</td>
              <td class="whitespace-nowrap px-5 py-4 text-right font-semibold text-cyan-800">{{ money(getDocumentDue(item)) }}</td>
              <td class="whitespace-nowrap px-5 py-4">
                <span class="rounded-md px-2.5 py-1 text-xs font-bold" :class="statusClass(getDocumentStatus(item))">
                  {{ statusLabel(getDocumentStatus(item)) }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-4">
                <div class="flex justify-end gap-2">
                  <button type="button" class="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white" @click="generatePDF(item)">
                    PDF
                  </button>
                  <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" @click="duplicateDocument(item)">
                    Dupliquer
                  </button>
                  <button v-if="item.type === 'DEVIS'" type="button" class="rounded-lg border border-green-200 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-50" @click="convertQuoteToInvoice(item)">
                    En facture
                  </button>
                  <button type="button" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50" @click="removeDocument(item)">
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="!filteredDocuments.length">
              <td class="px-5 py-10 text-center text-slate-500" colspan="10">
                Aucun document trouvé.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
