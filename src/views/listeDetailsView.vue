<script setup>
import { ref, computed, watch, nextTick, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useFirestore, useCollection, useDocument } from "vuefire"
import { arrayUnion, collection, doc, updateDoc, deleteDoc, getDoc, getDocs, addDoc, serverTimestamp } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { jsPDF } from "jspdf"
import QrcodeVue from "qrcode.vue"
import JsBarcode from "jsbarcode"
import { format } from "date-fns"
import frLocale from "date-fns/locale/fr"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import Form from "../views/form.vue"
import { logo } from "../constants.js"
import ImageGallery from "../components/ImageGallery.vue"
import { useAuthStore } from "../stores/useAuthStore.js"

const route = useRoute()
const router = useRouter()
const db = useFirestore()
const auth = getAuth()
const authStore = useAuthStore()
const detailId = ref(route.params.id)
const FUNCTIONS_BASE_URL = "https://us-central1-aarontravelgestion.cloudfunctions.net"

const enlevementsCol = collection(db, "enlevements")
const datas = useCollection(enlevementsCol)
const chargements = useCollection(collection(db, "chargements"))
const docRef = doc(db, "enlevements", detailId.value)
const clientSource = useDocument(docRef)

const client = computed(() => {
  const fromCollection = datas.value.find((d) => d.id === detailId.value) || {}
  const fromDocument = clientSource.value || {}
  return {
    ...fromCollection,
    ...fromDocument,
    id: detailId.value,
  }
})
const sortedChargements = computed(() =>
  [...(chargements.value || [])].sort((a, b) => {
    const da = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime()
    const dbb = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime()
    return dbb - da
  })
)

const addToLoadingModalRef = ref(null)
const updateModalRef = ref(null)
const selectedChargementId = ref("")
const selectedPackageIds = ref([])
const addingToChargement = ref(false)
const creatingClientSpace = ref(false)
const sendingTrackingLink = ref(false)
const selectedPackagesCount = computed(() => selectedPackageIds.value.length)
const isAdminView = computed(() => authStore.initialized && authStore.role !== "client")
const isSuperAdminView = computed(() => authStore.initialized && authStore.isSuperAdmin)
const canSendTrackingLink = computed(() => {
  const status = String(client.value?.deliveryStatus || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return status.includes("expedi") || status.includes("transit") || Boolean(client.value?.transitDate)
})

function openUpdateModal() {
  updateModalRef.value?.showModal()
}

function closeUpdateModal() {
  updateModalRef.value?.close()
}

const customer = ref({})
watch(clientSource, (src) => {
  customer.value = { ...src }
})

const packageRows = computed(() => {
  const rows = []
  const colisList = Array.isArray(client.value?.colis) ? client.value.colis : []

  colisList.forEach((item, colisIndex) => {
    if (Array.isArray(item.details) && item.details.length) {
      item.details.forEach((detail, detailIndex) => {
        rows.push({
          id: `${colisIndex}-${detailIndex}`,
          name: detail.coli || buildColiLabel(item, colisIndex, detailIndex),
          group: item.nom || "Colis",
          status: detail.statutColis || "En attente",
          deliveredAt: detail.deliveredAt || "",
          colisIndex,
          detailIndex,
        })
      })
      return
    }

    const total = item.quantite && item.quantite > 1 ? item.quantite : 1
    for (let i = 0; i < total; i++) {
      rows.push({
        id: `${colisIndex}-${i}`,
        name: buildColiLabel(item, colisIndex, i),
        group: item.nom || "Colis",
        status: item.statutColis || "En attente",
        deliveredAt: item.deliveredAt || "",
        colisIndex,
        detailIndex: i,
      })
    }
  })

  return rows
})

const packageLoadingById = computed(() => {
  const map = new Map()

  for (const chargement of sortedChargements.value) {
    const packages = Array.isArray(chargement.packagesTable) ? chargement.packagesTable : []

    for (const item of packages) {
      const currentClientId = String(detailId.value)
      const itemId = String(item.id || "")
      const itemClientId = String(item.clientId || item.enlevementId || "")
      const belongsToCurrentPickup =
        itemClientId === currentClientId || itemId.startsWith(`${currentClientId}-`)

      if (!belongsToCurrentPickup) continue

      let colisIndex = Number(item.colisIndex)
      let detailIndex = Number(item.detailIndex)
      const legacyIndexes = itemId.match(/-(\d+)-(\d+)$/)

      if (!Number.isInteger(colisIndex) && legacyIndexes) colisIndex = Number(legacyIndexes[1])
      if (!Number.isInteger(detailIndex) && legacyIndexes) detailIndex = Number(legacyIndexes[2])
      if (!Number.isInteger(colisIndex)) colisIndex = 0
      if (!Number.isInteger(detailIndex)) detailIndex = 0

      const canonicalKey = `${currentClientId}-${colisIndex}-${detailIndex}`
      if (map.has(canonicalKey)) continue

      map.set(canonicalKey, {
        chargementId: chargement.id,
        contenaire: chargement.contenaire || chargement.container || "Conteneur",
        date: chargement.date || chargement.createdAt || item.date || "",
      })
    }
  }

  return map
})

function getPackageLoadingInfo(row) {
  return packageLoadingById.value.get(`${detailId.value}-${row.colisIndex}-${row.detailIndex}`) || null
}

const pickupContainerNames = computed(() =>
  [...new Set([...packageLoadingById.value.values()].map((item) => item.contenaire).filter(Boolean))]
)

const pickupContainerLabel = computed(() =>
  pickupContainerNames.value.length ? pickupContainerNames.value.join(", ") : "Non affecté"
)

const deliveredPackages = computed(() =>
  packageRows.value.filter((item) => String(item.status).toLowerCase() === "livré" || item.status === true).length
)

const totalPackages = computed(() => packageRows.value.length || Number(client.value?.nombreDeColis || 0))
const allPackagesDelivered = computed(() => totalPackages.value > 0 && deliveredPackages.value === totalPackages.value)
const deliveryHistory = computed(() =>
  [...(Array.isArray(client.value?.deliveryHistory) ? client.value.deliveryHistory : [])].sort((a, b) => {
    const da = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime()
    const dbb = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime()
    return dbb - da
  })
)

const paymentBadgeClass = computed(() => {
  if (client.value?.statut === "Payé") return "bg-green-50 text-green-700"
  if (client.value?.statut === "Reste à payer") return "bg-amber-50 text-amber-700"
  return "bg-red-50 text-red-700"
})

const deliveryBadgeClass = computed(() => {
  const status = String(client.value?.deliveryStatus || "En attente").toLowerCase()
  if (status === "livré") return "bg-green-50 text-green-700"
  if (status === "expédié" || status === "disponible pour retrait") return "bg-cyan-50 text-cyan-800"
  if (status === "réceptionné") return "bg-teal-50 text-teal-700"
  return "bg-slate-100 text-slate-700"
})

function formatDateTime(s) {
  if (!s) return "-"
  const d = new Date(s)
  return format(d, "EEEE d MMMM yyyy - HH'h' mm", { locale: frLocale })
}

function formatCreatedAt(value) {
  if (!value) return "-"
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value)
  return format(d, "EEEE d MMMM yyyy - HH'h' mm", { locale: frLocale })
}

