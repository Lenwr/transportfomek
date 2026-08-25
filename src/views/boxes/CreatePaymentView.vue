<script setup>
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useFirestore } from "vuefire"
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDocFromCache,
  updateDoc,
} from "firebase/firestore"
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import jsPDF from "jspdf"

const db = useFirestore()
const route = useRoute()
const router = useRouter()

const contractId = computed(() => String(route.params.id || "").trim())

const loading = ref(false)
const saving = ref(false)
const contract = ref(null)

const form = ref({
  period: "", // YYYY-MM
  amount: 0,
  method: "transfer",
  note: "",
  paidAt: "", // YYYY-MM-DD
})

const invoice = ref(null)
const invoiceId = computed(() => {
  if (!contractId.value || !form.value.period) return ""
  return `${contractId.value}_${form.value.period}`
})

function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
function defaultPeriodFromToday() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${yyyy}-${mm}`
}

function safeSpaces(s) {
  // jsPDF aime pas les NBSP / narrow NBSP -> ça fait des trucs bizarres (genre 1/100,00)
  return String(s || "").replace(/\u202f/g, " ").replace(/\u00a0/g, " ")
}

function fmtMoney(n) {
  const v = Number(n || 0)
  const out = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
  return safeSpaces(out)
}

async function loadContract() {
  if (!contractId.value) return
  loading.value = true
  try {
    const snap = await getDoc(doc(db, "contracts", contractId.value))
    if (!snap.exists()) {
      toast("Contrat introuvable", { type: "error" })
      return
    }
    contract.value = { id: snap.id, ...snap.data() }

    // defaults
    if (!form.value.period) form.value.period = defaultPeriodFromToday()
    if (!form.value.paidAt) form.value.paidAt = todayISO()

    // montant default = TTC mensuel
    if (!form.value.amount) {
      form.value.amount = Number(contract.value.monthlyTTC || 0) || Number(contract.value.monthlyHT || 0)
    }
  } catch (e) {
    console.error(e)
    toast("Erreur chargement contrat", { type: "error" })
  } finally {
    loading.value = false
  }
}

async function loadInvoice() {
  if (!invoiceId.value) return
  try {
    const snap = await getDoc(doc(db, "invoices", invoiceId.value))
    if (!snap.exists()) {
      invoice.value = null
      return
    }
    invoice.value = { id: snap.id, ...snap.data() }
  } catch (e) {
    // pas grave, la facture arrive après trigger
    invoice.value = null
  }
}

onMounted(async () => {
  await loadContract()
  await loadInvoice()
})

watch(() => form.value.period, async () => {
  await loadInvoice()
})

async function createPayment() {
  try {
    if (!contract.value?.id) return
    if (!form.value.period) {
      toast("Période obligatoire", { type: "warning", autoClose: 1200 })
      return
    }
    const amount = Number(form.value.amount || 0)
    if (amount <= 0) {
      toast("Montant invalide", { type: "warning", autoClose: 1200 })
      return
    }

    saving.value = true

    const paidAtDate = form.value.paidAt ? new Date(form.value.paidAt) : new Date()

    // 1) create payment
    const payRef = await addDoc(collection(db, "payments"), {
      contractId: contract.value.id,
      period: form.value.period,
      amount,
      method: form.value.method,
      note: form.value.note?.trim() || "",
      paidAt: paidAtDate,
      createdAt: serverTimestamp(),
    })

    toast("Paiement enregistré ✅ Génération facture…", { type: "success", autoClose: 1200 })

    // 2) wait/poll invoice doc (trigger v2)
    const maxTry = 12
    for (let i = 0; i < maxTry; i++) {
      await new Promise((r) => setTimeout(r, 600))
      await loadInvoice()
      if (invoice.value?.id) break
    }

    if (!invoice.value?.id) {
      toast("Facture en cours… rafraîchis dans 2 sec", { type: "info", autoClose: 1400 })
      return
    }

    toast(`Facture #${invoice.value.number} prête ✅`, { type: "success", autoClose: 1200 })
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur paiement", { type: "error", autoClose: 1800 })
  } finally {
    saving.value = false
  }
}

