<!-- src/views/contracts/components/PaymentsCard.vue -->
<script setup>
import { confirmToast } from "../../../utils/confirmToast.js"
import { computed, ref, watch } from "vue"
import { useFirestore, useCollection } from "vuefire"
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

import { generateInvoicePdf } from "../../../utils/invoicePdf"
import {
  norm,
  safeISO,
  todayISO,
  round2,
  splitTTC,
  addOneMonthPeriod,
  periodToDueDate,
  buildInvoiceNumber,
  createPaymentAndSyncInvoice,
  updatePaymentAndSyncInvoice,
  deletePaymentAndSyncInvoice,
  findInvoiceByContractAndPeriod,
} from "../../../utils/billingSync"

const props = defineProps({
  contractId: { type: String, required: true },
  contract: { type: Object, default: null },
})

const db = useFirestore()

/* =========================================================
   PAYMENTS — collection racine "payments"
========================================================= */
const paymentsQuery = computed(() => {
  if (!props.contractId) return null
  return query(
    collection(db, "payments"),
    where("contractId", "==", props.contractId),
    orderBy("period", "desc")
  )
})

const paymentsSnap = useCollection(paymentsQuery)
const payments = computed(() => paymentsSnap.value || [])

/* =========================================================
   UI state
========================================================= */
const showPayModal = ref(false)
const saving = ref(false)
const editingPaymentId = ref(null)

const form = ref({
  period: "",
  issueDate: "",
  amountTTC: 0,
  method: "cash",
  note: "",
})