function toValidDate(value) {
  if (!value) return null
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatShortDate(value) {
  const date = toValidDate(value)
  return date ? format(date, "dd/MM/yyyy") : "-"
}

function openAddToLoadingModal() {
  selectedChargementId.value = sortedChargements.value[0]?.id || ""
  if (!selectedPackageIds.value.length) {
    selectedPackageIds.value = packageRows.value.map((row) => row.id)
  }
  addToLoadingModalRef.value?.showModal()
}

function closeAddToLoadingModal() {
  addToLoadingModalRef.value?.close()
}

function isPackageSelected(id) {
  return selectedPackageIds.value.includes(id)
}

function togglePackageSelection(id) {
  if (selectedPackageIds.value.includes(id)) {
    selectedPackageIds.value = selectedPackageIds.value.filter((item) => item !== id)
    return
  }
  selectedPackageIds.value = [...selectedPackageIds.value, id]
}

function toggleAllPackages() {
  if (selectedPackageIds.value.length === packageRows.value.length) {
    selectedPackageIds.value = []
    return
  }
  selectedPackageIds.value = packageRows.value.map((row) => row.id)
}

function buildChargementPackageItem(row, chargementId) {
  const nowIso = new Date().toISOString()
  return {
    id: `${detailId.value}-${row.colisIndex}-${row.detailIndex}`,
    expediteur: client.value.expediteur || "",
    destinataire: client.value.destinataire || "",
    telephoneDestinataire: client.value.telephoneDestinataire || "",
    telephoneDestinataireDirect: client.value.telephoneDestinataireDirect || client.value.telephoneDestinataire || "",
    telephoneDestinataireWhatsapp: client.value.telephoneDestinataireWhatsapp || "",
    coli: row.name,
    nombreDeColis: Number(client.value.nombreDeColis || totalPackages.value || 0),
    clientId: detailId.value,
    colisIndex: row.colisIndex,
    detailIndex: row.detailIndex,
    date: nowIso,
    status: "réceptionné",
    historique: [{ status: "réceptionné", date: nowIso }],
    chargementId,
  }
}

const getDestinataireDirectPhone = () =>
  client.value.telephoneDestinataireDirect || client.value.telephoneDestinataire || ""

const getDestinataireWhatsappPhone = () =>
  client.value.telephoneDestinataireWhatsapp || client.value.whatsappDestinataire || ""

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.startsWith("33")) return `0${digits.slice(2)}`
  if (digits.startsWith("0")) return digits
  return digits
}

function splitFullName(fullName = "") {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { nom: "", prenom: "" }
  if (parts.length === 1) return { nom: parts[0], prenom: "" }
  return {
    nom: parts.slice(-1).join(" "),
    prenom: parts.slice(0, -1).join(" "),
  }
}

async function findPortalClientByPhone(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null

  const snap = await getDocs(collection(db, "clients"))
  const found = snap.docs.find((docSnap) => {
    const data = docSnap.data()
    return normalizePhone(data.phone || data.telephone || data.clientPhone) === normalized
  })

  return found ? { id: found.id, ...found.data() } : null
}

