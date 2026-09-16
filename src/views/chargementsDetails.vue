<script setup>
import { confirmToast } from "../utils/confirmToast.js"
import { groupScannedPackages, recipientKey } from "../utils/scannedPackages"
import { computed, ref, onMounted, watch, nextTick } from "vue"
import { useFirestore, useDocument } from "vuefire"
import { doc, updateDoc, getDoc } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { useRoute } from "vue-router"
import { StreamBarcodeReader } from "vue-barcode-reader"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { format } from "date-fns"
import frLocale from "date-fns/locale/fr"
import { jsPDF } from "jspdf"
import { useAuthStore } from "../stores/useAuthStore.js"
import { transportFomekTrackingUrl } from "../utils/publicTracking"

const db = useFirestore()
const auth = getAuth()
const authStore = useAuthStore()
const route = useRoute()
const FUNCTIONS_BASE_URL = String(import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "")

/* =========================================================
   Etat
========================================================= */
const detailId = ref(route.params.id)
const docRef = doc(db, "chargements", detailId.value)
const chargementSource = useDocument(docRef)

const displayScanner = ref(false)
const scannerSection = ref(null)
const scannedText = ref("")
const statutSelectionne = ref("réceptionné")
const transitDateInput = ref("")
const estimatedDeliveryInput = ref("")
const scheduleAdjustmentDays = ref(0)
const scheduleReason = ref("")
const processingScan = ref(false)
const processingScanQueue = ref(false)
const scanQueue = ref([])
const lastQueuedScan = ref({ text: "", at: 0 })
const scanCooldownUntil = ref(0)
const sendingTrackingLinks = ref(false)
const financialPickups = ref([])
const loadingFinancialStats = ref(false)
const packageSearch = ref("")
const removingPackageId = ref("")

const companyProfile = ref({ nom: "TRANSPORT FOMEK" })
const statutsColisMap = ref(new Map())
const enlevementCache = new Map()
const canViewFinancial = computed(() => authStore.isSuperAdmin || authStore.hasPermission("billing"))

/* =========================================================
   Computeds
========================================================= */
const chargement = computed(() => {
  const src = chargementSource.value
  if (!src) return null
  return {
    id: detailId.value,
    ...src,
  }
})

function buildTrackingRecipientsForContainer(chargementId) {
  const recipients = []

  for (const enlevement of enlevements.value || []) {
    for (const colisGroup of enlevement.colis || []) {
      for (const detail of colisGroup.details || []) {

        // Le colis doit appartenir au chargement concerné
        if (detail.voyageId !== chargementId) continue

        const numero =
          detail.numero ||
          detail.numeroColis ||
          detail.trackingCode ||
          enlevement.numero

        const phone =
          enlevement.telephoneDestinataire ||
          colisGroup.telephoneDestinataire ||
          enlevement.telephone ||
          enlevement.phone

        if (!numero || !phone) continue

        const trackingUrl = transportFomekTrackingUrl(numero)

        recipients.push({
          phone,
          numero,
          destinataire:
            enlevement.destinataire ||
            colisGroup.destinataire ||
            "Client",

          expediteur:
            enlevement.expediteur ||
            colisGroup.expediteur ||
            "",

          destination:
            detail.destination ||
            enlevement.destination ||
            "",

          trackingUrl,

          enlevementId: enlevement.id,
          packageId: detail.packageId,
        })
      }
    }
  }

  return recipients
}

const TRACKING_SMS_URL =
  "https://us-central1-fomektrack.cloudfunctions.net/sendTrackingLinks"


watch(
  () => chargement.value?.statutGlobal,
  (status) => {
    const normalized = String(status || "").trim().toLowerCase()
    if (["réceptionné", "expédié", "disponible pour retrait", "livré"].includes(normalized)) {
      statutSelectionne.value = normalized
    }
  },
  { immediate: true }
)

watch(
  () => chargement.value?.transitDate || chargement.value?.shippingDate,
  (value) => {
    const date = value
      ? (typeof value?.toDate === "function" ? value.toDate() : new Date(value))
      : new Date()
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      transitDateInput.value = `${year}-${month}-${day}`
    }
  },
  { immediate: true }
)

watch(
  () => chargement.value?.estimatedDeliveryAt,
  (value) => {
    if (!value) return
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value)
    if (Number.isNaN(date.getTime())) return
    estimatedDeliveryInput.value = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-")
  },
  { immediate: true }
)

watch(
  () => chargement.value?.scheduleReason,
  (value) => { scheduleReason.value = String(value || "") },
  { immediate: true }
)

const colisFiltresTries = computed(() =>
  (chargement.value?.packagesTable || [])
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
)

function packageIdentity(item = {}, index = 0) {
  return String(item.id || `${item.clientId || "colis"}-${item.colisIndex ?? 0}-${item.detailIndex ?? index}`)
}

const filteredContainerPackages = computed(() => {
  const query = packageSearch.value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
  if (!query) return colisFiltresTries.value

  return colisFiltresTries.value.filter((item) =>
    [item.coli, item.expediteur, item.destinataire, item.telephoneDestinataireDirect,
      item.telephoneDestinataire, item.telephoneDestinataireWhatsapp, item.clientId]
      .filter(Boolean)
      .join(" ")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .includes(query)
  )
})

const totalQty = computed(() =>
  colissage.value.reduce((s, r) => s + Number(r.qty || 0), 0)
)

const getChargeName = computed(() =>
  chargement.value?.contenaire || `Chargement ${detailId.value}`
)

const getChargeDateStr = computed(() =>
  formatDateTime(
    toDate(chargement.value?.date || chargement.value?.createdAt || Date.now())
  )
)

const colisGroupesParExpediteur = computed(() => {
  const map = new Map()

  for (const item of colisFiltresTries.value) {
    const expediteur = (item.expediteur || "Sans expéditeur").trim()
    const destinataire = (item.destinataire || "").trim()
    const telephoneDestinataire = (item.telephoneDestinataire || item.telephoneDestinataireDirect || "").trim()
    const telephoneDestinataireWhatsapp = (item.telephoneDestinataireWhatsapp || "").trim()
    const key = `${expediteur}__${destinataire}__${telephoneDestinataire}__${telephoneDestinataireWhatsapp}`

    if (!map.has(key)) {
      map.set(key, {
        expediteur,
        destinataire,
        telephoneDestinataire,
        telephoneDestinataireWhatsapp,
        items: [],
        totalColis: 0,
      })
    }

    const group = map.get(key)
    group.items.push(item)
    group.totalColis += Number(item.nombreDeColis || 0)
  }

  return Array.from(map.values()).sort((a, b) =>
    a.expediteur.localeCompare(b.expediteur, "fr")
  )
})

/* =========================================================
   Helpers
========================================================= */
const isPhone = (s) => /^\+?\d{7,}$/.test((s || "").replace(/\s/g, ""))

function normalizeScannedParts(parts) {
  let [
    expediteur = "",
    destinataire = "",
    nombreDeColis = "0",
    clientId = "",
    colisIndexStr = "0",
    detailIndexStr = "0",
    coli = "",
    telDest = "",
  ] = parts.map((s) => (s ?? "").trim())

  if (!telDest && isPhone(nombreDeColis)) {
    telDest = nombreDeColis
    nombreDeColis = "0"
  }

  return {
    expediteur: expediteur || "",
    destinataire: destinataire || "",
    nombreDeColis: Number(nombreDeColis) || 0,
    clientId: clientId || "",
    colisIndex: Number(colisIndexStr) || 0,
    detailIndex: Number(detailIndexStr) || 0,
    coli: coli || "",
    telephoneDestinataire: telDest || "",
  }
}