/* =========================
   PDF Invoice (style propre)
   + upload storage
========================= */
function generateInvoicePDF(inv) {
  const docPdf = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = docPdf.internal.pageSize.getWidth()
  const pageH = docPdf.internal.pageSize.getHeight()
  const mx = 14
  let y = 14

  const addLine = (h = 6) => (y += h)
  const hr = () => {
    docPdf.setDrawColor(220)
    docPdf.line(mx, y, pageW - mx, y)
    y += 6
  }
  const ensure = (need = 12) => {
    if (y + need > pageH - 14) {
      docPdf.addPage()
      y = 14
    }
  }

  // Always use same font family to avoid weird shifts
  const fontN = () => docPdf.setFont("helvetica", "normal")
  const fontB = () => docPdf.setFont("helvetica", "bold")

  // Header
  fontB()
  docPdf.setFontSize(12)
  docPdf.text(safeSpaces(inv.seller?.name || "AARON TRAVEL"), mx, y)
  addLine(6)

  fontN()
  docPdf.setFontSize(9.5)
  const sellerLines = [
    inv.seller?.address1,
    `TVA: ${inv.seller?.tva || ""}   SIRET: ${inv.seller?.siret || ""}`,
    inv.seller?.phone ? `Tel: ${inv.seller.phone}` : "",
    inv.seller?.website ? safeSpaces(inv.seller.website) : "",
    inv.seller?.email ? safeSpaces(inv.seller.email) : "",
  ].filter(Boolean)

  sellerLines.forEach((l) => {
    docPdf.text(safeSpaces(l), mx, y)
    addLine(5)
  })

  // Invoice meta right
  const rightX = pageW - mx
  let yTop = 14
  fontB()
  docPdf.setFontSize(16)
  docPdf.text("FACTURE", rightX, yTop + 6, { align: "right" })

  fontN()
  docPdf.setFontSize(10)
  docPdf.text(`N° ${safeSpaces(inv.number)}`, rightX, yTop + 14, { align: "right" })

  const issue = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date()
  const issueStr = `${String(issue.getDate()).padStart(2, "0")}/${String(issue.getMonth() + 1).padStart(2, "0")}/${issue.getFullYear()}`
  docPdf.text(`DATE ${issueStr}`, rightX, yTop + 20, { align: "right" })

  y = Math.max(y, 52)
  hr()

  // Client block
  ensure(30)
  fontB()
  docPdf.setFontSize(10)
  docPdf.text("ADRESSE DE FACTURATION", mx, y)
  addLine(6)

  fontB()
  docPdf.setFontSize(12)
  const clientName = safeSpaces(inv.client?.companyName || inv.client?.representativeName || "CLIENT")
  docPdf.text(clientName, mx, y)
  addLine(6)

  fontN()
  docPdf.setFontSize(10)
  const clientLines = [
    inv.client?.representativeName ? safeSpaces(inv.client.representativeName) : "",
    inv.client?.address ? safeSpaces(inv.client.address) : "",
    inv.client?.email ? safeSpaces(inv.client.email) : "",
    inv.client?.phone ? safeSpaces(inv.client.phone) : "",
  ].filter(Boolean)

  clientLines.forEach((l) => {
    docPdf.text(l, mx, y)
    addLine(5)
  })

  hr()

  // Table header
  ensure(30)
  const col1 = mx
  const col2 = pageW - mx - 70
  const col3 = pageW - mx - 35
  const col4 = pageW - mx

  docPdf.setFillColor(90, 55, 45) // brun proche screenshot
  docPdf.rect(mx, y, pageW - mx * 2, 8, "F")
  docPdf.setTextColor(255, 255, 255)
  fontB()
  docPdf.setFontSize(10)
  docPdf.text("ARTICLE", col1 + 2, y + 5.6)
  docPdf.text("PRIX", col2, y + 5.6)
  docPdf.text("QTÉ", col3, y + 5.6)
  docPdf.text("MONTANT", col4, y + 5.6, { align: "right" })
  docPdf.setTextColor(0, 0, 0)
  y += 12

  // Items
  fontN()
  docPdf.setFontSize(10)

  const items = Array.isArray(inv.items) ? inv.items : []
  items.forEach((it) => {
    ensure(10)
    const label = safeSpaces(it.label || "")
    docPdf.text(label, col1 + 2, y)
    docPdf.text(`${fmtMoney(it.unitPriceHT)} €`, col2, y)
    docPdf.text(String(it.qty || 1), col3, y)
    docPdf.text(`${fmtMoney(it.totalHT)} €`, col4, y, { align: "right" })
    y += 7
  })

  hr()

  // Totals block right
  ensure(40)
  const boxW = 80
  const xTotals = pageW - mx - boxW

  const totals = inv.totals || {}
  const lines = [
    ["TOTAL HT", `${fmtMoney(totals.ht)} €`],
    ["TVA", `${fmtMoney(totals.tva)} €`],
    ["TOTAL TTC", `${fmtMoney(totals.ttc)} €`],
    ["PAYÉ", `-${fmtMoney(totals.paid)} €`],
    ["SOLDE DÛ", `${fmtMoney(totals.due)} €`],
  ]

  fontB()
  docPdf.setFontSize(10)
  lines.forEach(([k, v], idx) => {
    ensure(8)
    docPdf.text(k, xTotals, y)
    docPdf.text(v, pageW - mx, y, { align: "right" })
    y += 6.5
  })

  hr()

  // Payment instructions
  ensure(30)
  fontB()
  docPdf.setFontSize(11)
  docPdf.text("INFORMATIONS DE PAIEMENT", mx, y)
  y += 7

  fontN()
  docPdf.setFontSize(10)
  const payLines = [
    "IBAN : FR46200401010125200472C03349",
    "BIC : PSSTFRPPSCE",
    "PAR CHÈQUE : AARON TRAVEL",
    "PAYPAL : aarontravel@outlook.fr",
    "PayLib : 06.03.67.50.62",
  ]
  payLines.forEach((l) => {
    ensure(6)
    docPdf.text(safeSpaces(l), mx, y)
    y += 5.5
  })

  // Footer
  fontN()
  docPdf.setFontSize(9)
  docPdf.setTextColor(130)
  docPdf.text(`Facture ID: ${inv.id}`, mx, pageH - 10)
  docPdf.text(`Page 1/${docPdf.getNumberOfPages()}`, pageW - mx, pageH - 10, { align: "right" })
  docPdf.setTextColor(0)

  return docPdf
}