async function createClientSpaceFromEnlevement() {
  if (client.value.customerId) {
    await router.push(`/customersDetails/${client.value.customerId}`)
    return
  }

  const senderPhone = client.value.telephoneExpediteur || ""
  if (!senderPhone) {
    toast("Téléphone expéditeur manquant : impossible de créer l'espace client.", { type: "warning" })
    return
  }

  creatingClientSpace.value = true

  try {
    const existingClient = await findPortalClientByPhone(senderPhone)
    let portalClientId = existingClient?.id || ""

    if (!portalClientId) {
      const name = splitFullName(client.value.expediteur || "")
      const createdRef = await addDoc(collection(db, "clients"), {
        nom: name.nom,
        prenom: name.prenom,
        displayName: client.value.expediteur || "",
        telephone: senderPhone,
        phone: senderPhone,
        phoneNormalized: normalizePhone(senderPhone),
        adresse: client.value.adresseExpediteur || "",
        adresseComplete: client.value.adresseExpediteur || "",
        source: "enlevement",
        firstEnlevementId: detailId.value,
        createdFromEnlevementId: detailId.value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      portalClientId = createdRef.id
      toast("Espace client créé et enlèvement rattaché ✅", { type: "success", autoClose: 1400 })
    } else {
      toast("Client existant trouvé : enlèvement rattaché ✅", { type: "success", autoClose: 1400 })
    }

    await updateDoc(doc(db, "enlevements", detailId.value), {
      customerId: portalClientId,
      clientSpaceId: portalClientId,
      updatedAt: serverTimestamp(),
    })

    await router.push(`/customersDetails/${portalClientId}`)
  } catch (error) {
    console.error(error)
    toast("Erreur lors de la création de l'espace client.", { type: "error" })
  } finally {
    creatingClientSpace.value = false
  }
}

async function addSelectedPackagesToChargement() {
  if (!selectedChargementId.value) {
    toast("Choisis un chargement.", { type: "warning" })
    return
  }

  const selectedRows = packageRows.value.filter((row) => selectedPackageIds.value.includes(row.id))
  if (!selectedRows.length) {
    toast("Sélectionne au moins un colis.", { type: "warning" })
    return
  }

  addingToChargement.value = true
  try {
    const chargementRef = doc(db, "chargements", selectedChargementId.value)
    const snap = await getDoc(chargementRef)

    if (!snap.exists()) {
      toast("Chargement introuvable.", { type: "error" })
      return
    }

    const existing = Array.isArray(snap.data()?.packagesTable) ? snap.data().packagesTable : []
    const existingIds = new Set(existing.map((item) => item.id))
    const newItems = selectedRows
      .map((row) => buildChargementPackageItem(row, selectedChargementId.value))
      .filter((item) => !existingIds.has(item.id))

    if (!newItems.length) {
      toast("Les colis sélectionnés sont déjà dans ce chargement.", { type: "info" })
      return
    }

    await updateDoc(chargementRef, {
      packagesTable: [...existing, ...newItems],
    })

    toast(`${newItems.length} colis ajouté(s) au chargement.`, { type: "success", autoClose: 1400 })
    closeAddToLoadingModal()
  } catch (error) {
    console.error(error)
    toast("Erreur ajout au chargement.", { type: "error" })
  } finally {
    addingToChargement.value = false
  }
}

function addLogo(pdf, x, y, w, h) {
  if (!logo) return
  try {
    pdf.addImage(logo, "PNG", x, y, w, h)
  } catch (e) {
    console.warn("Logo PDF non chargé", e)
  }
}

function drawBrandHeader(pdf, title, subtitle = "") {
  pdf.setFillColor(23, 32, 51)
  pdf.rect(0, 0, 210, 32, "F")
  addLogo(pdf, 14, 7, 28, 14)

  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(17)
  pdf.text("TRANSPORT FOMEK", 48, 15)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  pdf.text("Transport France - Cameroun", 48, 21)
  pdf.text("07 66 81 37 07 · transportfomek.fr", 48, 26)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(14)
  pdf.text(title, 196, 15, { align: "right" })
  if (subtitle) {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.text(subtitle, 196, 22, { align: "right" })
  }

  pdf.setTextColor(0, 0, 0)
}

function buildBordereauPdf(c, qrCanvas, options = {}) {
  const pdf = new jsPDF("p", "mm", "a4")
  const showTracking = options.showTracking !== false
  const num = c?.numero || c?.numeroSuivi || "-"
  const imageBase64 = qrCanvas?.toDataURL("image/png")
  const prixAffiche = c.prix ? `${c.prix} €` : "-"
  const texteDescription = c.description ? c.description : genererTexteDescription(c.colis || [])
  const dateCreation = formatCreatedAt(c.createdAt || c.date)

  drawBrandHeader(pdf, "BORDEREAU", showTracking ? `Suivi ${num}` : "")

  pdf.setFillColor(248, 250, 252)
  pdf.setDrawColor(226, 232, 240)
  pdf.roundedRect(14, 40, 182, 30, 3, 3, "FD")

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(9)
  pdf.text("DATE", 20, 50)
  if (showTracking) {
    pdf.text("NUMÉRO DE SUIVI", 78, 50)
    pdf.text("DESTINATION", 145, 50)
  } else {
    pdf.text("DESTINATION", 118, 50)
  }
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.text(dateCreation, 20, 59, { maxWidth: 48 })
  if (showTracking) {
    pdf.text(num, 78, 59, { maxWidth: 52 })
    pdf.text(String(c.destination || "-").toUpperCase(), 145, 59, { maxWidth: 42 })
  } else {
    pdf.text(String(c.destination || "-").toUpperCase(), 118, 59, { maxWidth: 68 })
  }

  if (showTracking && imageBase64) {
    pdf.setDrawColor(226, 232, 240)
    pdf.roundedRect(14, 78, 42, 42, 3, 3)
    pdf.addImage(imageBase64, "PNG", 19, 83, 32, 32)
  }

  pdf.setFillColor(37, 99, 235)
  pdf.roundedRect(64, 78, 60, 42, 3, 3, "F")
  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("EXPÉDITEUR", 70, 89)
  pdf.setFontSize(12)
  pdf.text(String(c.expediteur || "-").toUpperCase(), 70, 99, { maxWidth: 48 })
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  pdf.text(`Tel: ${c.telephoneExpediteur || "-"}`, 70, 109, { maxWidth: 48 })

  pdf.setFillColor(15, 118, 110)
  pdf.roundedRect(132, 78, 64, 42, 3, 3, "F")
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("DESTINATAIRE", 138, 89)
  pdf.setFontSize(12)
  pdf.text(String(c.destinataire || "-").toUpperCase(), 138, 99, { maxWidth: 50 })
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  pdf.text(`Tel: ${c.telephoneDestinataire || "-"}`, 138, 109, { maxWidth: 50 })
  pdf.setTextColor(0, 0, 0)

  let y = 134
  pdf.setFillColor(23, 32, 51)
  pdf.roundedRect(14, y, 182, 10, 2, 2, "F")
  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(9)
  pdf.text("QTÉ", 20, y + 6.5)
  pdf.text("DESCRIPTION", 40, y + 6.5)
  pdf.text("PRIX", 156, y + 6.5)
  pdf.text("TOTAL", 178, y + 6.5)
  pdf.setTextColor(0, 0, 0)
  y += 10

  const descriptionLines = pdf.splitTextToSize(texteDescription || "-", 105)
  const rowHeight = Math.max(28, descriptionLines.length * 5 + 10)
  pdf.setDrawColor(226, 232, 240)
  pdf.rect(14, y, 182, rowHeight)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.text(String(c.nombreDeColis || totalPackages.value || "-"), 20, y + 8)
  pdf.text(descriptionLines, 40, y + 8)
  pdf.text(prixAffiche, 156, y + 8)
  pdf.text(prixAffiche, 178, y + 8)

  y += rowHeight + 10
  pdf.setFillColor(248, 250, 252)
  pdf.roundedRect(14, y, 182, 26, 3, 3, "FD")
  pdf.setFont("helvetica", "bold")
  pdf.text("Observations", 20, y + 9)
  pdf.setFont("helvetica", "normal")
  pdf.text(`Paiement: ${c.statut || "-"} · Reste à payer: ${c.resteAPayer || "-"}`, 20, y + 17)

  pdf.setFontSize(9)
  pdf.setTextColor(100, 116, 139)
  pdf.text("Merci de conserver ce bordereau jusqu'à la livraison finale.", 14, 288)
  if (showTracking) {
    pdf.text(`Numéro de suivi : ${num}`, 196, 288, { align: "right" })
  }
  pdf.setTextColor(0, 0, 0)

  return pdf
}

async function updateStatut(id) {
  const sel = document.getElementById("sel")
  if (!sel) return
  await updateDoc(doc(db, "enlevements", id), { deliveryStatus: sel.value })
}

async function deleteCustomer(id) {
  await deleteDoc(doc(db, "enlevements", id))
  window.location.hash = "#/liste"
}

function formatPhoneNumber(number) {
  const digits = (number || "").replace(/\D/g, "")
  if (digits.startsWith("0")) return "+33" + digits.slice(1)
  if (digits.startsWith("33")) return "+" + digits
  if (digits.startsWith("336") || digits.startsWith("337")) return "+" + digits
  throw new Error("Numéro invalide ou format non supporté")
}

const isLoading = ref(false)

async function sendTrackingLinkToShipper() {
  if (sendingTrackingLink.value || !canSendTrackingLink.value) return

  const trackingNumber = client.value?.numero || client.value?.numeroSuivi || "ce colis"
  const recipient = client.value?.expediteur || "l'expéditeur"
  if (!window.confirm(`Envoyer le lien TRACKSEND de ${trackingNumber} par SMS à ${recipient} ?`)) return

  sendingTrackingLink.value = true
  try {
    const token = await getIdTokenOrThrow()
    const response = await fetch(`${FUNCTIONS_BASE_URL}/sendPickupTrackingLink`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enlevementId: detailId.value }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Échec d'envoi du lien de suivi")
    }
    toast("Lien de suivi envoyé à l'expéditeur", { type: "success", autoClose: 1800 })
  } catch (error) {
    console.error("Erreur envoi lien de suivi :", error)
    const message = error instanceof TypeError && error.message === "Failed to fetch"
      ? "Service d'envoi indisponible. Vérifie le déploiement de la fonction puis réessaie."
      : error.message || "Erreur lors de l'envoi du lien"
    toast(message, { type: "error", autoClose: 4500 })
  } finally {
    sendingTrackingLink.value = false
  }
}

async function getIdTokenOrThrow() {
  const user = auth.currentUser
  if (!user) throw new Error("Utilisateur non connecté")
  return user.getIdToken()
}

const sendInvoiceSMS = async (phoneNumber, message) => {
  try {
    const token = await getIdTokenOrThrow()
    const response = await fetch("https://sendinvoicesms-v6gcy72m6a-uc.a.run.app", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phoneNumber, message }),
    })

    const data = await response.json().catch(() => ({}))

    if (response.ok) {
      toast.success("Bordereau envoyé", {
        position: toast.POSITION.TOP_RIGHT,
        autoClose: 4000,
      })
    } else {
      throw new Error(data.error || "Échec d’envoi du SMS")
    }
  } catch (err) {
    console.error("Erreur d'envoi SMS :", err)
    toast.error(err?.message || "Erreur réseau lors de l’envoi du SMS", {
      position: toast.POSITION.TOP_RIGHT,
    })
    throw err
  }
}

