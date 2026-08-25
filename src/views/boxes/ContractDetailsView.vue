<!-- src/views/contracts/ContractDetailsView.vue -->
<script setup>
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useFirestore, useDocument } from "vuefire"
import { Timestamp } from "firebase/firestore"
import {
  doc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
  runTransaction,
  arrayUnion,
} from "firebase/firestore"

import PaymentsCard from "./components/PaymentsCard.vue"
import SignaturePad from "./components/SignaturePad.vue"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { generateContractPdf } from "../../utils/contractPdf"

const route = useRoute()
const router = useRouter()
const db = useFirestore()

/* =========================================================
   LOAD CONTRACT
========================================================= */
const contractId = computed(() => String(route.params.id || "").trim())
const contractRef = computed(() =>
  contractId.value ? doc(db, "contracts", contractId.value) : null
)
const contractSnap = useDocument(contractRef)
const contract = computed(() => contractSnap.value || null)

const isSigned = computed(() => contract.value?.status === "signed")

function goInvoices() {
  router.push({ path: "/invoices", query: { contractId: contractId.value } })
}

/* =========================================================
   HELPERS
========================================================= */
function money(n) {
  return Number(n || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function todayISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

/* =========================================================
   RESOLVE BOX ID
========================================================= */
async function resolveBoxIdFromContract(c) {
  const directBoxId = String(c?.boxId || "").trim()
  if (directBoxId) return directBoxId

  const code = String(c?.boxCode || "").trim()
  if (!code) return ""

  const q = query(collection(db, "boxes"), where("code", "==", code))
  const snap = await getDocs(q)
  if (snap.empty) return ""
  return snap.docs[0].id
}

/* =========================================================
   NAV
========================================================= */
async function goBox() {
  if (!contract.value) return
  const bid = await resolveBoxIdFromContract(contract.value)
  if (!bid) {
    toast("Box introuvable 😅", { type: "warning" })
    return
  }
  router.push(`/boxes/${bid}`)
}

/* =========================================================
   PDF
========================================================= */
function downloadPdf() {
  if (!contract.value) return
  generateContractPdf(contract.value, {
    contractId: contractId.value,
    save: true,
  })
}

/* =========================================================
   SIGNATURE
========================================================= */
const signOpen = ref(false)
const isSigning = ref(false)

const signForm = ref({
  clientSignatureDataUrl: "",
  providerSignatureDataUrl: "",
  signedCity: "LE THILLAY",
  signedDate: "",
})

watch(
  contract,
  (c) => {
    if (!c) return
    signForm.value = {
      clientSignatureDataUrl: c.clientSignatureDataUrl || "",
      providerSignatureDataUrl: c.providerSignatureDataUrl || "",
      signedCity: c.citySigned || "LE THILLAY",
      signedDate: c.signedDate || "",
    }
  },
  { immediate: true }
)

async function saveSignatures() {
  try {
    if (!contract.value) return

    if (!signForm.value.clientSignatureDataUrl || !signForm.value.providerSignatureDataUrl) {
      toast("2 signatures obligatoires ✍️", { type: "warning" })
      return
    }

    isSigning.value = true

    const boxIdResolved = await resolveBoxIdFromContract(contract.value)
    if (!boxIdResolved) {
      toast("Box non trouvé ❌", { type: "error" })
      return
    }

    const signedDateFinal = signForm.value.signedDate || todayISO()
    const signedCityFinal = signForm.value.signedCity || "LE THILLAY"

    await updateDoc(contractRef.value, {
      boxId: boxIdResolved,
      clientSignatureDataUrl: signForm.value.clientSignatureDataUrl,
      providerSignatureDataUrl: signForm.value.providerSignatureDataUrl,
      citySigned: signedCityFinal,
      signedDate: signedDateFinal,
      status: "signed",
      signedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const boxRef = doc(db, "boxes", boxIdResolved)

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(boxRef)
      if (!snap.exists()) throw new Error("Box introuvable")

      tx.update(boxRef, {
        currentContractId: contractId.value,
        status: "rented",
        contractHistory: arrayUnion({
          contractId: contractId.value,
          signedDate: signedDateFinal,
          monthlyTTC: Number(contract.value.monthlyTTC || 0),
          createdAt: Timestamp.now(),
        }),
        updatedAt: serverTimestamp(),
      })
    })

    toast("Contrat signé + box mis à jour ✅", { type: "success" })
    signOpen.value = false
  } catch (e) {
    console.error(e)
    toast("Erreur signature ❌", { type: "error" })
  } finally {
    isSigning.value = false
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50">
    <div class="max-w-[1200px] mx-auto px-4 py-4 sm:py-6 space-y-4">
      <!-- HEADER -->
      <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 sm:p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <h1 class="text-2xl font-extrabold">Contrat</h1>
            <p class="text-sm text-slate-600 break-all mt-1">ID : {{ contractId }}</p>
            <p v-if="isSigned" class="text-emerald-600 font-bold text-xs mt-2">
              ✅ Signé
            </p>
          </div>

          <!-- actions responsive -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[520px]">
            <button class="btn btn-outline w-full" @click="goBox">
              Voir box
            </button>

            <button class="btn btn-outline w-full" @click="downloadPdf">
              Télécharger PDF
            </button>

            <button class="btn btn-outline w-full" @click="goInvoices">
              Voir factures
            </button>

            <button
              class="btn btn-primary w-full sm:col-span-2 lg:col-span-1"
              @click="router.push(`/contracts/${contractId}/pay`)"
            >
              Enregistrer paiement
            </button>

            <button
              class="btn btn-primary w-full sm:col-span-2 lg:col-span-2"
              :disabled="isSigned"
              @click="signOpen = true"
            >
              {{ isSigned ? "Signé" : "Signer le contrat" }}
            </button>
          </div>
        </div>
      </div>

      <!-- CARD -->
      <div v-if="contract" class="bg-white p-4 sm:p-6 rounded-2xl shadow border border-slate-100">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="font-extrabold text-lg break-words">
              Box : {{ contract.boxCode || "—" }}
            </div>
            <div class="text-sm text-slate-600 break-words">
              {{ contract.companyName || contract.representativeName || "Client non renseigné" }}
            </div>
            <div class="text-xs text-slate-500 mt-1 break-words">
              Début : {{ contract.startDate || "—" }} • Durée :
              {{ contract.durationChoice || "—" }} mois
            </div>
          </div>

          <div class="text-left sm:text-right shrink-0">
            <div class="text-xs text-slate-500">Mensuel</div>
            <div class="text-xl font-extrabold">
              {{ money(contract.monthlyTTC) }} € TTC
            </div>
          </div>
        </div>
      </div>

      <!-- PAYMENTS -->
      <PaymentsCard v-if="contract" :contract-id="contractId" :contract="contract" />
    </div>

    <!-- SIGNATURE MODAL -->
    <dialog class="modal" :open="signOpen">
      <div class="modal-box bg-white w-[95vw] max-w-4xl p-4 sm:p-6">
        <div class="flex items-start justify-between gap-3">
          <h3 class="font-bold text-lg">Signer le contrat</h3>
          <button class="btn btn-sm shrink-0" @click="signOpen = false">✕</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div class="min-w-0">
            <div class="font-bold mb-2">Signature client</div>
            <SignaturePad v-model="signForm.clientSignatureDataUrl" :height="180" />
          </div>

          <div class="min-w-0">
            <div class="font-bold mb-2">Signature prestataire</div>
            <SignaturePad v-model="signForm.providerSignatureDataUrl" :height="180" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <input
            type="date"
            v-model="signForm.signedDate"
            class="input input-bordered w-full"
          />
          <input
            v-model="signForm.signedCity"
            class="input input-bordered w-full"
            placeholder="Ville de signature"
          />
        </div>

        <div class="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button class="btn w-full sm:w-auto" @click="signOpen = false">
            Annuler
          </button>
          <button
            class="btn btn-primary w-full sm:w-auto"
            :disabled="isSigning"
            @click="saveSignatures"
          >
            {{ isSigning ? "Signature..." : "Finaliser" }}
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
/* Tailwind only */
</style>