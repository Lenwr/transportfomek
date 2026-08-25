<!-- src/views/contracts/EditContractView.vue -->
<script setup>
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useFirestore } from "vuefire"
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

import ContractForm from "../../components/contracts/ContractForm.vue"
import { generateContractPdf } from "../../../../utils/contractPdf"
import {
  BOX_CONTRACT_TEMPLATE_DOC_PATH,
  normalizeBoxContractTemplate,
} from "../../../../utils/boxContractTemplate"

const db = useFirestore()
const route = useRoute()
const router = useRouter()

/* =========================
  State
========================= */
const loading = ref(false)
const saving = ref(false)
const selectedBox = ref(null)
const contractBoxId = ref(null)
const contractTemplate = ref(null)
const contractTemplateSnapshot = ref(null)

const contractId = computed(() => String(route.params.id || "").trim())

const form = ref({
  // Client
  clientNumber: "",
  companyName: "",
  representativeName: "",
  address: "",
  email: "",
  phone: "",
  legalFormAndSiren: "",

  // Contrat / Box
  boxCode: "",
  siteAddress: "15 Rue des Écoles, 95500 LE THILLAY",
  startDate: "",
  durationChoice: 12,
  citySigned: "LE THILLAY",
  signedDate: "",

  // ⚠️ legacy naming
  // monthlyHT = TTC saisi dans le form
  monthlyHT: 0,
  tvaRate: 20,
  depositEnabled: true,
  depositMonths: 1,
  paymentMethod: "virement",

  // Annexes
  boxLocation: "",
  boxSurface: "",
  boxHeight: "",
  boxVolume: "",
  accessMode: "heures_du_site",
  accessGiven: "code",
  accessOther: "",
  padlock: "client",
  insuranceCompany: "",
  insurancePolicy: "",
  insuranceAttestationDate: "",
  entryInspectionDone: false,
  photosAttached: false,

  // Signatures
  clientSignatureDataUrl: "",
  providerSignatureDataUrl: "",
})

/* =========================
  Helpers
========================= */
function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function norm(v) {
  return String(v ?? "").trim()
}

/* =========================
  Pricing computed
========================= */
const monthlyTTCInput = computed(() => Number(form.value.monthlyHT || 0))

const tvaFactor = computed(() => 1 + Number(form.value.tvaRate || 0) / 100)

const monthlyHTComputed = computed(() => {
  const ttc = monthlyTTCInput.value
  const factor = tvaFactor.value
  return factor ? ttc / factor : ttc
})

const monthlyTVAAmount = computed(() => monthlyTTCInput.value - monthlyHTComputed.value)

const depositMonthsEffective = computed(() =>
  form.value.depositEnabled ? Number(form.value.depositMonths || 1) : 0
)

const depositTTC = computed(() => monthlyTTCInput.value * depositMonthsEffective.value)
const totalSignatureTTC = computed(() => monthlyTTCInput.value + depositTTC.value)

/* =========================
  Hydrate form from contract
========================= */
function hydrateFormFromContract(contract = {}) {
  form.value = {
    // Client
    clientNumber: contract.clientNumber || "",
    companyName: contract.companyName || "",
    representativeName: contract.representativeName || "",
    address: contract.address || "",
    email: contract.email || "",
    phone: contract.phone || "",
    legalFormAndSiren: contract.legalFormAndSiren || "",

    // Contrat / Box
    boxCode: contract.boxCode || "",
    siteAddress: contract.siteAddress || "15 Rue des Écoles, 95500 LE THILLAY",
    startDate: contract.startDate || todayISO(),
    durationChoice: Number(contract.durationChoice || 12),
    citySigned: contract.citySigned || "LE THILLAY",
    signedDate: contract.signedDate || todayISO(),

    // ⚠️ ici on remet le TTC dans monthlyHT pour coller au form actuel
    monthlyHT: Number(contract.monthlyTTC || 0),
    tvaRate: Number(contract.tvaRate || 20),
    depositEnabled: !!contract.depositEnabled,
    depositMonths: Number(contract.depositMonths || 1),
    paymentMethod: contract.paymentMethod || "virement",

    // Annexes
    boxLocation: contract.boxLocation || "",
    boxSurface: contract.boxSurface || "",
    boxHeight: contract.boxHeight || "",
    boxVolume: contract.boxVolume || "",
    accessMode: contract.accessMode || "heures_du_site",
    accessGiven: contract.accessGiven || "code",
    accessOther: contract.accessOther || "",
    padlock: contract.padlock || "client",
    insuranceCompany: contract.insuranceCompany || "",
    insurancePolicy: contract.insurancePolicy || "",
    insuranceAttestationDate: contract.insuranceAttestationDate || "",
    entryInspectionDone: !!contract.entryInspectionDone,
    photosAttached: !!contract.photosAttached,

    // Signatures
    clientSignatureDataUrl: contract.clientSignatureDataUrl || "",
    providerSignatureDataUrl: contract.providerSignatureDataUrl || "",
  }

  contractTemplateSnapshot.value = contract.contractTemplateSnapshot
    ? normalizeBoxContractTemplate(contract.contractTemplateSnapshot)
    : null
}

