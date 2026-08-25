<template>
  <div class="min-h-screen bg-slate-50 px-4 pb-28 pt-8 text-slate-950 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-6xl space-y-6">
      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Calculateur</p>
            <h2 class="mt-2 text-2xl font-bold">Devis volume</h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Calcule le volume, ajoute les informations du destinataire puis génère un devis PDF.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
            <div class="rounded-md bg-white px-4 py-2">
              <p class="text-xs font-medium text-slate-500">Volume</p>
              <p class="text-lg font-bold">{{ totalVolume.toFixed(3) }} m3</p>
            </div>
            <div class="rounded-md bg-white px-4 py-2">
              <p class="text-xs font-medium text-slate-500">Total TTC</p>
              <p class="text-lg font-bold text-cyan-800">{{ money(totalPrice) }}</p>
            </div>
          </div>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main class="space-y-6">
          <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-bold">Destinataire du devis</h3>
            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Nom ou société</span>
                <input
                  v-model="client.name"
                  type="text"
                  placeholder="Nom complet"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Email</span>
                <input
                  v-model="client.email"
                  type="email"
                  placeholder="client@email.com"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Téléphone</span>
                <input
                  v-model="client.phone"
                  type="tel"
                  placeholder="06..."
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Adresse</span>
                <input
                  v-model="client.address"
                  type="text"
                  placeholder="Adresse de facturation"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-bold">Paramètres</h3>
            <div class="mt-5 grid gap-4 md:grid-cols-5">
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Date</span>
                <input
                  v-model="quoteDate"
                  type="date"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Prix par m3 TTC</span>
                <input
                  v-model.number="pricePerM3"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex : 150"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">TVA %</span>
                <input
                  v-model.number="vatRate"
                  type="number"
                  min="0"
                  step="0.1"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Type remise</span>
                <select
                  v-model="discountType"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="amount">€</option>
                  <option value="percent">%</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm font-semibold text-slate-700">Remise</span>
                <input
                  v-model.number="discountValue"
                  type="number"
                  min="0"
                  step="0.01"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 class="text-lg font-bold">Volumes</h3>
              <button
                type="button"
                class="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-800"
                @click="addLine"
              >
                Ajouter une ligne
              </button>
            </div>

            <div class="mt-5 space-y-3">
              <div
                v-for="(line, index) in lines"
                :key="index"
                class="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[92px_repeat(3,1fr)_120px_44px]"
              >
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600">Qte</span>
                  <input v-model.number="line.qte" type="number" min="1" class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600">L cm</span>
                  <input v-model.number="line.length" type="number" min="0" class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600">l cm</span>
                  <input v-model.number="line.width" type="number" min="0" class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600">H cm</span>
                  <input v-model.number="line.height" type="number" min="0" class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </label>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-semibold text-slate-500">Volume</p>
                  <p class="mt-1 font-bold">{{ calcLineVolume(line).toFixed(3) }} m3</p>
                </div>
                <button
                  type="button"
                  class="mt-5 h-11 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100"
                  @click="removeLine(index)"
                >
                  X
                </button>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-bold">Message sur le devis</h3>
            <textarea
              v-model="notes"
              rows="3"
              placeholder="Conditions, délai, informations complémentaires..."
              class="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            ></textarea>
          </section>

          <div class="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-cyan-200 hover:text-cyan-800"
              @click="generatePDF"
            >
              Générer PDF
            </button>
            <button
              type="button"
              class="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-800 shadow-sm hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!client.email"
              @click="prepareEmail"
            >
              Préparer email
            </button>
            <button
              type="button"
              class="rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60"
              :disabled="saving"
              @click="saveQuote"
            >
              {{ saving ? "Enregistrement..." : "Enregistrer le devis" }}
            </button>
          </div>
        </main>

        <aside class="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-base font-bold">Résumé</h3>
            <div class="mt-4 space-y-3 text-sm">
              <div class="flex justify-between gap-4"><span class="text-slate-500">Client</span><span class="text-right font-bold">{{ client.name || "-" }}</span></div>
              <div class="flex justify-between gap-4"><span class="text-slate-500">Volume total</span><span class="font-bold">{{ totalVolume.toFixed(3) }} m3</span></div>
              <div class="flex justify-between gap-4"><span class="text-slate-500">Prix/m3</span><span class="font-bold">{{ money(pricePerM3) }}</span></div>
              <div class="flex justify-between gap-4"><span class="text-slate-500">Sous-total</span><span class="font-bold">{{ money(subtotalPrice) }}</span></div>
              <div class="flex justify-between gap-4"><span class="text-slate-500">Remise</span><span class="font-bold text-red-700">-{{ money(discountAmount) }}</span></div>
              <div class="flex justify-between gap-4"><span class="text-slate-500">Total TTC</span><span class="font-bold text-cyan-800">{{ money(totalPrice) }}</span></div>
            </div>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-base font-bold">Après génération</h3>
            <p class="mt-3 text-sm leading-6 text-slate-600">
              Le PDF contient les coordonnées du client. L'enregistrement ajoute aussi le devis dans l'écran Factures & devis.
            </p>
            <p v-if="lastQuoteNumber" class="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
              Dernier devis : {{ lastQuoteNumber }}
            </p>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from "vue"
import { addDoc, collection, doc, runTransaction, serverTimestamp } from "firebase/firestore"
import { toast } from "vue3-toastify"
import { db } from "../components/firebaseConfig"
import { generateInvoicePdf } from "../utils/invoicePdf"