function formatDateTime(dateLike) {
  let d
  if (!dateLike) d = new Date()
  else if (typeof dateLike?.toDate === "function") d = dateLike.toDate()
  else d = new Date(dateLike)

  return format(d, "EEEE d MMMM yyyy à HH'h'mm", { locale: frLocale })
}

function formatDateShort(dateLike) {
  let d
  if (!dateLike) d = new Date()
  else if (typeof dateLike?.toDate === "function") d = dateLike.toDate()
  else d = new Date(dateLike)

  return format(d, "dd/MM/yyyy", { locale: frLocale })
}

const toDate = (v) => (v?.toDate ? v.toDate() : new Date(v || Date.now()))

function getStatutColis(item) {
  const key = `${item.clientId}-${item.colisIndex}-${item.detailIndex}`
  return statutsColisMap.value.get(key) || item.status || "—"
}

function setLocalStatusForItems(items, status) {
  const map = new Map(statutsColisMap.value)

  for (const item of items || []) {
    const key = `${item.clientId}-${item.colisIndex}-${item.detailIndex}`
    map.set(key, status)
  }

  statutsColisMap.value = map
}

function normalizeScanText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replaceAll("¶", "|")
    .replaceAll("¦", "|")
    .replaceAll("｜", "|")

  try {
    return decodeURIComponent(cleaned)
  } catch {
    return cleaned
  }
}

/* =========================================================
   Parse QR / barcode
========================================================= */
function parseCompactBarcode(text) {
  const raw = normalizeScanText(text)

  // Format compact :
  // TF|clientId|colisIndex|detailIndex (AT reste accepté pour les anciennes étiquettes)
  if (!raw.startsWith("TF|") && !raw.startsWith("AT|")) return null

  const parts = raw.split("|")
  if (parts.length < 4) return null

  const [, clientId = "", colisIndexStr = "0", detailIndexStr = "0"] = parts

  return {
    source: "barcode",
    clientId: clientId.trim(),
    colisIndex: Number(colisIndexStr) || 0,
    detailIndex: Number(detailIndexStr) || 0,
  }
}

function parseLegacyQr(text) {
  const raw = normalizeScanText(text)

  const parts = raw.split(",").map((s) => s?.trim())

  if (parts.length < 8) return null

  const parsed = normalizeScannedParts(parts)

  return {
    source: "qr",
    ...parsed,
  }
}