async function uploadPDFToStorage(clientData, pdf) {
  const storage = getStorage()
  const pdfBlob = pdf.output("blob")
  const safeName = (clientData.expediteur || "bordereau").replace(/[^\w-]+/g, "_")
  const pdfRef = storageRef(storage, `factures/${safeName}.pdf`)
  await uploadBytes(pdfRef, pdfBlob)
  return await getDownloadURL(pdfRef)
}

function buildColiLabel(item, colisIndex, detailIndex) {
  if (Array.isArray(item.details) && item.details[detailIndex]) {
    return item.details[detailIndex].coli || `${item.nom}-${detailIndex + 1}`
  }

  if (item.quantite && item.quantite > 1) {
    return `${item.nom} - ${detailIndex + 1}/${item.quantite}`
  }

  return item.nom || `COLIS-${colisIndex + 1}`
}

function buildCodePayload(item, colisIndex, detailIndex) {
  return [
    "TF",
    detailId.value || client.value.id || "",
    String(colisIndex),
    String(detailIndex)
  ].join("|")
}

function buildQrPayload(item, colisIndex, detailIndex) {
  return [
    buildCodePayload(item, colisIndex, detailIndex),
    `DIRECT:${getDestinataireDirectPhone() || ""}`,
    `WHATSAPP:${getDestinataireWhatsappPhone() || ""}`,
    `DATE_COLIS:${formatShortDate(client.value?.createdAt || client.value?.date)}`
  ].join("|")
}

