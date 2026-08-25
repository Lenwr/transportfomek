<script setup>
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useFirestore } from "vuefire"
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

import ContractForm from "./components/contracts/ContractForm.vue"
import { generateContractPdf } from "../../utils/contractPdf"
import {
  BOX_CONTRACT_TEMPLATE_DOC_PATH,
  normalizeBoxContractTemplate,
} from "../../utils/boxContractTemplate"

const db = useFirestore()
const route = useRoute()
const router = useRouter()

/* =========================
   State
========================= */
const loading = ref(false)
const saving = ref(false)

const boxId = computed(() => String(route.query.boxId || "").trim())
const selectedBox = ref(null)
const contractTemplate = ref(null)

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
  startDate: todayISO(),
  durationChoice: 12,
  citySigned: "LE THILLAY",
  signedDate: todayISO(),

  // ⚠️ legacy: monthlyHT = TTC saisi dans le form
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
   Load box
========================= */
async function loadBox() {
  if (!boxId.value) {
    selectedBox.value = null
    return
  }

  loading.value = true
  try {
    const snap = await getDoc(doc(db, "boxes", boxId.value))

    if (!snap.exists()) {
      toast("Box introuvable", { type: "error" })
      selectedBox.value = null
      return
    }

    const data = { id: snap.id, ...snap.data() }
    selectedBox.value = data

    form.value.boxCode = data.code || form.value.boxCode || ""

    // préremplissage du TTC saisi
    if (Number(data.priceMonthly) && !Number(form.value.monthlyHT)) {
      form.value.monthlyHT = Number(data.priceMonthly)
    }

    if (data.locationNote && !form.value.boxLocation) {
      form.value.boxLocation = String(data.locationNote)
    }
    if (data.surface && !form.value.boxSurface) {
      form.value.boxSurface = String(data.surface)
    }
    if (data.height && !form.value.boxHeight) {
      form.value.boxHeight = String(data.height)
    }
    if (data.volume && !form.value.boxVolume) {
      form.value.boxVolume = String(data.volume)
    }
  } catch (e) {
    console.error(e)
    toast("Erreur chargement box", { type: "error" })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadBox()
  loadContractTemplate()
})

async function loadContractTemplate() {
  try {
    const snap = await getDoc(doc(db, ...BOX_CONTRACT_TEMPLATE_DOC_PATH))
    contractTemplate.value = snap.exists() ? normalizeBoxContractTemplate(snap.data()) : null
  } catch (e) {
    console.error(e)
    contractTemplate.value = null
  }
}

/* =========================
   Build payloads
========================= */
function buildContractPayload() {
  return {
    siteId: "site-1",
    boxId: boxId.value || null,
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

    contractTemplateSnapshot: contractTemplate.value || null,
  }
}

function buildContractPdfPayload(contractId = "") {
  return {
    id: contractId,

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
   PDF actions
========================= */
function previewContractPDF() {
  try {
    const payload = buildContractPdfPayload("preview")

    const pdf = generateContractPdf(payload, {
      contractId: "preview",
      save: false,
      template: contractTemplate.value,
    })

    const blobUrl = pdf.output("bloburl")
    window.open(blobUrl, "_blank")
  } catch (e) {
    console.error(e)
    toast("Erreur génération preview PDF", { type: "error" })
  }
}

function downloadContractPDF(contractId = "") {
  try {
    const payload = buildContractPdfPayload(contractId)

    generateContractPdf(payload, {
      contractId,
      save: true,
      template: contractTemplate.value,
    })
  } catch (e) {
    console.error(e)
    toast("Erreur génération PDF", { type: "error" })
  }
}

/* =========================
   Create contract
========================= */
async function createContract() {
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

    saving.value = true
    const contractsCol = collection(db, "contracts")

    const created = await runTransaction(db, async (tx) => {
      let boxRef = null
      let boxSnap = null

      if (boxId.value) {
        boxRef = doc(db, "boxes", boxId.value)
        boxSnap = await tx.get(boxRef)

        if (!boxSnap.exists()) {
          throw new Error("Box introuvable")
        }

        const b = boxSnap.data()
        const st = String(b.status || "").toLowerCase()

        if (st === "rented" && b.currentContractId) {
          throw new Error("Ce box est déjà loué")
        }
      }

      const contractDocRef = doc(contractsCol)

      const payload = {
        ...buildContractPayload(),
        status: "draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      tx.set(contractDocRef, payload)

      if (boxRef && boxSnap) {
        tx.update(boxRef, {
          status: "reserved",
          currentContractId: contractDocRef.id,
          updatedAt: serverTimestamp(),
        })
      }

      return { id: contractDocRef.id, data: payload }
    })

    toast("Contrat créé ✅", { type: "success", autoClose: 1200 })
    downloadContractPDF(created.id)
    router.push(`/contracts/${created.id}`)
  } catch (e) {
    console.error(e)
    toast(e?.message || "Erreur création contrat", {
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
    mode="create"
    :loading="loading"
    :saving="saving"
    :selected-box="selectedBox"
    @cancel="router.push('/boxes')"
    @preview="previewContractPDF"
    @submit="createContract"
  />
</template>