function parseAnyScan(text) {
  const raw = normalizeScanText(text)
  if (!raw) return null

  const compactPayload = raw.match(/AT\|[^|\s]+\|\d+\|\d+/)?.[0]
  const compact = parseCompactBarcode(compactPayload || raw)
  if (compact) return compact

  const legacy = parseLegacyQr(raw)
  if (legacy) return legacy

  const urlIdMatch =
    raw.match(/(?:#\/|\/)(?:liste|enlevements?)\/([A-Za-z0-9_-]{8,})/) ||
    raw.match(/[?&](?:id|enlevementId|clientId)=([A-Za-z0-9_-]{8,})/)

  const possibleId = urlIdMatch?.[1] || raw.match(/^[A-Za-z0-9_-]{8,}$/)?.[0]

  if (possibleId) {
    return {
      source: "enlevement",
      clientId: possibleId,
    }
  }

  return null
}

/* =========================================================
   Build item depuis Firestore
========================================================= */
async function getEnlevementData(clientId) {
  if (enlevementCache.has(clientId)) return enlevementCache.get(clientId)

  const enlevRef = doc(db, "enlevements", clientId)
  const snap = await getDoc(enlevRef)

  if (!snap.exists()) {
    throw new Error("Enlèvement introuvable")
  }

  const data = snap.data()
  enlevementCache.set(clientId, data)
  return data
}

async function buildItemFromEnlevement(clientId, colisIndex, detailIndex) {
  const data = await getEnlevementData(clientId)
  const colisArr = Array.isArray(data.colis) ? data.colis : []
  const group = colisArr[colisIndex]

  if (!group) {
    throw new Error("Colis introuvable dans l'enlèvement")
  }

  let coli = ""
  const telephoneDestinataire = data.telephoneDestinataireDirect || data.telephoneDestinataire || ""
  const telephoneDestinataireWhatsapp = data.telephoneDestinataireWhatsapp || ""

  if (Array.isArray(group.details) && group.details.length) {
    const detail = group.details[detailIndex]
    if (!detail) {
      throw new Error("Détail colis introuvable")
    }
    coli = detail.coli || `${group.nom || "Colis"} ${detailIndex + 1}`
  } else if (group.quantite && group.quantite > 1) {
    coli = `${group.nom || "Colis"} ${detailIndex + 1}/${group.quantite}`
  } else {
    coli = group.nom || `Colis ${colisIndex + 1}`
  }

  const nowIso = new Date().toISOString()

  return {
    id: `${clientId}-${colisIndex}-${detailIndex}`,
    expediteur: data.expediteur || "",
    destinataire: data.destinataire || "",
    telephoneDestinataire,
    telephoneDestinataireDirect: telephoneDestinataire,
    telephoneDestinataireWhatsapp,
    coli,
    nombreDeColis: Number(data.nombreDeColis) || 0,
    clientId,
    colisIndex,
    detailIndex,
    date: nowIso,
    status: "réceptionné",
    historique: [{ status: "réceptionné", date: nowIso }],
    chargementId: detailId.value,
  }
}

async function buildItemsFromWholeEnlevement(clientId) {
  const data = await getEnlevementData(clientId)
  const colisArr = Array.isArray(data.colis) ? data.colis : []
  const rows = []

  colisArr.forEach((group, colisIndex) => {
    if (Array.isArray(group.details) && group.details.length) {
      group.details.forEach((detail, detailIndex) => {
        rows.push({
          group,
          detail,
          colisIndex,
          detailIndex,
          coli: detail.coli || `${group.nom || "Colis"} ${detailIndex + 1}`,
        })
      })
      return
    }

    const total = group.quantite && group.quantite > 1 ? Number(group.quantite) : 1
    for (let detailIndex = 0; detailIndex < total; detailIndex++) {
      rows.push({
        group,
        detail: null,
        colisIndex,
        detailIndex,
        coli: total > 1 ? `${group.nom || "Colis"} ${detailIndex + 1}/${total}` : group.nom || `Colis ${colisIndex + 1}`,
      })
    }
  })

  const nowIso = new Date().toISOString()
  return rows.map((row) => ({
    id: `${clientId}-${row.colisIndex}-${row.detailIndex}`,
    expediteur: data.expediteur || "",
    destinataire: data.destinataire || "",
    telephoneDestinataire: data.telephoneDestinataireDirect || data.telephoneDestinataire || "",
    telephoneDestinataireDirect: data.telephoneDestinataireDirect || data.telephoneDestinataire || "",
    telephoneDestinataireWhatsapp: data.telephoneDestinataireWhatsapp || "",
    destination: data.destination || "Cameroun",
    coli: row.coli,
    nombreDeColis: Number(data.nombreDeColis) || rows.length,
    clientId,
    colisIndex: row.colisIndex,
    detailIndex: row.detailIndex,
    date: nowIso,
    status: "réceptionné",
    historique: [{ status: "réceptionné", date: nowIso }],
    chargementId: detailId.value,
  }))
}

/* =========================================================
   Chargement des statuts réels
========================================================= */
async function chargerStatutsColis() {
  if (!chargement.value) return

  const map = new Map()
  const byClient = {}

  for (const it of chargement.value.packagesTable || []) {
    ;(byClient[it.clientId] ||= []).push(it)
  }

  for (const [clientId, list] of Object.entries(byClient)) {
    const refDoc = doc(db, "enlevements", clientId)
    const snap = await getDoc(refDoc)
    if (!snap.exists()) continue

    const arr = snap.data().colis || []

    for (const it of list) {
      const detail = arr[it.colisIndex]?.details?.[it.detailIndex]
      if (!detail) continue

      const key = `${it.clientId}-${it.colisIndex}-${it.detailIndex}`
      map.set(key, detail.statutColis || "")
    }
  }

  statutsColisMap.value = map
}

watch(() => chargement.value?.id, async (id) => {
  if (id) await Promise.all([chargerStatutsColis(), loadFinancialStats()])
})

watch(
  () => (chargement.value?.packagesTable || []).map((item) => item.clientId).filter(Boolean).join("|"),
  async (signature, previousSignature) => {
    if (signature && signature !== previousSignature) await loadFinancialStats()
  }
)

watch(canViewFinancial, async (allowed) => {
  if (allowed) await loadFinancialStats()
  else financialPickups.value = []
})

/* =========================================================
   Colissage
========================================================= */
function parseLabelFromColi(coli = "") {
  const m = coli.match(/^(.*?)(?:\s+\d+\s*\/\s*\d+)?$/i)
  const label = (m ? m[1] : coli).trim()
  return label || "Divers"
}

const scannedRecipientGroups = computed(() => groupScannedPackages(colisFiltresTries.value))
const displayedContainerPackages = computed(() => groupScannedPackages(filteredContainerPackages.value).flatMap(group => group.items))
const startsRecipientGroup = index => index === 0 || recipientKey(displayedContainerPackages.value[index]?.destinataire) !== recipientKey(displayedContainerPackages.value[index - 1]?.destinataire)

const colissage = computed(() => {
  const counts = new Map()

  for (const it of chargement.value?.packagesTable || []) {
    const label = parseLabelFromColi(it.coli)
    counts.set(label, (counts.get(label) || 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, qty]) => ({ label, qty }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
})

const totalScannedLines = computed(() => colisFiltresTries.value.length)

const totalDeclaredPackages = computed(() =>
  colisFiltresTries.value.reduce((sum, item) => sum + Number(item.nombreDeColis || 0), 0)
)

const totalShippers = computed(() => colisGroupesParExpediteur.value.length)

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? "")
    .replace(/[€\s\u00a0\u202f]/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(",", ".")
  const amount = Number.parseFloat(normalized)
  return Number.isFinite(amount) ? amount : 0
}

function normalizePaymentStatus(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
}

const financialStats = computed(() =>
  financialPickups.value.reduce(
    (stats, pickup) => {
      const total = Math.max(0, parseMoney(pickup.prix))
      const status = normalizePaymentStatus(pickup.statut)
      const explicitDue = Math.max(0, parseMoney(pickup.resteAPayer))
      const isPaid = ["paye", "payee", "paye(e)"].includes(status)
      const due = isPaid ? 0 : Math.min(total, explicitDue > 0 ? explicitDue : total)
      const paid = Math.max(0, total - due)

      stats.total += total
      stats.paid += paid
      stats.due += due
      if (isPaid || (total > 0 && due === 0)) stats.paidFiles += 1
      else if (paid > 0) stats.partialFiles += 1
      else stats.unpaidFiles += 1
      return stats
    },
    { total: 0, paid: 0, due: 0, paidFiles: 0, partialFiles: 0, unpaidFiles: 0 }
  )
)

const collectionRate = computed(() =>
  financialStats.value.total > 0
    ? Math.round((financialStats.value.paid / financialStats.value.total) * 100)
    : 0
)

const formatMoney = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0)

async function loadFinancialStats() {
  if (!canViewFinancial.value) {
    financialPickups.value = []
    return
  }

  const clientIds = [...new Set((chargement.value?.packagesTable || []).map((item) => item.clientId).filter(Boolean))]
  if (!clientIds.length) {
    financialPickups.value = []
    return
  }

  loadingFinancialStats.value = true
  try {
    financialPickups.value = await Promise.all(
      clientIds.map(async (clientId) => ({ id: clientId, ...(await getEnlevementData(clientId)) }))
    )
  } catch (error) {
    console.error("Statistiques financières indisponibles", error)
    toast("Impossible de charger les statistiques financières", { type: "error" })
  } finally {
    loadingFinancialStats.value = false
  }
}

const lastScannedPackage = computed(() =>
  colisFiltresTries.value.length ? colisFiltresTries.value[colisFiltresTries.value.length - 1] : null
)

/* =========================================================
   Traitement scan centralisé
========================================================= */
async function processScanPayload(text) {
  const payload = normalizeScanText(text)
  if (!payload) return

  const now = Date.now()
  if (now < scanCooldownUntil.value) return
  if (payload === lastQueuedScan.value.text && now - lastQueuedScan.value.at < 4000) return

  lastQueuedScan.value = { text: payload, at: now }
  scanQueue.value.push(payload)

  if (processingScanQueue.value) return

  processingScanQueue.value = true

  try {
    while (scanQueue.value.length) {
      await processScanPayloadNow(scanQueue.value.shift())
    }
  } finally {
    processingScanQueue.value = false
  }
}

async function processScanPayloadNow(text) {
  if (processingScan.value) return

  try {
    processingScan.value = true
    scannedText.value = text

    const parsed = parseAnyScan(text)

    if (!parsed) {
      toast("Code invalide", { type: "error" })
      return
    }

    let newItems = []

    if (parsed.source === "qr") {
      const {
        expediteur,
        destinataire,
        nombreDeColis,
        clientId,
        colisIndex,
        detailIndex,
        coli,
        telephoneDestinataire,
      } = parsed

      if (!clientId) {
        toast("Client introuvable dans le QR", { type: "error" })
        return
      }

      const id = `${clientId}-${colisIndex}-${detailIndex}`

      const deja = chargement.value?.packagesTable?.some((i) => i.id === id)
      if (deja) {
        toast(`⚠️ Le colis ${coli || id} a déjà été scanné.`, {
          type: "info",
          autoClose: 1800,
        })
        return
      }

      const nowIso = new Date().toISOString()

      newItems = [{
        id,
        expediteur,
        destinataire,
        telephoneDestinataire,
        telephoneDestinataireDirect: telephoneDestinataire,
        telephoneDestinataireWhatsapp: "",
        coli,
        nombreDeColis: Number(nombreDeColis) || 0,
        clientId,
        colisIndex,
        detailIndex,
        date: nowIso,
        status: "réceptionné",
        historique: [{ status: "réceptionné", date: nowIso }],
        chargementId: detailId.value,
      }]
    }

    if (parsed.source === "barcode") {
      const { clientId, colisIndex, detailIndex } = parsed

      if (!clientId) {
        toast("Client introuvable dans le barcode", { type: "error" })
        return
      }

      const id = `${clientId}-${colisIndex}-${detailIndex}`

      const deja = chargement.value?.packagesTable?.some((i) => i.id === id)
      if (deja) {
        toast(`⚠️ Le colis ${id} a déjà été scanné.`, {
          type: "info",
          autoClose: 1800,
        })
        return
      }

      newItems = [await buildItemFromEnlevement(clientId, colisIndex, detailIndex)]
    }

    if (parsed.source === "enlevement") {
      if (!parsed.clientId) {
        toast("Enlèvement introuvable dans le QR", { type: "error" })
        return
      }

      const currentIds = new Set((chargement.value?.packagesTable || []).map((item) => item.id))
      newItems = (await buildItemsFromWholeEnlevement(parsed.clientId)).filter((item) => !currentIds.has(item.id))

      if (!newItems.length) {
        toast("Tous les colis de cet enlèvement sont déjà dans le chargement.", {
          type: "info",
          autoClose: 1800,
        })
        return
      }
    }

    if (!newItems.length) {
      toast("Impossible de traiter le scan", { type: "error" })
      return
    }

    const currentList = Array.isArray(chargement.value?.packagesTable)
      ? [...chargement.value.packagesTable]
      : []

    const newList = [...currentList, ...newItems]
    await updateDoc(docRef, { packagesTable: newList })

    chargementSource.value = {
      ...(chargementSource.value || {}),
      packagesTable: newList,
    }

    const byClient = new Map()
    for (const item of newItems) {
      if (!byClient.has(item.clientId)) byClient.set(item.clientId, [])
      byClient.get(item.clientId).push(item)
    }

    for (const [clientId, items] of byClient.entries()) {
      const enlevRef = doc(db, "enlevements", clientId)
      const data = await getEnlevementData(clientId)

      if (data) {
        const arr = Array.isArray(data.colis) ? [...data.colis] : []

        for (const item of items) {
          const group = arr[item.colisIndex]

          if (group?.details?.[item.detailIndex]) {
            group.details = [...group.details]
            group.details[item.detailIndex] = {
              ...group.details[item.detailIndex],
              statutColis: "réceptionné",
            }
            arr[item.colisIndex] = { ...group, details: group.details }
          } else if (group) {
            arr[item.colisIndex] = {
              ...group,
              statutColis: "réceptionné",
            }
          }
        }

        try {
          await updateDoc(enlevRef, { colis: arr })
          enlevementCache.set(clientId, { ...data, colis: arr })
        } catch (statusError) {
          // Le colis est déjà enregistré dans le conteneur. Une restriction de rôle
          // ne doit pas transformer ce succès en faux message d'erreur.
          console.warn("Statut de l'enlèvement non synchronisé après le scan", statusError)
        }
      }
    }

    scanQueue.value = []
    scanCooldownUntil.value = Date.now() + 3500
    toast(newItems.length > 1 ? `✅ ${newItems.length} colis ajoutés avec succès` : "✅ Colis ajouté avec succès", {
      type: "success",
      autoClose: 4000,
    })

    setLocalStatusForItems(newItems, "réceptionné")
  } catch (e) {
    console.error("Erreur pendant le scan :", e)
    const message = String(e?.message || "")
    if (
      message.includes("network") ||
      message.includes("offline") ||
      message.includes("unavailable") ||
      e?.code === "unavailable"
    ) {
      toast("Connexion Firebase indisponible. Vérifie internet puis rescane.", { type: "error" })
    } else {
      toast(e?.message || "Erreur pendant le scan", { type: "error" })
    }
  } finally {
    processingScan.value = false
  }
}

/* =========================================================
   Camera scanner
========================================================= */
async function onDecode(text) {
  await processScanPayload(text)
}

async function toggleScanner() {
  displayScanner.value = !displayScanner.value
  if (!displayScanner.value) return
  await nextTick()
  scannerSection.value?.scrollIntoView({ behavior: "smooth", block: "start" })
}

async function removePackageFromContainer(item, index) {
  const label = item?.coli || "ce colis"
  if (!await confirmToast(`Retirer « ${label} » de ce conteneur ?`)) return

  const targetKey = packageIdentity(item, index)
  removingPackageId.value = targetKey
  try {
    const current = Array.isArray(chargement.value?.packagesTable) ? chargement.value.packagesTable : []
    let removed = false
    const packagesTable = current.filter((candidate, candidateIndex) => {
      if (!removed && (candidate === item || packageIdentity(candidate, candidateIndex) === targetKey)) {
        removed = true
        return false
      }
      return true
    })

    if (!removed) {
      toast("Colis introuvable dans ce conteneur.", { type: "warning" })
      return
    }

    await updateDoc(docRef, { packagesTable })
    chargementSource.value = { ...(chargementSource.value || {}), packagesTable }
    toast("Colis retiré du conteneur.", { type: "success", autoClose: 3000 })
  } catch (error) {
    console.error("Erreur retrait colis du conteneur", error)
    toast("Impossible de retirer le colis du conteneur.", { type: "error", autoClose: 4000 })
  } finally {
    removingPackageId.value = ""
  }
}

/* =========================================================
   MAJ globale des statuts
========================================================= */
async function majStatutChargement() {
  try {
    if (!chargement.value) return

    const now = new Date().toISOString()
    const target = statutSelectionne.value
    const startsTransit = target === "expédié"
    if (startsTransit && authStore.isSuperAdmin && !transitDateInput.value) {
      toast("Choisis la date de départ du conteneur", { type: "warning" })
      return
    }
    const selectedTransitDate = transitDateInput.value
      ? new Date(`${transitDateInput.value}T12:00:00`).toISOString()
      : null
    const selectedEstimatedDate = estimatedDeliveryInput.value
      ? new Date(`${estimatedDeliveryInput.value}T12:00:00`).toISOString()
      : null
    const adjustmentDays = Number(scheduleAdjustmentDays.value || 0)
    const adjustedEstimatedDate = selectedEstimatedDate
      ? new Date(new Date(selectedEstimatedDate).getTime() + adjustmentDays * 86_400_000).toISOString()
      : null
    const containerTransitDate = startsTransit
      ? (authStore.isSuperAdmin && selectedTransitDate
          ? selectedTransitDate
          : chargement.value.transitDate || chargement.value.shippingDate || now)
      : null

    const current = chargement.value.packagesTable || []
    const newTable = current.map((p) => ({
      ...p,
      status: target,
      historique: [...(p.historique || []), { status: target, date: now }],
    }))

    const chargementUpdate = { packagesTable: newTable, statutGlobal: target }
    if (startsTransit) {
      chargementUpdate.transitDate = containerTransitDate
      chargementUpdate.shippingDate = containerTransitDate
      if (adjustedEstimatedDate) chargementUpdate.estimatedDeliveryAt = adjustedEstimatedDate
      chargementUpdate.scheduleAdjustmentDays = adjustmentDays
      chargementUpdate.scheduleReason = String(scheduleReason.value || "").trim()
      chargementUpdate.scheduleUpdatedAt = now
    }
    await updateDoc(docRef, chargementUpdate)
    chargementSource.value = {
      ...(chargementSource.value || {}),
      ...chargementUpdate,
    }

    const byClient = {}
    for (const it of newTable) {
      const legacyIdMatch = String(it.id || "").match(/^(.*)-(\d+)-(\d+)$/)
      const clientId = String(it.clientId || legacyIdMatch?.[1] || "").trim()
      if (!clientId) {
        console.warn("Colis sans identifiant d'enlèvement, synchronisation ignorée", it.id)
        continue
      }
      ;(byClient[clientId] ||= []).push({
        ...it,
        clientId,
        colisIndex: Number.isInteger(Number(it.colisIndex))
          ? Number(it.colisIndex)
          : Number(legacyIdMatch?.[2] || 0),
        detailIndex: Number.isInteger(Number(it.detailIndex))
          ? Number(it.detailIndex)
          : Number(legacyIdMatch?.[3] || 0),
      })
    }

    for (const [clientId, list] of Object.entries(byClient)) {
      const refDoc = doc(db, "enlevements", clientId)
      const snap = await getDoc(refDoc)
      if (!snap.exists()) continue

      const data = snap.data()
      const arr = Array.isArray(data.colis) ? [...data.colis] : []

      for (const it of list) {
        const g = arr[it.colisIndex]
        if (!g?.details?.[it.detailIndex]) continue

        g.details = [...g.details]
        g.details[it.detailIndex] = {
          ...g.details[it.detailIndex],
          statutColis: target,
        }
      }

      const enlevementUpdate = {
        colis: arr,
        deliveryStatus: target,
      }
      if (startsTransit) {
        const destination = String(data.destination || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
        const configuredDelays = companyProfile.value?.deliveryDelays || {}
        const destinationKey = destination.includes("douala")
          ? "douala"
          : destination.includes("yaounde")
            ? "yaounde"
            : destination.includes("kribi")
              ? "kribi"
              : "cameroun"
        const transitDays = Number(configuredDelays[destinationKey] || configuredDelays.cameroun || 0)

        enlevementUpdate.transitDate = containerTransitDate
        enlevementUpdate.shippingDate = containerTransitDate
        const defaultEstimate = transitDays > 0
          ? new Date(new Date(containerTransitDate).getTime() + transitDays * 86_400_000).toISOString()
          : null
        const currentEstimate = data.estimatedDeliveryAt
          ? (typeof data.estimatedDeliveryAt?.toDate === "function"
              ? data.estimatedDeliveryAt.toDate().toISOString()
              : new Date(data.estimatedDeliveryAt).toISOString())
          : null
        const baseEstimate = selectedEstimatedDate || currentEstimate || defaultEstimate
        if (baseEstimate) {
          enlevementUpdate.estimatedDeliveryAt = new Date(
            new Date(baseEstimate).getTime() + adjustmentDays * 86_400_000
          ).toISOString()
        }
        enlevementUpdate.scheduleAdjustmentDays = adjustmentDays
        enlevementUpdate.scheduleReason = String(scheduleReason.value || "").trim()
        enlevementUpdate.scheduleUpdatedAt = now
      }

      await updateDoc(refDoc, enlevementUpdate)
      enlevementCache.set(clientId, { ...data, ...enlevementUpdate })
    }

    toast("📦 Statuts mis à jour", {
      type: "success",
      autoClose: 1800,
    })

    setLocalStatusForItems(newTable, target)
    scheduleAdjustmentDays.value = 0
  } catch (e) {
    console.error("❌ Erreur MAJ statuts :", e)
    toast("❌ Erreur lors de la mise à jour", { type: "error" })
  }
}

async function callTrackingLinksFunction(dryRun) {
  const user = auth.currentUser
  if (!user) throw new Error("Session expirée. Reconnecte-toi.")
  const token = await user.getIdToken()
  const response = await fetch(`${FUNCTIONS_BASE_URL}/sendContainerTrackingLinks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ chargementId: detailId.value, dryRun }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Impossible d'envoyer les liens de suivi")
  }
  return payload
}

async function sendTrackingLinksToShippers() {
  if (sendingTrackingLinks.value) return
  sendingTrackingLinks.value = true

  try {
    const preview = await callTrackingLinksFunction(true)
    if (!preview.recipientCount) {
      toast("Aucun expéditeur avec téléphone et numéro de suivi.", { type: "warning" })
      return
    }

    const confirmation = await confirmToast(
      `Envoyer les liens de suivi par SMS à ${preview.recipientCount} expéditeur(s) `
      + `pour ${preview.shipmentCount} envoi(s) ?\n\n`
      + `${preview.skipped || 0} enlèvement(s) seront ignorés faute de téléphone ou de numéro de suivi.`
    )
    if (!confirmation) return

    const result = await callTrackingLinksFunction(false)
    toast(
      `${result.sent} SMS envoyé(s)${result.failed ? `, ${result.failed} échec(s)` : ""}.`,
      { type: result.failed ? "warning" : "success", autoClose: 2500 }
    )
  } catch (error) {
    console.error("Erreur envoi liens de suivi :", error)
    const message = error instanceof TypeError && error.message === "Failed to fetch"
      ? "Service d'envoi indisponible. Vérifie le déploiement de la fonction puis réessaie."
      : error.message || "Erreur lors de l'envoi des liens"
    toast(message, { type: "error", autoClose: 4500 })
  } finally {
    sendingTrackingLinks.value = false
  }
}

/* =========================================================
   PDF Colissage
========================================================= */
function drawHeader(pdf) {
  pdf.setFontSize(14)
  pdf.text("TRANSPORT FOMEK", 20, 18)
  pdf.setFontSize(11)
  pdf.text("15 rue des Écoles, 95500 Le Thillay", 20, 24)
  pdf.text("Tél : 06 95 93 19 92", 20, 30)
  pdf.setFontSize(16)
  pdf.text("LISTE DE COLISSAGE", 105, 18, { align: "center" })
}

function drawMeta(pdf) {
  const chargeName = getChargeName.value
  const chargeDate = getChargeDateStr.value

  const portDepart = "Le Havre"
  const destinations = [
    chargement.value?.destination,
    chargement.value?.portArrivee,
    ...(chargement.value?.packagesTable || []).map((item) => item.destination),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

  const portArrivee = destinations.includes("kribi")
    ? "Port Autonome de Kribi"
    : "Port Autonome de Douala"
  const incoterm = "CFR"
  const tc = chargement.value?.tc || chargement.value?.contenaire || ""
  const plomb = chargement.value?.plomb || ""

  pdf.setFontSize(11)
  let y = 40

  pdf.text(`Port de départ : ${portDepart}`, 20, y)
  pdf.text(`Port d'arrivée : ${portArrivee}`, 120, y)
  y += 8

  pdf.text(`Incoterm : ${incoterm}`, 20, y)
  pdf.text(`Chargement : ${chargeName}`, 120, y)
  y += 8

  if (tc || plomb) {
    pdf.text(`TC : ${tc || "-"}`, 20, y)
    pdf.text(`Plomb : ${plomb || "-"}`, 120, y)
    y += 8
  }

  pdf.text(`Date : ${chargeDate}`, 20, y)
}

function drawTableHeader(pdf, x, y, colW, headerH = 9) {
  pdf.setFontSize(12)
  pdf.setFillColor(235, 235, 235)
  const totalW = colW.reduce((a, b) => a + b, 0)
  pdf.rect(x, y, totalW, headerH, "F")
  const textY = y + headerH - 3

  pdf.text("Qté", x + 3, textY)
  pdf.text("Détail", x + colW[0] + 3, textY)
  pdf.text("Poids (kg)", x + colW[0] + colW[1] + 3, textY)
  pdf.text("Valeur (€)", x + colW[0] + colW[1] + colW[2] + 3, textY)
}

function exportColissagePDF() {
  try {
    const pdf = new jsPDF("p", "mm", "a4")

    drawHeader(pdf)
    drawMeta(pdf)

    const x = 20
    let y = 68
    const colW = [20, 100, 30, 30]
    const headerH = 9
    const rowH = 9

    drawTableHeader(pdf, x, y, colW, headerH)
    y += headerH
    pdf.setFontSize(11)

    const rows = colissage.value.length
      ? colissage.value.map((r) => ({
          qte: String(r.qty),
          detail: r.label,
          poids: "",
          valeur: "",
        }))
      : []

    const bottomMargin = 28
    const pageH = 297
    const limitY = pageH - bottomMargin

    if (rows.length === 0) {
      pdf.text("Aucun article scanné.", x, y + 6)
      y += rowH
    } else {
      for (const row of rows) {
        if (y + rowH > limitY) {
          pdf.addPage()
          drawHeader(pdf)
          y = 68
          drawTableHeader(pdf, x, y, colW, headerH)
          y += headerH
        }

        pdf.rect(x, y, colW[0], rowH)
        pdf.text(row.qte, x + 3, y + rowH - 2.5)

        pdf.rect(x + colW[0], y, colW[1], rowH)
        pdf.text(String(row.detail), x + colW[0] + 3, y + rowH - 2.5)

        pdf.rect(x + colW[0] + colW[1], y, colW[2], rowH)
        pdf.text(row.poids || "", x + colW[0] + colW[1] + 3, y + rowH - 2.5)

        pdf.rect(x + colW[0] + colW[1] + colW[2], y, colW[3], rowH)
        pdf.text(
          row.valeur || "",
          x + colW[0] + colW[1] + colW[2] + 3,
          y + rowH - 2.5
        )

        y += rowH
      }
    }

    if (y + rowH > limitY) {
      pdf.addPage()
      drawHeader(pdf)
      y = 40
    }

    pdf.setFontSize(12)
    pdf.text(`TOTAL : ${totalQty.value}`, x, y + 8)
    y += 14

    const attestation = [
      "Nous attestons n’avoir introduit aucun produit dangereux, réglementé, interdit ou volé.",
      "Nous confirmons que les biens déclarés ont été acquis légalement.",
      "L’inventaire est établi sous la responsabilité exclusive de l’expéditeur et peut",
      "être vérifié par les autorités compétentes à tout moment.",
    ]

    pdf.setFontSize(10)
    for (const line of attestation) {
      pdf.text(line, x, y)
      y += 6
    }

    y += 4
    pdf.text(
      "Fait à : ____________________________, le ____ / ____ / ________",
      x,
      y
    )
    y += 8
    pdf.text("Nom / Signature :", x, y)

    pdf.save(`colissage_${detailId.value}.pdf`)
  } catch (e) {
    console.error(e)
    toast("Erreur export PDF", { type: "error" })
  }
}

/* =========================================================
   PDF Liste scannée groupée
========================================================= */
function drawScannedListHeader(pdf) {
  pdf.setFontSize(14)
  pdf.text("TRANSPORT FOMEK", 20, 18)
  pdf.setFontSize(11)
  pdf.text("15 rue des Écoles, 95500 Le Thillay", 20, 24)
  pdf.text("Tél : 06 95 93 19 92", 20, 30)
  pdf.setFontSize(16)
  pdf.text("LISTE DES COLIS SCANNÉS", 105, 18, { align: "center" })
}

function drawScannedListMeta(pdf) {
  const chargeName = getChargeName.value
  const chargeDate = getChargeDateStr.value

  pdf.setFontSize(11)
  let y = 40
  pdf.text(`Chargement : ${chargeName}`, 20, y)
  y += 8
  pdf.text(`Date : ${chargeDate}`, 20, y)
  y += 8
  pdf.text(`Nombre de groupes : ${scannedRecipientGroups.value.length}`, 20, y)
  y += 8
  pdf.text(`Nombre total de lignes scannées : ${colisFiltresTries.value.length}`, 20, y)
}

function exportListeScanneePDF() {
  try {
    const pdf = new jsPDF("p", "mm", "a4")

    drawScannedListHeader(pdf)
    drawScannedListMeta(pdf)

    let y = 78
    const pageH = 297
    const bottomMargin = 20
    const limitY = pageH - bottomMargin

    if (!scannedRecipientGroups.value.length) {
      pdf.setFontSize(12)
      pdf.text("Aucun colis scanné.", 20, y)
      pdf.save(`liste_scannes_${detailId.value}.pdf`)
      return
    }

    for (const group of scannedRecipientGroups.value) {
      if (y > limitY - 30) {
        pdf.addPage()
        drawScannedListHeader(pdf)
        y = 40
      }

      pdf.setFillColor(230, 230, 230)
      pdf.rect(20, y, 170, 10, "F")
      pdf.setFontSize(12)
      pdf.text(`Destinataire : ${group.destinataire}`, 23, y + 7)
      y += 7

      pdf.setFontSize(10)

      if (group.expediteur) {
        y += 6
        pdf.text(`Expéditeur(s) : ${group.expediteur}`, 24, y)
      }

      if (group.telephoneDestinataire) {
        y += 6
        pdf.text(`Téléphone direct : ${group.telephoneDestinataire}`, 24, y)
      }

      if (group.telephoneDestinataireWhatsapp) {
        y += 6
        pdf.text(`WhatsApp : ${group.telephoneDestinataireWhatsapp}`, 24, y)
      }

      y += 8

      pdf.setFillColor(245, 245, 245)
      pdf.rect(24, y, 25, 8, "F")
      pdf.rect(49, y, 70, 8, "F")
      pdf.rect(119, y, 30, 8, "F")
      pdf.rect(149, y, 35, 8, "F")

      pdf.text("Date", 26, y + 5.5)
      pdf.text("Colis", 51, y + 5.5)
      pdf.text("Nb coli", 121, y + 5.5)
      pdf.text("Statut", 151, y + 5.5)

      y += 8

      for (const item of group.items) {
        if (y > limitY - 12) {
          pdf.addPage()
          drawScannedListHeader(pdf)
          y = 40
        }

        pdf.rect(24, y, 25, 8)
        pdf.rect(49, y, 70, 8)
        pdf.rect(119, y, 30, 8)
        pdf.rect(149, y, 35, 8)

        const dateText = formatDateShort(item.date)
        const coliText = String(item.coli || "")
        const qtyText = String(item.nombreDeColis || 0)
        const statutText = String(getStatutColis(item) || "-")

        pdf.setFontSize(9)
        pdf.text(dateText, 26, y + 5.5)
        pdf.text(coliText.slice(0, 38), 51, y + 5.5)
        pdf.text(qtyText, 121, y + 5.5)
        pdf.text(statutText.slice(0, 18), 151, y + 5.5)

        y += 8
      }

      if (y > limitY - 10) {
        pdf.addPage()
        drawScannedListHeader(pdf)
        y = 40
      }

      pdf.setFontSize(10)
      pdf.text(
        `Total ${group.destinataire} : ${group.items.length} ligne(s) scannée(s) / ${group.totalColis} coli(s)`,
        24,
        y + 6
      )
      y += 14
    }

    if (y > limitY - 12) {
      pdf.addPage()
      drawScannedListHeader(pdf)
      y = 40
    }

    const totalGlobalColis = scannedRecipientGroups.value.reduce(
      (sum, group) => sum + Number(group.totalColis || 0),
      0
    )

    pdf.setFontSize(12)
    pdf.text(
      `TOTAL GLOBAL : ${colisFiltresTries.value.length} ligne(s) scannée(s) / ${totalGlobalColis} coli(s)`,
      20,
      y + 8
    )

    pdf.save(`liste_scannes_groupes_${detailId.value}.pdf`)
  } catch (e) {
    console.error(e)
    toast("Erreur export liste scannée", { type: "error" })
  }
}

/* =========================================================
   Lifecycle
========================================================= */
onMounted(async () => {
  try {
    const pSnap = await getDoc(doc(db, "company", "profile"))
    if (pSnap.exists()) companyProfile.value = pSnap.data()
  } catch (e) {
    console.warn("Profil entreprise non chargé", e)
  }

  await chargerStatutsColis()

})
</script>

<template>
  <section class="w-full max-w-full min-w-0 space-y-4 overflow-x-hidden sm:space-y-6">
    <div class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Liste de colissage</p>
          <h2 class="mt-2 break-words text-xl font-bold text-slate-950 sm:text-2xl">{{ getChargeName }}</h2>
          <p class="mt-2 text-sm text-slate-500">{{ getChargeDateStr }}</p>
        </div>

        <div class="grid w-full min-w-0 gap-2 sm:grid-cols-2 xl:flex xl:w-auto">
          <button
            class="w-full rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-800 xl:w-auto"
            type="button"
            @click="toggleScanner"
          >
            {{ displayScanner ? "Arreter camera" : "Scan camera" }}
          </button>

          <button
            class="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-cyan-200 hover:text-cyan-800 xl:w-auto"
            type="button"
            @click="exportColissagePDF"
          >
            PDF colissage
          </button>

          <button
            class="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-cyan-200 hover:text-cyan-800 xl:w-auto"
            type="button"
            @click="exportListeScanneePDF"
          >
            PDF scans
          </button>

          <button
            v-if="authStore.isSuperAdmin"
            class="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
            type="button"
            :disabled="sendingTrackingLinks || !colisFiltresTries.length"
            @click="sendTrackingLinksToShippers"
          >
            {{ sendingTrackingLinks ? "Préparation…" : "Envoyer les suivis" }}
          </button>
        </div>
      </div>
    </div>

    <section
      v-if="displayScanner"
      ref="scannerSection"
      class="scanner-card min-w-0 scroll-mt-20 overflow-hidden rounded-lg border border-slate-900 bg-slate-950 shadow-sm"
    >
      <div class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <p class="text-sm font-bold text-white">Caméra de scan</p>
          <p class="mt-0.5 text-xs text-slate-400">Place le QR code ou le code-barres dans le cadre.</p>
        </div>
        <button class="rounded-md bg-white/10 px-3 py-1.5 text-xs font-bold text-white" type="button" @click="toggleScanner">Fermer</button>
      </div>
      <div class="scanner-shell flex min-h-[280px] w-full max-w-full items-center justify-center overflow-hidden">
        <StreamBarcodeReader @decode="onDecode" />
      </div>
    </section>

    <div class="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p class="text-sm font-medium text-slate-500">Lignes scannées</p>
        <p class="mt-2 text-3xl font-bold text-slate-950">{{ totalScannedLines }}</p>
      </article>

      <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p class="text-sm font-medium text-slate-500">Total déclaré</p>
        <p class="mt-2 text-3xl font-bold text-slate-950">{{ totalDeclaredPackages }}</p>
      </article>

      <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p class="text-sm font-medium text-slate-500">Articles colissage</p>
        <p class="mt-2 text-3xl font-bold text-slate-950">{{ totalQty }}</p>
      </article>

      <article class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p class="text-sm font-medium text-slate-500">Expéditeurs</p>
        <p class="mt-2 text-3xl font-bold text-slate-950">{{ totalShippers }}</p>
      </article>
    </div>

    <section v-if="canViewFinancial" class="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-emerald-700">Bilan du conteneur</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950">Statistiques financières de l’envoi</h3>
          <p class="mt-1 text-sm text-slate-500">
            Chaque enlèvement est compté une seule fois, même s’il contient plusieurs colis.
          </p>
        </div>
        <span class="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {{ financialPickups.length }} enlèvement{{ financialPickups.length > 1 ? "s" : "" }}
        </span>
      </div>

      <div v-if="loadingFinancialStats" class="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-500">
        Calcul des statistiques…
      </div>

      <div v-else class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article class="rounded-lg border border-cyan-100 bg-cyan-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Valeur totale</p>
          <p class="mt-2 text-2xl font-black text-slate-950">{{ formatMoney(financialStats.total) }}</p>
          <p class="mt-1 text-xs text-slate-500">Somme des prix des enlèvements</p>
        </article>

        <article class="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-emerald-700">Déjà encaissé</p>
          <p class="mt-2 text-2xl font-black text-emerald-800">{{ formatMoney(financialStats.paid) }}</p>
          <p class="mt-1 text-xs text-emerald-700">{{ financialStats.paidFiles }} dossier(s) soldé(s)</p>
        </article>

        <article class="rounded-lg border border-amber-100 bg-amber-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-amber-700">Reste à encaisser</p>
          <p class="mt-2 text-2xl font-black text-amber-800">{{ formatMoney(financialStats.due) }}</p>
          <p class="mt-1 text-xs text-amber-700">
            {{ financialStats.partialFiles }} partiel(s) · {{ financialStats.unpaidFiles }} non payé(s)
          </p>
        </article>

        <article class="rounded-lg border border-violet-100 bg-violet-50 p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-bold uppercase tracking-wide text-violet-700">Taux d’encaissement</p>
            <strong class="text-xl text-violet-800">{{ collectionRate }} %</strong>
          </div>
          <div class="mt-4 h-2.5 overflow-hidden rounded-full bg-violet-100">
            <div
              class="h-full rounded-full bg-violet-600 transition-all duration-500"
              :style="{ width: `${collectionRate}%` }"
            ></div>
          </div>
          <p class="mt-3 text-xs text-slate-500">Part actuellement réglée</p>
        </article>
      </div>
    </section>

    <div class="grid min-w-0 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <aside class="min-w-0 space-y-6">
        <section class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h3 class="font-bold text-slate-950">Scan opérationnel</h3>
              <p class="mt-1 break-words text-sm leading-6 text-slate-500">
                Utilise la caméra pour ajouter le colis au chargement et le marquer réceptionné.
              </p>
            </div>
            <span
              class="w-fit shrink-0 rounded-md px-2.5 py-1 text-xs font-bold"
              :class="processingScan ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'"
            >
              {{ processingScan ? "Traitement" : "Prêt" }}
            </span>
          </div>

          <div class="mt-4 space-y-3">
            <div class="rounded-lg bg-slate-50 p-3">
              <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Dernier scan</p>
              <p class="mt-1 break-all text-sm text-slate-700">{{ scannedText || "Aucun scan pour le moment" }}</p>
            </div>
          </div>
        </section>

        <section class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 class="font-bold text-slate-950">Statut global</h3>
          <p class="mt-1 text-sm text-slate-500">Applique un statut à tous les colis du chargement.</p>

          <div class="mt-4 space-y-3">
            <select
              v-model="statutSelectionne"
              class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            >
              <option value="réceptionné">Réceptionné</option>
              <option value="expédié">Expédié</option>
              <option value="disponible pour retrait">Disponible pour retrait</option>
              <option value="livré">Livré</option>
            </select>

            <div
              v-if="authStore.isSuperAdmin && statutSelectionne === 'expédié'"
              class="rounded-lg border border-cyan-200 bg-cyan-50 p-3"
            >
              <label for="container-transit-date" class="block text-xs font-bold uppercase tracking-wide text-cyan-900">
                Date de départ du conteneur
              </label>
              <input
                id="container-transit-date"
                v-model="transitDateInput"
                type="date"
                class="mt-2 block w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
              <p class="mt-2 text-xs leading-5 text-cyan-800">
                Cette date sera appliquée à tous les colis et recalculera leur arrivée estimée.
              </p>

              <label for="container-estimated-date" class="mt-4 block text-xs font-bold uppercase tracking-wide text-cyan-900">
                Arrivée estimée
              </label>
              <input
                id="container-estimated-date"
                v-model="estimatedDeliveryInput"
                type="date"
                class="mt-2 block w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />

              <label for="container-adjustment-days" class="mt-4 block text-xs font-bold uppercase tracking-wide text-cyan-900">
                Ajustement exceptionnel (jours)
              </label>
              <input
                id="container-adjustment-days"
                v-model.number="scheduleAdjustmentDays"
                type="number"
                step="1"
                class="mt-2 block w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder="Ex. 5 pour un retard, -3 pour une avance"
              />
              <div class="mt-2 flex flex-wrap gap-2">
                <button v-for="days in [1, 3, 7]" :key="days" type="button" class="rounded-md border border-cyan-200 bg-white px-2.5 py-1 text-xs font-bold text-cyan-800" @click="scheduleAdjustmentDays += days">+{{ days }} j</button>
                <button type="button" class="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-bold text-emerald-700" @click="scheduleAdjustmentDays -= 1">-1 j</button>
              </div>

              <label for="container-schedule-reason" class="mt-4 block text-xs font-bold uppercase tracking-wide text-cyan-900">
                Motif affiché au client (facultatif)
              </label>
              <textarea
                id="container-schedule-reason"
                v-model="scheduleReason"
                rows="2"
                maxlength="180"
                class="mt-2 block w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder="Ex. Retard portuaire, météo, arrivée anticipée…"
              ></textarea>
            </div>

            <button
              class="flex w-full justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
              type="button"
              @click="majStatutChargement"
            >
              Mettre à jour
            </button>
          </div>
        </section>

        <section class="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 class="font-bold text-slate-950">Dernier colis ajouté</h3>
          <div v-if="lastScannedPackage" class="mt-3 space-y-2 text-sm">
            <p><span class="font-semibold text-slate-500">Colis :</span> {{ lastScannedPackage.coli || "-" }}</p>
            <p><span class="font-semibold text-slate-500">Expéditeur :</span> {{ lastScannedPackage.expediteur || "-" }}</p>
            <p><span class="font-semibold text-slate-500">Destinataire :</span> {{ lastScannedPackage.destinataire || "-" }}</p>
          </div>
          <p v-else class="mt-3 text-sm text-slate-500">Aucun colis scanné.</p>
        </section>
      </aside>

      <div class="min-w-0 space-y-6">
        <section class="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div class="min-w-0">
              <h3 class="font-bold text-slate-950">Colis scannés</h3>
              <p class="text-sm text-slate-500">Colis regroupés par destinataire, destinataires et articles classés de A à Z.</p>
            </div>
            <label class="mt-3 block w-full sm:mt-0 sm:max-w-sm">
              <span class="sr-only">Rechercher un colis</span>
              <input
                v-model="packageSearch"
                type="search"
                class="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder="Colis, expéditeur, destinataire, téléphone…"
              />
            </label>
          </div>

          <div class="md:hidden divide-y divide-slate-100">
            <article v-for="(item, i) in displayedContainerPackages" :key="item.id || i" class="min-w-0 p-4">
              <h4 v-if="startsRecipientGroup(i)" class="mb-4 rounded-lg bg-cyan-50 p-3 font-bold text-cyan-950">{{ item.destinataire?.trim() || 'Sans destinataire' }}</h4>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="break-words font-bold text-slate-950">{{ item.coli || "Colis" }}</p>
                  <p class="mt-1 break-words text-sm text-slate-500">{{ item.expediteur }} vers {{ item.destinataire }}</p>
                </div>
                <span class="w-fit shrink-0 rounded-md bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                  {{ getStatutColis(item) }}
                </span>
              </div>
              <div class="mt-3 grid gap-2 text-sm text-slate-600">
                <p>Direct : {{ item.telephoneDestinataireDirect || item.telephoneDestinataire || "-" }}</p>
                <p>WhatsApp : {{ item.telephoneDestinataireWhatsapp || "-" }}</p>
                <p>Total colis : {{ item.nombreDeColis || 0 }}</p>
                <p>Date : {{ formatDateTime(item.date) }}</p>
              </div>
              <button
                class="mt-4 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                :disabled="removingPackageId === packageIdentity(item, i)"
                @click="removePackageFromContainer(item, i)"
              >
                {{ removingPackageId === packageIdentity(item, i) ? "Retrait…" : "Retirer du conteneur" }}
              </button>
            </article>

            <p v-if="!displayedContainerPackages.length" class="px-5 py-10 text-center text-slate-500">
              {{ packageSearch ? "Aucun colis ne correspond à la recherche." : "Aucun colis scanné pour le moment." }}
            </p>
          </div>

          <div class="hidden overflow-x-auto md:block">
            <table class="min-w-[980px] w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-5 py-3">Expéditeur</th>
                  <th class="px-5 py-3">Destinataire</th>
                  <th class="px-5 py-3">Direct</th>
                  <th class="px-5 py-3">WhatsApp</th>
                  <th class="px-5 py-3">Colis</th>
                  <th class="px-5 py-3">Total colis</th>
                  <th class="px-5 py-3">Date scan</th>
                  <th class="px-5 py-3">Statut</th>
                  <th class="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody class="divide-y divide-slate-100">
                <template v-for="(item, i) in displayedContainerPackages" :key="item.id || i">
                <tr v-if="startsRecipientGroup(i)" class="bg-cyan-50">
                  <th colspan="9" scope="rowgroup" class="px-5 py-3 text-left font-bold text-cyan-950">Destinataire : {{ item.destinataire?.trim() || 'Sans destinataire' }}</th>
                </tr>
                <tr class="hover:bg-slate-50">
                  <td class="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">{{ item.expediteur || "-" }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.destinataire || "-" }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.telephoneDestinataireDirect || item.telephoneDestinataire || "-" }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.telephoneDestinataireWhatsapp || "-" }}</td>
                  <td class="px-5 py-4 text-slate-600">{{ item.coli || "-" }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.nombreDeColis || 0 }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-slate-600">{{ formatDateTime(item.date) }}</td>
                  <td class="whitespace-nowrap px-5 py-4">
                    <span class="rounded-md bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                      {{ getStatutColis(item) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-5 py-4 text-right">
                    <button
                      class="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      :disabled="removingPackageId === packageIdentity(item, i)"
                      @click="removePackageFromContainer(item, i)"
                    >
                      {{ removingPackageId === packageIdentity(item, i) ? "Retrait…" : "Retirer" }}
                    </button>
                  </td>
                </tr>

                </template>
                <tr v-if="!displayedContainerPackages.length">
                  <td class="px-5 py-10 text-center text-slate-500" colspan="9">
                    {{ packageSearch ? "Aucun colis ne correspond à la recherche." : "Aucun colis scanné pour le moment." }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div class="min-w-0">
              <h3 class="font-bold text-slate-950">Tableau de colissage</h3>
              <p class="text-sm text-slate-500">Regroupement automatique par type d’article.</p>
            </div>
            <button
              class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-200 hover:text-cyan-800 sm:w-auto"
              type="button"
              @click="exportColissagePDF"
            >
              Export PDF
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-5 py-3">Article</th>
                  <th class="px-5 py-3">Quantité</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="row in colissage" :key="row.label" class="hover:bg-slate-50">
                  <td class="px-5 py-4 font-semibold capitalize text-slate-950">{{ row.label }}</td>
                  <td class="px-5 py-4 text-slate-600">{{ row.qty }}</td>
                </tr>
                <tr v-if="!colissage.length">
                  <td class="px-5 py-10 text-center text-slate-500" colspan="2">
                    Pas encore de données de colissage.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
table {
  border-collapse: collapse;
}

.scanner-shell :deep(video),
.scanner-shell :deep(canvas),
.scanner-shell :deep(svg),
.scanner-shell :deep(div) {
  max-width: 100%;
}

.scanner-shell :deep(video),
.scanner-shell :deep(canvas) {
  height: auto;
  object-fit: contain;
}

@media (max-width: 640px) {
  .scanner-card {
    margin-left: -0.25rem;
    margin-right: -0.25rem;
  }

  .scanner-shell {
    min-height: 240px;
    max-height: 52vh;
  }

  .scanner-shell :deep(video),
  .scanner-shell :deep(canvas) {
    width: 100%;
    max-height: 52vh;
    object-fit: cover;
  }
}

th,
td {
  vertical-align: top;
}
</style>