function getBarcodeCanvasId(colisIndex, detailIndex) {
  return `barcode-canvas-${colisIndex}-${detailIndex}`
}

function getQrWrapperId(colisIndex, detailIndex) {
  return `qr-${colisIndex}-${detailIndex}`
}

function genererTexteDescription(colisArray) {
  if (!Array.isArray(colisArray)) return "Aucun colis"
  const out = []

  for (const c of colisArray) {
    if (Array.isArray(c.details) && c.details.length) {
      for (const d of c.details) out.push(d.coli)
    } else if (c.quantite && c.quantite > 1) {
      for (let i = 1; i <= c.quantite; i++) out.push(`${c.nom} - ${i}/${c.quantite}`)
    } else {
      out.push(`${c.nom} - 1`)
    }
  }

  return out.join(", ")
}

async function renderBarcodes() {
  await nextTick()

  const colisList = Array.isArray(client.value?.colis) ? client.value.colis : []

  colisList.forEach((item, colisIndex) => {
    if (Array.isArray(item.details) && item.details.length) {
      item.details.forEach((_, detailIndex) => {
        const payload = buildCodePayload(item, colisIndex, detailIndex)
        const canvas = document.getElementById(getBarcodeCanvasId(colisIndex, detailIndex))
        if (!canvas) return

        JsBarcode(canvas, payload, {
          format: "CODE128",
          displayValue: false,
          lineColor: "#000000",
          background: "#ffffff",
          width: 2,
          height: 80,
          margin: 8
        })
      })
      return
    }

    const total = item.quantite && item.quantite > 1 ? item.quantite : 1

    for (let i = 0; i < total; i++) {
      const payload = buildCodePayload(item, colisIndex, i)
      const canvas = document.getElementById(getBarcodeCanvasId(colisIndex, i))
      if (!canvas) continue

      JsBarcode(canvas, payload, {
        format: "CODE128",
        displayValue: false,
        lineColor: "#000000",
        background: "#ffffff",
        width: 2,
        height: 80,
        margin: 8
      })
    }
  })
}

onMounted(renderBarcodes)
watch(client, renderBarcodes, { deep: true })

function getCanvasFromWrapper(id) {
  const el = document.getElementById(id)
  if (!el) return null
  if (el.tagName?.toLowerCase() === "canvas") return el
  return el.querySelector("canvas")
}

const afficherPDF = async (c) => {
  const qrCanvas = getCanvasFromWrapper("qr_code")
  if (!qrCanvas) return

  const pdf = buildBordereauPdf(c, qrCanvas)
  const blob = pdf.output("blob")
  window.open(URL.createObjectURL(blob))
}

const qrCodeColis = async () => {
  await nextTick()
  await renderBarcodes()

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a6", compress: true })
  const colisList = Array.isArray(client.value?.colis) ? client.value.colis : []

  const pages = []

  colisList.forEach((item, colisIndex) => {
    if (Array.isArray(item.details) && item.details.length) {
      item.details.forEach((_, detailIndex) => {
        pages.push({ item, colisIndex, detailIndex })
      })
      return
    }

    const total = item.quantite && item.quantite > 1 ? item.quantite : 1
    for (let i = 0; i < total; i++) {
      pages.push({ item, colisIndex, detailIndex: i })
    }
  })

  for (let index = 0; index < pages.length; index++) {
    const { item, colisIndex, detailIndex } = pages[index]
    const coliLabel = buildColiLabel(item, colisIndex, detailIndex)

    const qrCanvas = getCanvasFromWrapper(getQrWrapperId(colisIndex, detailIndex))
    const barcodeCanvas = document.getElementById(getBarcodeCanvasId(colisIndex, detailIndex))

    if (!qrCanvas || !barcodeCanvas) continue
    const barcodePayload = buildCodePayload(item, colisIndex, detailIndex)

    pdf.setFillColor(23, 32, 51)
    pdf.roundedRect(4, 4, 97, 18, 2, 2, "F")
    addLogo(pdf, 7, 7, 20, 10)

    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(12)
    pdf.setFont(undefined, "bold")
    pdf.text("TRANSPORT FOMEK", 31, 12)
    pdf.setFont(undefined, "normal")
    pdf.setFontSize(7)
    pdf.text("ETIQUETTE COLIS", 31, 17)
    pdf.setTextColor(0, 0, 0)

    pdf.setDrawColor(23, 32, 51)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(4, 4, 97, 139, 2, 2)

    pdf.setFontSize(15)
    pdf.setFont(undefined, "bold")
    pdf.text((client.value.destinataire || "").toUpperCase(), 52.5, 31, {
      align: "center",
      maxWidth: 88
    })

    pdf.setFont(undefined, "normal")
    pdf.setFontSize(10)
    pdf.text(`DIRECT : ${getDestinataireDirectPhone() || "-"}`, 7, 41)
    pdf.text(`WHATSAPP : ${getDestinataireWhatsappPhone() || "-"}`, 7, 48)
    pdf.text(`DESTINATION : ${client.value.destination || "-"}`, 7, 55)

    pdf.setFontSize(12)
    pdf.setFont(undefined, "bold")
    pdf.text(`COLIS : ${coliLabel}`, 7, 65, { maxWidth: 90 })

    pdf.setFont(undefined, "normal")
    pdf.setFontSize(10)
    pdf.text(`TOTAL COLIS : ${client.value.nombreDeColis || "-"}`, 7, 72)

    pdf.setFillColor(241, 245, 249)
    pdf.roundedRect(7, 76, 91, 11, 2, 2, "F")
    pdf.setTextColor(51, 65, 85)
    pdf.setFont(undefined, "bold")
    pdf.setFontSize(9)
    pdf.text(`DATE DU COLIS : ${formatShortDate(client.value?.createdAt || client.value?.date)}`, 52.5, 83, { align: "center" })
    pdf.setTextColor(0, 0, 0)

    pdf.setFillColor(255, 255, 255)
    pdf.rect(27, 88, 51, 37, "F")
    pdf.addImage(qrCanvas.toDataURL("image/png"), "PNG", 34, 88, 37, 37, undefined, "FAST")
    pdf.addImage(barcodeCanvas.toDataURL("image/png"), "PNG", 9, 126, 88, 14, undefined, "FAST")
    pdf.setFontSize(6)
    pdf.setFont(undefined, "normal")
    pdf.text(barcodePayload, 52.5, 142.5, { align: "center", maxWidth: 88 })

    if (index !== pages.length - 1) {
      pdf.addPage()
    }
  }

  pdf.save(`${client.value.expediteur || "etiquettes"}.pdf`)
}