async function generateAndUploadPDF() {
  try {
    if (!invoice.value?.id) {
      toast("Aucune facture à générer", { type: "warning", autoClose: 1200 })
      return
    }

    const inv = invoice.value
    const pdf = generateInvoicePDF(inv)
    const blob = pdf.output("blob")

    const storage = getStorage()
    const filename = `facture-${inv.number}-${inv.period}.pdf`
    const path = `invoices/${filename}`
    const fileRef = sRef(storage, path)

    await uploadBytes(fileRef, blob, { contentType: "application/pdf" })
    const url = await getDownloadURL(fileRef)

    await updateDoc(doc(db, "invoices", inv.id), {
      pdfUrl: url,
      updatedAt: serverTimestamp(),
    })

    invoice.value = { ...invoice.value, pdfUrl: url }

    toast("PDF uploadé ✅", { type: "success", autoClose: 1200 })

    // open pdf (optionnel)
    window.open(url, "_blank")
  } catch (e) {
    console.error(e)
    toast("Erreur PDF", { type: "error" })
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50 text-slate-900">
    <div class="max-w-[1100px] mx-auto px-4 py-6 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">Encaissement</h1>
          <p class="text-sm text-slate-600">Enregistre un paiement → facture auto (1/mois)</p>
        </div>

        <button class="btn btn-sm" @click="router.back()">← Retour</button>
      </div>

      <div v-if="loading" class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 text-slate-600">
        Chargement…
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div class="md:col-span-7 space-y-4">
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold mb-3">Paiement</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">Période (YYYY-MM)</label>
                <input
                  v-model="form.period"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="2026-02"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Date paiement</label>
                <input
                  type="date"
                  v-model="form.paidAt"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Montant (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="form.amount"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Moyen</label>
                <select
                  v-model="form.method"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="transfer">Virement</option>
                  <option value="cash">Espèces</option>
                  <option value="card">Carte</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">Autre</option>
                </select>
              </div>

              <div class="sm:col-span-2">
                <label class="text-xs font-bold text-slate-600">Note (optionnel)</label>
                <input
                  v-model="form.note"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: payé en avance / acompte / etc"
                />
              </div>
            </div>

            <div class="mt-4 flex gap-2">
              <button class="btn btn-primary" :disabled="saving" @click="createPayment">
                {{ saving ? "Enregistrement..." : "Valider paiement" }}
              </button>
              <button class="btn btn-outline" type="button" @click="loadInvoice">
                Rafraîchir facture
              </button>
            </div>
          </div>
        </div>

        <div class="md:col-span-5 space-y-4">
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold mb-2">Contrat</div>

            <div v-if="contract" class="text-sm space-y-1">
              <div><span class="text-slate-500">Box :</span> <span class="font-bold">{{ contract.boxCode }}</span></div>
              <div><span class="text-slate-500">Client :</span> <span class="font-semibold">{{ contract.companyName || contract.representativeName }}</span></div>
              <div><span class="text-slate-500">Mensuel TTC :</span> <span class="font-semibold">{{ fmtMoney(contract.monthlyTTC) }} €</span></div>
            </div>
          </div>

          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold mb-2">Facture (période)</div>

            <div v-if="invoice" class="text-sm space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs text-slate-500">Numéro</div>
                  <div class="text-lg font-extrabold">#{{ invoice.number }}</div>
                </div>
                <div class="text-right">
                  <div class="text-xs text-slate-500">Période</div>
                  <div class="font-semibold">{{ invoice.period }}</div>
                </div>
              </div>

              <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div class="flex justify-between text-sm">
                  <span>Total TTC</span>
                  <span class="font-bold">{{ fmtMoney(invoice.totals?.ttc) }} €</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span>Payé</span>
                  <span class="font-bold">-{{ fmtMoney(invoice.totals?.paid) }} €</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span>Solde dû</span>
                  <span class="font-extrabold">{{ fmtMoney(invoice.totals?.due) }} €</span>
                </div>
              </div>

              <div class="flex gap-2">
                <button class="btn btn-primary" @click="generateAndUploadPDF">
                  Générer PDF + Upload
                </button>

                <a
                  v-if="invoice.pdfUrl"
                  class="btn btn-outline"
                  :href="invoice.pdfUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir PDF
                </a>
              </div>
            </div>

            <div v-else class="text-sm text-slate-600">
              Pas de facture trouvée pour <span class="font-semibold">{{ form.period }}</span>.
              <div class="text-xs text-slate-500 mt-1">
                (Après un paiement, elle apparaît en quelques secondes.)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tailwind only */
</style>