/* =========================
  Build payloads
========================= */
function buildContractPayload() {
  return {
    boxId: contractBoxId.value || null,
    boxCode: form.value.boxCode || "",

    clientNumber: form.value.clientNumber || "",
    companyName: form.value.companyName || "",
    representativeName: form.value.representativeName || "",
    address: form.value.address || "",
    email: form.value.email || "",
    phone: form.value.phone || "",
    legalFormAndSiren: form.value.legalFormAndSiren || "",

    siteAddress: form.value.siteAddress || "",
    startDate: form.value.startDate || todayISO(),
    durationChoice: Number(form.value.durationChoice || 12),
    citySigned: form.value.citySigned || "",
    signedDate: form.value.signedDate || todayISO(),

    tvaRate: Number(form.value.tvaRate || 0),
    monthlyTTC: Number(monthlyTTCInput.value || 0),
    monthlyHT: Number(monthlyHTComputed.value || 0),
    monthlyTVA: Number(monthlyTVAAmount.value || 0),

    depositEnabled: !!form.value.depositEnabled,
    depositMonths: Number(depositMonthsEffective.value || 0),
    paymentMethod: form.value.paymentMethod || "virement",

    depositTTC: Number(depositTTC.value || 0),
    totalSignatureTTC: Number(totalSignatureTTC.value || 0),

    boxLocation: form.value.boxLocation || "",
    boxSurface: form.value.boxSurface || "",
    boxHeight: form.value.boxHeight || "",
    boxVolume: form.value.boxVolume || "",
    accessMode: form.value.accessMode || "heures_du_site",
    accessGiven: form.value.accessGiven || "code",
    accessOther: form.value.accessOther || "",
    padlock: form.value.padlock || "client",
    insuranceCompany: form.value.insuranceCompany || "",
    insurancePolicy: form.value.insurancePolicy || "",
    insuranceAttestationDate: form.value.insuranceAttestationDate || "",
    entryInspectionDone: !!form.value.entryInspectionDone,
    photosAttached: !!form.value.photosAttached,

    clientSignatureDataUrl: form.value.clientSignatureDataUrl || "",
    providerSignatureDataUrl: form.value.providerSignatureDataUrl || "",
    contractTemplateSnapshot: contractTemplateSnapshot.value || contractTemplate.value || null,

    updatedAt: serverTimestamp(),
  }
}

function buildContractPdfPayload() {
  return {
    id: contractId.value,

    clientNumber: form.value.clientNumber || "",
    companyName: form.value.companyName || "",
    representativeName: form.value.representativeName || "",
    address: form.value.address || "",
    email: form.value.email || "",
    phone: form.value.phone || "",
    legalFormAndSiren: form.value.legalFormAndSiren || "",

    boxCode: form.value.boxCode || "",
    siteAddress: form.value.siteAddress || "15 Rue des Écoles, 95500 LE THILLAY",
    startDate: form.value.startDate || todayISO(),
    durationChoice: Number(form.value.durationChoice || 12),
    citySigned: form.value.citySigned || "LE THILLAY",
    signedDate: form.value.signedDate || todayISO(),

    monthlyHT: Number(monthlyHTComputed.value || 0),
    monthlyTTC: Number(monthlyTTCInput.value || 0),
    monthlyTVA: Number(monthlyTVAAmount.value || 0),
    tvaRate: Number(form.value.tvaRate || 20),

    depositEnabled: !!form.value.depositEnabled,
    depositMonths: Number(depositMonthsEffective.value || 0),
    paymentMethod: form.value.paymentMethod || "virement",

    depositTTC: Number(depositTTC.value || 0),
    totalSignatureTTC: Number(totalSignatureTTC.value || 0),

    boxLocation: form.value.boxLocation || "",
    boxSurface: form.value.boxSurface || "",
    boxHeight: form.value.boxHeight || "",
    boxVolume: form.value.boxVolume || "",
    accessMode: form.value.accessMode || "heures_du_site",
    accessGiven: form.value.accessGiven || "code",
    accessOther: form.value.accessOther || "",
    padlock: form.value.padlock || "client",
    insuranceCompany: form.value.insuranceCompany || "",
    insurancePolicy: form.value.insurancePolicy || "",
    insuranceAttestationDate: form.value.insuranceAttestationDate || "",
    entryInspectionDone: !!form.value.entryInspectionDone,
    photosAttached: !!form.value.photosAttached,

    clientSignatureDataUrl: form.value.clientSignatureDataUrl || "",
    providerSignatureDataUrl: form.value.providerSignatureDataUrl || "",
  }
}