/* =========================================================
   Helpers
========================================================= */
function money(n) {
  return Number(n || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function currentPeriod() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function resetForm() {
  form.value = {
    period: currentPeriod(),
    issueDate: todayISO(),
    amountTTC: Number(props.contract?.monthlyTTC || 0),
    method: "cash",
    note: "",
  }
  editingPaymentId.value = null
}

function openCreateModal() {
  resetForm()
  showPayModal.value = true
}

function openEditModal(payment) {
  form.value = {
    period: String(payment?.period || currentPeriod()),
    issueDate: safeISO(payment?.invoiceIssueDate || payment?.paidAt) || todayISO(),
    amountTTC: Number(payment?.amountTTC ?? payment?.amount ?? 0),
    method: String(payment?.method || "cash"),
    note: String(payment?.note || ""),
  }
  editingPaymentId.value = payment?.id || null
  showPayModal.value = true
}

function closeModal() {
  showPayModal.value = false
  resetForm()
}

function isEditing(payment) {
  return editingPaymentId.value && editingPaymentId.value === payment?.id
}

watch(
  () => props.contract,
  (c) => {
    if (Number(c?.monthlyTTC) && !Number(form.value.amountTTC)) {
      form.value.amountTTC = Number(c.monthlyTTC)
    }
    if (!form.value.period) form.value.period = currentPeriod()
  },
  { immediate: true }
)

const paidPeriods = computed(() => {
  const set = new Set()
  for (const p of payments.value) {
    if (editingPaymentId.value && p.id === editingPaymentId.value) continue
    const period = String(p.period || "").trim()
    if (period) set.add(period)
  }
  return set
})

const lastPaidPeriod = computed(() => payments.value[0]?.period || "")
const nextDueDate = computed(() => props.contract?.nextDueDate || "")

/* =========================================================
   PDF facture
========================================================= */
async function generateInvoiceForPeriod(period, paymentRow = null) {
  const c = props.contract || {}
  const vatRate = Number(c.tvaRate || 0)

  const invoice = await findInvoiceByContractAndPeriod(db, props.contractId, period)

  const invoiceTotalTTC = Number(
    invoice?.totals?.ttc ??
      c.monthlyTTC ??
      paymentRow?.amountTTC ??
      paymentRow?.amount ??
      0
  )

  const paidAmountTTC = Number(
    invoice?.totals?.paid ??
      paymentRow?.amountTTC ??
      paymentRow?.amount ??
      invoiceTotalTTC
  )

  const split = splitTTC(invoiceTotalTTC, vatRate)
  const due = round2(Math.max(0, invoiceTotalTTC - paidAmountTTC))

  const billToName =
    norm(c.companyName) ||
    norm(c.representativeName) ||
    norm(c.clientName) ||
    "Client"

  const invoiceNumber =
    invoice?.number ||
    buildInvoiceNumber({
      boxName: c.boxName,
      boxCode: c.boxCode,
      boxId: c.boxId,
      contractId: props.contractId,
      period,
    })

  const invoiceDateISO =
    safeISO(invoice?.issueDate) ||
    safeISO(paymentRow?.invoiceIssueDate) ||
    safeISO(paymentRow?.paidAt) ||
    todayISO()

  generateInvoicePdf({
    invoiceNumber,
    invoiceDateISO,
    issueDate: invoiceDateISO,
    paidAt: invoiceDateISO,
    vatRate,

    provider: {
      title: "TRANSPORT FOMEK",
      contactName: "",
      tva: "",
      siret: "",
      addressLines: ["15 rue des Écoles, 95500 Le Thillay"],
      phone: "+33 6 95 93 19 92",
      website: "https://transportfomek.vercel.app",
      email: "",
    },

    billTo: {
      name: billToName,
      representativeName: norm(c.representativeName || ""),
      address: norm(c.address || ""),
      email: norm(c.email || ""),
      phone: norm(c.phone || ""),
    },

    items: [
      {
        label: `Mise a disposition Box ${c.boxName || c.boxCode || c.boxId || "BOX"}\n${period}`,
        unitPriceTTC: split.ttc,
        qty: 1,
        amountTTC: split.ttc,
      },
    ],

    totals: {
      totalHT: split.ht,
      tva: split.tva,
      totalTTC: split.ttc,
      paid: paidAmountTTC,
      balanceDue: due,
      vatRate,
    },

    paymentInfo: {
      primary: { title: "MODALITÉS DE PAIEMENT", value: "" },
      iban: "",
      bic: "",
      chequeTo: "TRANSPORT FOMEK",
      other: "",
    },
  })
}

/* =========================================================
   Save payment
========================================================= */
async function savePayment() {
  try {
    if (!props.contractId) return

    const period = norm(form.value.period)
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      toast("Période invalide (YYYY-MM) ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    if (paidPeriods.value.has(period)) {
      toast("Ce mois est déjà payé 😅", { type: "error", autoClose: 1400 })
      return
    }

    const amountTTC = Number(form.value.amountTTC || 0)
    if (amountTTC <= 0) {
      toast("Montant TTC obligatoire ⚠️", { type: "warning", autoClose: 1400 })
      return
    }

    const issueDate = safeISO(form.value.issueDate) || todayISO()

    saving.value = true

    const c = props.contract || {}

    if (!editingPaymentId.value) {
      await createPaymentAndSyncInvoice(db, {
        contract: c,
        contractId: props.contractId,
        period,
        issueDate,
        amountTTC,
        method: form.value.method,
        note: form.value.note,
      })

      const nextPeriod = addOneMonthPeriod(period)
      const billingDay = Number(c.billingDay || 1)
      const due = nextPeriod ? periodToDueDate(nextPeriod, billingDay) : ""

      await updateDoc(doc(db, "contracts", props.contractId), {
        lastPaidPeriod: period,
        nextDueDate: due,
        unpaidCount: 0,
        updatedAt: serverTimestamp(),
      })

      toast("Paiement ajouté + facture synchronisée ✅", {
        type: "success",
        autoClose: 1200,
      })

      form.value.period = nextPeriod || currentPeriod()
    } else {
      const previousPayment = payments.value.find((p) => p.id === editingPaymentId.value)
      if (!previousPayment) {
        toast("Paiement introuvable ❌", { type: "error" })
        return
      }

      await updatePaymentAndSyncInvoice(db, {
        paymentId: editingPaymentId.value,
        previousPayment,
        contract: c,
        contractId: props.contractId,
        nextPeriod: period,
        nextIssueDate: issueDate,
        nextAmountTTC: amountTTC,
        nextMethod: form.value.method,
        nextNote: form.value.note,
      })

      await updateDoc(doc(db, "contracts", props.contractId), {
        lastPaidPeriod: period,
        updatedAt: serverTimestamp(),
      })

      toast("Paiement modifié + facture resynchronisée ✅", {
        type: "success",
        autoClose: 1200,
      })
    }

    closeModal()
  } catch (e) {
    console.error(e)
    toast("Erreur paiement / facture ❌", { type: "error" })
  } finally {
    saving.value = false
  }
}

/* =========================================================
   Delete payment
========================================================= */
async function removePayment(payment) {
  try {
    const ok = await confirmToast(
      `Supprimer le paiement ${payment?.period || ""} ? Cette action mettra aussi la facture à jour.`
    )
    if (!ok) return

    saving.value = true

    await deletePaymentAndSyncInvoice(db, {
      paymentId: payment.id,
      payment,
      contract: props.contract || {},
      contractId: props.contractId,
    })

    toast("Paiement supprimé + facture resynchronisée ✅", {
      type: "success",
      autoClose: 1200,
    })

    if (editingPaymentId.value === payment.id) {
      closeModal()
    }
  } catch (e) {
    console.error(e)
    toast("Erreur suppression paiement ❌", { type: "error" })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
    <div v-if="!contract" class="text-sm text-slate-500">Chargement contrat…</div>

    <template v-else>
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div class="min-w-0">
          <div class="text-lg font-extrabold text-slate-900">Paiements</div>

          <div class="text-xs text-slate-500 mt-1 leading-5">
            Dernier payé :
            <span class="font-semibold text-slate-800">
              {{ lastPaidPeriod || "—" }}
            </span>
            <span class="hidden sm:inline"> • </span>
            <span class="block sm:inline">
              Prochaine échéance :
              <span class="font-semibold text-slate-800">
                {{ nextDueDate || "—" }}
              </span>
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
          <button
            class="btn btn-sm btn-outline w-full sm:w-auto"
            type="button"
            @click="generateInvoiceForPeriod(lastPaidPeriod || currentPeriod(), payments[0] || null)"
          >
            Générer facture PDF
          </button>

          <button
            class="btn btn-sm btn-primary w-full sm:w-auto"
            @click="openCreateModal"
          >
            + Ajouter paiement
          </button>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
          <div class="text-xs text-slate-500">Mensuel TTC</div>
          <div class="text-lg font-extrabold text-slate-900">
            {{ money(contract?.monthlyTTC) }} €
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
          <div class="text-xs text-slate-500">TVA</div>
          <div class="text-lg font-extrabold text-slate-900">
            {{ Number(contract?.tvaRate || 0) }} %
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
          <div class="text-xs text-slate-500">Paiements enregistrés</div>
          <div class="text-lg font-extrabold text-slate-900">
            {{ payments.length }}
          </div>
        </div>
      </div>

      <div class="mt-4 overflow-x-auto">
        <table class="table text-black min-w-[1100px] w-full">
          <thead class="text-black">
            <tr>
              <th>Mois</th>
              <th>HT</th>
              <th>TVA</th>
              <th>Montant TTC</th>
              <th>Méthode</th>
              <th>Note</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="p in payments" :key="p.id">
              <td class="font-semibold whitespace-nowrap">{{ p.period }}</td>
              <td class="whitespace-nowrap">{{ money(p.amountHT ?? 0) }} €</td>
              <td class="whitespace-nowrap">{{ money(p.amountTVA ?? 0) }} €</td>
              <td class="whitespace-nowrap">{{ money(p.amountTTC ?? p.amount ?? 0) }} €</td>
              <td class="uppercase text-xs font-bold whitespace-nowrap">{{ p.method }}</td>
              <td class="text-sm text-slate-600">
                <span class="break-words">{{ p.note || "—" }}</span>
              </td>
              <td class="text-right whitespace-nowrap">
                <div class="flex justify-end gap-2">
                  <button
                    class="btn btn-xs"
                    type="button"
                    @click="generateInvoiceForPeriod(p.period, p)"
                  >
                    PDF
                  </button>

                  <button
                    class="btn btn-xs btn-outline"
                    type="button"
                    @click="openEditModal(p)"
                  >
                    Modifier
                  </button>

                  <button
                    class="btn btn-xs btn-error"
                    type="button"
                    :disabled="saving"
                    @click="removePayment(p)"
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="payments.length === 0">
              <td colspan="7" class="text-slate-500">Aucun paiement enregistré.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <dialog class="modal" :open="showPayModal">
        <div class="modal-box bg-white w-[95vw] max-w-lg">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-extrabold text-lg text-slate-900">
              {{ editingPaymentId ? "Modifier un paiement" : "Ajouter un paiement" }}
            </h3>
            <button class="btn btn-sm btn-circle btn-ghost shrink-0" @click="closeModal">
              ✕
            </button>
          </div>

          <div class="mt-4 space-y-3">
            <div>
              <label class="text-sm font-medium text-slate-800">Période (YYYY-MM)</label>
              <input
                v-model="form.period"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="2026-02"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Date facture / PDF</label>
              <input
                v-model="form.issueDate"
                type="date"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Montant TTC (€)</label>
              <input
                v-model.number="form.amountTTC"
                type="number"
                min="0"
                step="0.01"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Méthode</label>
              <select
                v-model="form.method"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="cash">Cash</option>
                <option value="card">CB</option>
                <option value="transfer">Virement</option>
                <option value="check">Chèque</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-800">Note (optionnel)</label>
              <input
                v-model="form.note"
                class="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Ex: payé sur place"
              />
            </div>

            <div class="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button class="btn w-full sm:w-auto" :disabled="saving" @click="closeModal">
                Annuler
              </button>
              <button class="btn btn-primary w-full sm:w-auto" :disabled="saving" @click="savePayment">
                {{ saving ? "Enregistrement..." : editingPaymentId ? "Mettre à jour" : "Enregistrer" }}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </template>
  </div>
</template>

<style scoped>
/* Tailwind only */
</style>