const documentsCol = collection(db, "billingDocuments")
const todayISO = () => new Date().toISOString().slice(0, 10)
const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0))

const lines = reactive([{ qte: 1, length: 0, width: 0, height: 0 }])
const pricePerM3 = ref(0)
const quoteDate = ref(todayISO())
const vatRate = ref(20)
const discountType = ref("amount")
const discountValue = ref(0)
const notes = ref("")
const saving = ref(false)
const lastQuoteNumber = ref("")

const client = reactive({
  name: "",
  email: "",
  phone: "",
  address: "",
})

function addLine() {
  lines.push({ qte: 1, length: 0, width: 0, height: 0 })
}

function removeLine(index) {
  if (lines.length === 1) {
    lines[0] = { qte: 1, length: 0, width: 0, height: 0 }
    return
  }
  lines.splice(index, 1)
}

function calcLineVolume(line) {
  const qte = Number(line.qte || 0)
  const length = Number(line.length || 0) / 100
  const width = Number(line.width || 0) / 100
  const height = Number(line.height || 0) / 100
  return qte * length * width * height
}

const totalVolume = computed(() =>
  lines.reduce((sum, line) => sum + calcLineVolume(line), 0)
)

const subtotalPrice = computed(() => totalVolume.value * Number(pricePerM3.value || 0))

const discountAmount = computed(() => {
  const value = Math.max(0, Number(discountValue.value || 0))
  if (discountType.value === "percent") {
    return Math.min(subtotalPrice.value, subtotalPrice.value * value / 100)
  }
  return Math.min(subtotalPrice.value, value)
})

const totalPrice = computed(() => Math.max(0, subtotalPrice.value - discountAmount.value))

async function generateUniqueQuoteNumber() {
  const year = new Date().getFullYear()
  const field = `DEVIS_${year}`
  const counterRef = doc(db, "counters", "billingDocuments")

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef)
    const current = Number(snap.exists() ? snap.data()?.[field] || 0 : 0)
    const next = current + 1

    transaction.set(counterRef, { [field]: next, updatedAt: serverTimestamp() }, { merge: true })

    return `DEV-${year}-${String(next).padStart(4, "0")}`
  })
}

function buildQuoteItems() {
  return lines
    .map((line, index) => {
      const qty = Number(line.qte || 0)
      const volume = calcLineVolume(line)
      const amountTTC = volume * Number(pricePerM3.value || 0)
      const unitPriceTTC = qty > 0 ? amountTTC / qty : 0

      return {
        label: `Volume ${index + 1} - ${line.length || 0} x ${line.width || 0} x ${line.height || 0} cm (${volume.toFixed(3)} m3)`,
        qty,
        unitPriceTTC,
        amountTTC,
      }
    })
    .filter((item) => item.qty > 0 && item.amountTTC > 0)
}

function buildPayload(number = lastQuoteNumber.value || "") {
  const quoteNumber = number || `DEV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-PREVIEW`
  const items = buildQuoteItems()

  return {
    type: "DEVIS",
    documentTitle: "DEVIS",
    number: quoteNumber,
    invoiceNumber: quoteNumber,
    invoiceDateISO: quoteDate.value,
    issueDate: quoteDate.value,
    dueDate: "",
    vatRate: Number(vatRate.value || 0) / 100,
    amountDueLabel: "Validité 30 jours",
    billTo: {
      name: client.name,
      phone: client.phone,
      email: client.email,
      address: client.address,
    },
    items,
    totals: {
      subtotalTTC: subtotalPrice.value,
      discountTTC: discountAmount.value,
      discountType: discountType.value,
      discountValue: Number(discountValue.value || 0),
      totalTTC: totalPrice.value,
      paid: 0,
      due: totalPrice.value,
      vatRate: Number(vatRate.value || 0) / 100,
    },
    paymentInfo: {
      other: notes.value,
    },
    notes: notes.value,
    status: "unpaid",
  }
}

function validateQuote() {
  if (!client.name.trim()) {
    toast("Ajoute le nom du destinataire.", { type: "warning" })
    return false
  }
  if (!buildQuoteItems().length) {
    toast("Ajoute au moins une ligne avec un volume et un prix.", { type: "warning" })
    return false
  }
  return true
}

function generatePDF() {
  if (!validateQuote()) return
  const payload = buildPayload()

  generateInvoicePdf({
    ...payload,
    fileName: `devis-${payload.number}.pdf`,
  })
}

async function saveQuote() {
  if (!validateQuote()) return

  saving.value = true
  try {
    const number = await generateUniqueQuoteNumber()
    const payload = buildPayload(number)

    await addDoc(documentsCol, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    lastQuoteNumber.value = number
    toast("Devis enregistré.", { type: "success", autoClose: 1400 })
    generateInvoicePdf({
      ...payload,
      fileName: `devis-${payload.number}.pdf`,
    })
  } catch (error) {
    console.error(error)
    toast("Erreur lors de l'enregistrement du devis.", { type: "error" })
  } finally {
    saving.value = false
  }
}

function prepareEmail() {
  if (!validateQuote()) return

  const subject = encodeURIComponent(`Devis Aaron Travel - ${client.name}`)
  const body = encodeURIComponent(
    [
      `Bonjour ${client.name},`,
      "",
      `Veuillez trouver votre devis d'un montant de ${money(totalPrice.value)} TTC.`,
      `Volume total : ${totalVolume.value.toFixed(3)} m3.`,
      "",
      "Cordialement,",
      "Aaron Travel",
    ].join("\n")
  )

  window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`
}
</script>