/* =========================
  Loaders
========================= */
async function loadBox(boxId) {
  if (!boxId) {
    selectedBox.value = null
    return
  }

  try {
    const snap = await getDoc(doc(db, "boxes", boxId))
    if (!snap.exists()) {
      selectedBox.value = null
      return
    }

    selectedBox.value = { id: snap.id, ...snap.data() }
  } catch (e) {
    console.error(e)
    selectedBox.value = null
  }
}

async function loadContract() {
  if (!contractId.value) {
    toast("Contrat introuvable", { type: "error" })
    router.push("/boxes")
    return
  }

  loading.value = true
  try {
    const snap = await getDoc(doc(db, "contracts", contractId.value))

    if (!snap.exists()) {
      toast("Contrat introuvable", { type: "error" })
      router.push("/boxes")
      return
    }

    const data = { id: snap.id, ...snap.data() }

    contractBoxId.value = data.boxId || null
    hydrateFormFromContract(data)

    if (data.boxId) {
      await loadBox(data.boxId)
    } else {
      selectedBox.value = null
    }
  } catch (e) {
    console.error(e)
    toast("Erreur chargement contrat", { type: "error" })
  } finally {
    loading.value = false
  }
}

async function loadContractTemplate() {
  try {
    const snap = await getDoc(doc(db, ...BOX_CONTRACT_TEMPLATE_DOC_PATH))
    contractTemplate.value = snap.exists() ? normalizeBoxContractTemplate(snap.data()) : null
  } catch (e) {
    console.error(e)
    contractTemplate.value = null
  }
}

onMounted(() => {
  loadContractTemplate()
  loadContract()
})

/* =========================
  PDF actions
========================= */
function previewContractPDF() {
  try {
    const payload = buildContractPdfPayload()

    const pdf = generateContractPdf(payload, {
      contractId: contractId.value || "preview",
      save: false,
      template: contractTemplateSnapshot.value || contractTemplate.value,
    })

    const blobUrl = pdf.output("bloburl")
    window.open(blobUrl, "_blank")
  } catch (e) {
    console.error(e)
    toast("Erreur génération preview PDF", { type: "error" })
  }
}

function downloadContractPDF() {
  try {
    const payload = buildContractPdfPayload()

    generateContractPdf(payload, {
      contractId: contractId.value,
      save: true,
      template: contractTemplateSnapshot.value || contractTemplate.value,
    })
  } catch (e) {
    console.error(e)
    toast("Erreur génération PDF", { type: "error" })
  }
}

/* =========================
  Save
========================= */
async function updateContract() {
  try {
    if (!norm(form.value.companyName) && !norm(form.value.representativeName)) {
      toast("Renseigne au moins la raison sociale ou le représentant", {
        type: "warning",
        autoClose: 1400,
      })
      return
    }

    if (!norm(form.value.boxCode)) {
      toast("Box obligatoire", { type: "warning", autoClose: 1400 })
      return
    }

    if (!norm(form.value.startDate)) {
      toast("Date de début obligatoire", { type: "warning", autoClose: 1400 })
      return
    }

    if (!Number(form.value.monthlyHT)) {
      toast("Prix mensuel TTC obligatoire", { type: "warning", autoClose: 1400 })
      return
    }

    if (!contractId.value) {
      toast("Contrat introuvable", { type: "error" })
      return
    }

    saving.value = true

    await updateDoc(doc(db, "contracts", contractId.value), buildContractPayload())

    toast("Contrat modifié ✅", { type: "success", autoClose: 1200 })
    downloadContractPDF()
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur modification contrat", {
      type: "error",
      autoClose: 1800,
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ContractForm
    v-model="form"
    mode="edit"
    :loading="loading"
    :saving="saving"
    :selected-box="selectedBox"
    @cancel="router.back()"
    @preview="previewContractPDF"
    @submit="updateContract"
  />
</template>

<style scoped>
/* nothing */
</style>