const sendSMS = async (c) => {
  try {
    isLoading.value = true
    await nextTick()

    const qrCanvas = getCanvasFromWrapper("qr_code")
    if (!qrCanvas) throw new Error("QR global introuvable")

    const pdf = buildBordereauPdf(c, qrCanvas, { showTracking: false })
    const pdfUrl = await uploadPDFToStorage(c, pdf)
    const message =
      `Bonjour ${c.expediteur || ""}, ` +
      `Voici votre bordereau de livraison : ${pdfUrl}`

    await sendInvoiceSMS(formatPhoneNumber(c.telephoneExpediteur || ""), message)
  } catch (err) {
    console.error(err)
    toast.error("Une erreur est survenue lors de l'envoi du bordereau.", {
      position: toast.POSITION.TOP_RIGHT,
    })
  } finally {
    isLoading.value = false
  }
}

</script>

<template>
  <section class="page-shell">
    <div class="page-hero min-w-0 p-5 sm:p-6">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="eyebrow">Enlevement</p>
          <h2 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
            {{ client.numero || client.numeroSuivi || detailId }}
          </h2>
          <p class="mt-2 text-sm text-slate-500">
            {{ client.date ? formatDateTime(client.date) : formatCreatedAt(client.createdAt) }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <span class="status-badge" :class="paymentBadgeClass">
            {{ client.statut || "Paiement inconnu" }}
          </span>
          <span class="status-badge" :class="deliveryBadgeClass">
            {{ client.deliveryStatus || "En attente" }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="grid min-w-0 gap-4 sm:grid-cols-2"
      :class="isSuperAdminView ? 'xl:grid-cols-5' : 'xl:grid-cols-4'"
    >
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Colis</p>
        <p class="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{{ totalPackages }}</p>
      </article>
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Livrés</p>
        <p class="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{{ deliveredPackages }}</p>
      </article>
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Prix</p>
        <p class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{{ client.prix ? `${client.prix} €` : "-" }}</p>
      </article>
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Reste à payer</p>
        <p class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{{ client.resteAPayer || "-" }}</p>
      </article>
      <article v-if="isSuperAdminView" class="surface-card min-w-0 p-5">
        <p class="text-sm font-medium text-slate-500">Conteneur</p>
        <p
          class="mt-2 break-words text-xl font-extrabold tracking-tight"
          :class="pickupContainerNames.length ? 'text-cyan-800' : 'text-slate-500'"
        >
          {{ pickupContainerLabel }}
        </p>
      </article>
    </div>

    <div class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div class="min-w-0 space-y-6">
        <section class="surface-card p-5">
          <h3 class="font-bold text-slate-950">Photos</h3>
          <div class="mt-4">
            <ImageGallery :images="client?.imageUrl || []" :thumb-rows="2" />
          </div>
        </section>

        <section class="surface-card overflow-hidden">
          <div class="section-header flex-col sm:flex-row sm:items-center">
            <div>
              <h3 class="font-bold text-slate-950">Colis</h3>
              <p class="text-sm text-slate-500">Coche les colis à ajouter dans un chargement.</p>
            </div>
            <button
              v-if="isAdminView"
              class="pro-button pro-button-primary disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              :disabled="!packageRows.length"
              @click="openAddToLoadingModal"
            >
              Ajouter au chargement
              <span v-if="selectedPackagesCount">({{ selectedPackagesCount }})</span>
            </button>
          </div>

          <div class="divide-y divide-slate-100 md:hidden">
            <article v-for="row in packageRows" :key="`mobile-${row.id}`" class="p-4">
              <div class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm mt-1 shrink-0 border-slate-300"
                  :checked="isPackageSelected(row.id)"
                  @change="togglePackageSelection(row.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      v-if="isSuperAdminView && getPackageLoadingInfo(row)"
                      class="inline-flex rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-cyan-800"
                      :title="`Chargé le ${formatCreatedAt(getPackageLoadingInfo(row).date)}`"
                    >
                      {{ getPackageLoadingInfo(row).contenaire }}
                    </span>
                    <p class="break-words font-bold text-slate-950">{{ row.name }}</p>
                  </div>
                  <p class="mt-1 text-sm text-slate-500">{{ row.group }}</p>
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      class="status-badge"
                      :class="String(row.status).toLowerCase() === 'livré' || row.status === true ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-700'"
                    >
                      {{ row.status === true ? "livré" : row.status }}
                    </span>
                    <span class="text-xs text-slate-500">
                      {{ row.deliveredAt ? formatCreatedAt(row.deliveredAt) : "Non livré" }}
                    </span>
                  </div>
                </div>
              </div>
              <RouterLink
                v-if="isAdminView"
                class="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-200 hover:text-cyan-800"
                :to="{ path: `/sign/${detailId}`, query: { colisIndex: row.colisIndex, detailIndex: row.detailIndex } }"
              >
                Signer
              </RouterLink>
            </article>
            <p v-if="!packageRows.length" class="px-5 py-10 text-center text-slate-500">Aucun colis enregistré.</p>
          </div>

          <div class="hidden overflow-x-auto md:block">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="w-12 px-5 py-3">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm border-slate-300"
                      :checked="packageRows.length > 0 && selectedPackageIds.length === packageRows.length"
                      @change="toggleAllPackages"
                    />
                  </th>
                  <th class="px-5 py-3">Article</th>
                  <th class="px-5 py-3">Groupe</th>
                  <th class="px-5 py-3">Statut</th>
                  <th class="px-5 py-3">Livré le</th>
                  <th class="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in packageRows" :key="row.id">
                  <td class="px-5 py-4">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm border-slate-300"
                      :checked="isPackageSelected(row.id)"
                      @change="togglePackageSelection(row.id)"
                    />
                  </td>
                  <td class="px-5 py-4 font-semibold text-slate-950">
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        v-if="isSuperAdminView && getPackageLoadingInfo(row)"
                        class="inline-flex rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-cyan-800"
                        :title="`Chargé le ${formatCreatedAt(getPackageLoadingInfo(row).date)}`"
                      >
                        {{ getPackageLoadingInfo(row).contenaire }}
                      </span>
                      <span>{{ row.name }}</span>
                    </div>
                  </td>
                  <td class="px-5 py-4 text-slate-600">{{ row.group }}</td>
                  <td class="px-5 py-4">
                    <span
                      class="status-badge"
                      :class="String(row.status).toLowerCase() === 'livré' || row.status === true ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-700'"
                    >
                      {{ row.status === true ? "livré" : row.status }}
                    </span>
                  </td>
                  <td class="px-5 py-4 text-slate-600">{{ row.deliveredAt ? formatCreatedAt(row.deliveredAt) : "-" }}</td>
                  <td class="px-5 py-4 text-right">
                    <RouterLink
                      v-if="isAdminView"
                      class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-cyan-200 hover:text-cyan-800"
                      :to="{ path: `/sign/${detailId}`, query: { colisIndex: row.colisIndex, detailIndex: row.detailIndex } }"
                    >
                      Signer
                    </RouterLink>
                    <span v-else class="text-xs text-slate-400">-</span>
                  </td>
                </tr>
                <tr v-if="!packageRows.length">
                  <td class="px-5 py-10 text-center text-slate-500" colspan="6">Aucun colis enregistré.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="min-w-0 space-y-6">
        <section v-if="isAdminView" class="surface-card p-5">
          <h3 class="font-bold text-slate-950">Contacts</h3>
          <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Expéditeur</p>
              <p class="mt-1 font-bold text-slate-950">{{ client.expediteur || "-" }}</p>
              <p class="text-sm text-slate-600">{{ client.telephoneExpediteur || "-" }}</p>
            </div>
            <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Destinataire</p>
              <p class="mt-1 font-bold text-slate-950">{{ client.destinataire || "-" }}</p>
              <p class="text-sm text-slate-600">Direct : {{ client.telephoneDestinataireDirect || client.telephoneDestinataire || "-" }}</p>
              <p class="text-sm text-slate-600">WhatsApp : {{ client.telephoneDestinataireWhatsapp || client.whatsappDestinataire || "-" }}</p>
            </div>
            <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Destination</p>
              <p class="mt-1 font-bold text-slate-950">{{ client.destination || "-" }}</p>
              <p class="text-sm text-slate-600">{{ client.typeDeFret || "-" }}</p>
            </div>
          </div>
        </section>

        <section v-if="isAdminView" class="surface-card p-5">
          <h3 class="font-bold text-slate-950">Documents</h3>
          <div id="qr_code" class="hidden">
            <qrcode-vue :value="detailId" :size="360" :margin="4" level="M" background="#ffffff" foreground="#000000" render-as="canvas" />
          </div>
          <div class="mt-4 grid gap-3">
            <button class="pro-button pro-button-primary w-full" @click="qrCodeColis()">
              Générer étiquettes QR + Barcode
            </button>
            <button class="pro-button pro-button-secondary w-full" @click="afficherPDF(client)">
              Aperçu bordereau
            </button>
            <button
              class="pro-button w-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
              @click="sendSMS(client)"
              :disabled="isLoading"
            >
              {{ isLoading ? "Envoi..." : "Envoyer bordereau" }}
            </button>
            <button
              v-if="isSuperAdminView && canSendTrackingLink"
              class="pro-button w-full bg-cyan-800 text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="sendingTrackingLink"
              @click="sendTrackingLinkToShipper"
            >
              {{ sendingTrackingLink ? "Envoi du suivi..." : "Envoyer le lien de suivi" }}
            </button>
            <p v-if="isSuperAdminView && client.trackingLinkSentAt" class="text-xs font-semibold text-cyan-800">
              Dernier lien envoyé le {{ formatCreatedAt(client.trackingLinkSentAt) }}
            </p>
          </div>
        </section>

        <section v-if="isAdminView" class="surface-card p-5">
          <h3 class="font-bold text-slate-950">Historique livraison</h3>
          <div v-if="deliveryHistory.length" class="mt-4 space-y-3">
            <article
              v-for="(event, index) in deliveryHistory.slice(0, 8)"
              :key="`${event.type || 'event'}-${event.date || index}`"
              class="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
            >
              <p class="text-sm font-bold text-slate-950">{{ event.message || event.status || "Événement livraison" }}</p>
              <p class="mt-1 text-xs text-slate-500">
                {{ event.colis || event.phone || "-" }} · {{ formatCreatedAt(event.date) }}
              </p>
              <p v-if="event.userEmail" class="mt-1 text-xs text-slate-400">{{ event.userEmail }}</p>
            </article>
          </div>
          <p v-else class="mt-4 text-sm text-slate-500">Aucun historique de livraison pour le moment.</p>
        </section>

        <section v-if="isAdminView" class="surface-card p-5">
          <h3 class="font-bold text-slate-950">Actions</h3>
          <div class="mt-4 grid gap-3">
            <button
              v-if="isSuperAdminView"
              class="pro-button gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="creatingClientSpace"
              @click="createClientSpaceFromEnlevement"
            >
              <span>
                {{
                  creatingClientSpace
                    ? "Création..."
                    : client.customerId
                      ? "Voir espace client"
                      : "Créer client"
                }}
              </span>
              <span class="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Super
              </span>
            </button>
            <button class="pro-button pro-button-primary" @click="openAddToLoadingModal">
              Ajouter au chargement
            </button>
            <button class="pro-button pro-button-secondary" type="button" @click="openUpdateModal">
              Modifier
            </button>
            <button v-if="isSuperAdminView" class="pro-button gap-2 border border-red-200 bg-white text-red-600 hover:bg-red-50" @click="deleteCustomer(client.id)">
              <span>Supprimer</span>
              <span class="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                Super
              </span>
            </button>
            <button class="pro-button pro-button-secondary" @click="$router.back()">
              Retour
            </button>
          </div>
        </section>
      </aside>
    </div>

    <div class="fixed left-0 top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
      <template v-for="(item, colisIndex) in client.colis" :key="colisIndex">
        <template v-if="item.details && item.details.length">
          <div v-for="(detail, detailIndex) in item.details" :key="`codes-${colisIndex}-${detailIndex}`">
            <div :id="getQrWrapperId(colisIndex, detailIndex)">
              <qrcode-vue :value="buildQrPayload(item, colisIndex, detailIndex)" :size="360" :margin="4" level="M" background="#ffffff" foreground="#000000" render-as="canvas" />
            </div>
            <canvas :id="getBarcodeCanvasId(colisIndex, detailIndex)" width="900" height="180"></canvas>
          </div>
        </template>
        <template v-else-if="item.quantite && item.quantite > 1">
          <div v-for="i in item.quantite" :key="`codes-${colisIndex}-${i}`">
            <div :id="getQrWrapperId(colisIndex, i - 1)">
              <qrcode-vue :value="buildQrPayload(item, colisIndex, i - 1)" :size="360" :margin="4" level="M" background="#ffffff" foreground="#000000" render-as="canvas" />
            </div>
            <canvas :id="getBarcodeCanvasId(colisIndex, i - 1)" width="900" height="180"></canvas>
          </div>
        </template>
        <template v-else>
          <div>
            <div :id="getQrWrapperId(colisIndex, 0)">
              <qrcode-vue :value="buildQrPayload(item, colisIndex, 0)" :size="360" :margin="4" level="M" background="#ffffff" foreground="#000000" render-as="canvas" />
            </div>
            <canvas :id="getBarcodeCanvasId(colisIndex, 0)" width="900" height="180"></canvas>
          </div>
        </template>
      </template>
    </div>

    <dialog id="update" ref="updateModalRef" class="modal">
        <div class="modal-box max-h-[92vh] w-[min(1180px,calc(100vw-1.5rem))] max-w-none overflow-hidden bg-white p-0 text-slate-950 shadow-2xl">
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
            <div>
              <p class="eyebrow">Modification</p>
              <h3 class="text-lg font-bold text-slate-950">Modifier l'enlèvement</h3>
            </div>
            <form method="dialog">
              <button class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" type="submit">
                X
              </button>
            </form>
          </div>
          <div class="max-h-[calc(92vh-73px)] overflow-y-auto px-5 py-5">
          <Form
            mode="edit"
            :doc-id="detailId"
            :initial-data="client"
            embedded
            @saved="closeUpdateModal"
          />
          <div class="modal-action sticky bottom-0 bg-white/95 py-3 backdrop-blur">
            <form method="dialog">
              <button class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Fermer</button>
            </form>
          </div>
          </div>
        </div>
      </dialog>

    <dialog ref="addToLoadingModalRef" class="modal">
      <div class="modal-box max-w-3xl bg-white text-slate-950 shadow-2xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-bold">Ajouter au chargement</h3>
            <p class="mt-1 text-sm text-slate-500">
              Choisis le conteneur et les colis de cet enlèvement à ajouter à la liste de colissage.
            </p>
          </div>
          <button class="btn btn-sm btn-circle btn-ghost" type="button" @click="closeAddToLoadingModal">X</button>
        </div>

        <div class="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Chargement / conteneur</span>
            <select
              v-model="selectedChargementId"
              class="field-control mt-2 h-11 w-full"
            >
              <option value="">Choisir un chargement</option>
              <option v-for="item in sortedChargements" :key="item.id" :value="item.id">
                {{ item.contenaire || item.id }} - {{ item.date ? formatDateTime(item.date) : formatCreatedAt(item.createdAt) }}
              </option>
            </select>
          </label>

          <button class="pro-button pro-button-secondary" type="button" @click="toggleAllPackages">
            {{ selectedPackageIds.length === packageRows.length ? "Tout décocher" : "Tout sélectionner" }}
          </button>
        </div>

        <div class="mt-5 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          <label
            v-for="row in packageRows"
            :key="row.id"
            class="flex cursor-pointer items-start gap-3 p-4 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-sm mt-1 border-slate-300"
              :checked="isPackageSelected(row.id)"
              @change="togglePackageSelection(row.id)"
            />
            <span class="min-w-0 flex-1">
              <span class="block font-bold text-slate-950">{{ row.name }}</span>
              <span class="mt-1 block text-sm text-slate-500">{{ row.group }} · {{ row.status }}</span>
            </span>
          </label>
          <p v-if="!packageRows.length" class="p-6 text-center text-sm text-slate-500">
            Aucun colis disponible.
          </p>
        </div>

        <div class="modal-action">
          <button class="btn" type="button" @click="closeAddToLoadingModal">Annuler</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="addingToChargement"
            @click="addSelectedPackagesToChargement"
          >
            {{ addingToChargement ? "Ajout..." : `Ajouter ${selectedPackageIds.length} colis` }}
          </button>
        </div>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
</style>
