<script setup>
import { confirmToast } from "../utils/confirmToast.js"
import { messagingEndpoint } from "../utils/messagingEndpoint"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { addDoc, collection, deleteDoc, doc, query, orderBy, serverTimestamp, updateDoc } from "firebase/firestore"
import { useCollection } from "vuefire"
import { toast } from "vue3-toastify"
import { auth, db } from "../components/firebaseConfig"
import { useAuthStore } from "../stores/useAuthStore"

const authStore = useAuthStore()
const locationsSnap = useCollection(query(collection(db, "driverLocations"), orderBy("updatedAt", "desc")))
const pickupRequestsSnap = useCollection(query(collection(db, "pickupRequests"), orderBy("createdAt", "desc")))
const enlevementsSnap = useCollection(query(collection(db, "enlevements"), orderBy("createdAt", "desc")))
const plannedPickupsSnap = useCollection(query(collection(db, "plannedPickups"), orderBy("createdAt", "desc")))
const selectedId = ref("")
const selectedStopIds = ref([])
const pickupTab = ref("today")
const sending = ref(false)
const sendingClientBulkForm = ref(false)
const routeLoading = ref(false)
const routeError = ref("")
const routeSummary = ref(null)
const routeGeometry = ref([])
const optimizedStops = ref([])
const stopCoordinates = ref({})
const hiddenDriverIds = ref([])
const stoppedDriverIds = ref([])
const removedDriverIds = ref([])
const tourMapEl = ref(null)
const tourMap = ref(null)
const tourLayer = ref(null)
const routeFunctionUrl = "https://us-central1-aarontravelgestion.cloudfunctions.net/calculateDriverRoute"
const linkForm = ref({
  driverName: "",
  driverPhone: "",
  driverId: "",
  tourneeId: new Date().toISOString().slice(0, 10),
})
const clientBulkRows = ref([
  { id: 1, name: "", phone: "", address: "" },
])
const clientMessageMode = ref("todo")
const isSuperAdmin = computed(() => authStore.initialized && authStore.isSuperAdmin)

const locations = computed(() =>
  (locationsSnap.value || [])
    .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    .map((item) => ({
      ...item,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      updatedAtLabel: formatDate(item.updatedAt),
      isActive: item.status === "active" && isRecent(item.updatedAt),
    }))
)

const visibleLocations = computed(() =>
  locations.value.filter((item) => {
    const id = getLocationDocId(item)
    return (
      !hiddenDriverIds.value.includes(id) &&
      !removedDriverIds.value.includes(id)
    )
  })
)

const selectedLocation = computed(() => {
  if (!locations.value.length) return null
  return (
    locations.value.find((item) => getLocationDocId(item) === selectedId.value) ||
    visibleLocations.value[0] ||
    locations.value.find((item) => !removedDriverIds.value.includes(getLocationDocId(item))) ||
    null
  )
})

const activeCount = computed(() => visibleLocations.value.filter((item) => item.isActive).length)
const hiddenCount = computed(() => hiddenDriverIds.value.length + removedDriverIds.value.length)

const todayKey = computed(() => new Date().toISOString().slice(0, 10))

const clientPickupStops = computed(() =>
  (plannedPickupsSnap.value || [])
    .filter((item) => String(item.status || "sent") !== "cancelled")
    .map((item) => ({
      id: `planned:${item.id}`,
      docId: item.id,
      source: "planned",
      clientName: item.clientName || "Client",
      senderName: item.clientName || "",
      address: item.address || "",
      destination: item.destination || "",
      reservationDate: item.dateKey || "",
      reservationTime: "",
      status: "SENT",
      colis: 0,
      isToday: item.dateKey === todayKey.value,
    }))
    .filter((item) => item.address)
)

const todayPickupStops = computed(() => clientPickupStops.value.filter((item) => item.isToday))

const historyPickupStops = computed(() => {
  const requests = (pickupRequestsSnap.value || [])
    .filter((request) => {
      const status = String(request.status || "PENDING").toUpperCase()
      const address = getStopAddress(request)
      return address && status !== "CANCELLED"
    })
    .map((request) => ({
      id: `request:${request.id}`,
      source: "request",
      clientName: [request.clientPrenom, request.clientNom].filter(Boolean).join(" ").trim() || "Client",
      senderName: request.expediteur || request.nomExpediteur || request.senderName || "",
      address: getStopAddress(request),
      destination: request.destination || "",
      reservationDate: request.reservationDate || "",
      reservationTime: request.reservationTime || "",
      status: String(request.status || "PENDING").toUpperCase(),
      colis: request.nombreDeColis || request.colis?.length || 0,
    }))

  const enlevements = (enlevementsSnap.value || [])
    .filter((item) => {
      const address = String(item.adresseExpediteur || item.pickupAddress || "").trim()
      const status = String(item.deliveryStatus || "En attente").toLowerCase()
      return address && !["livré", "livree", "livrée", "delivered", "annulé", "annule"].includes(status)
    })
    .map((item) => ({
      id: `enlevement:${item.id}`,
      source: "enlevement",
      clientName: item.expediteur || "Client",
      senderName: item.expediteur || "",
      address: item.adresseExpediteur || item.pickupAddress || "",
      destination: item.destination || "",
      reservationDate: item.date ? formatDate(item.date) : "",
      reservationTime: "",
      status: String(item.deliveryStatus || "ENLEVEMENT").toUpperCase(),
      colis: item.nombreDeColis || item.colis?.length || 0,
    }))

  return [...requests, ...enlevements].slice(0, 120)
})

const pickupStops = computed(() =>
  pickupTab.value === "today"
    ? todayPickupStops.value
    : pickupTab.value === "clients"
      ? clientPickupStops.value
      : historyPickupStops.value
)

const pickupTabTitle = computed(() => {
  if (pickupTab.value === "today") return "Tournée du jour"
  if (pickupTab.value === "clients") return "Clients"
  return "Historique"
})

const pickupTabDescription = computed(() => {
  if (pickupTab.value === "today") return "Ramassages clients prévus aujourd'hui avec une adresse exploitable pour l'itinéraire."
  if (pickupTab.value === "clients") return "Clients envoyés par SMS avec une adresse. Les ramassages du jour restent modifiables."
  return "Retrouve uniquement les demandes et enlèvements déjà créés."
})

const emptyPickupTabMessage = computed(() => {
  if (pickupTab.value === "today") return "Aucun ramassage client prévu aujourd'hui avec une adresse."
  if (pickupTab.value === "clients") return "Aucun client avec adresse envoyé par SMS pour le moment."
  return "Aucun point avec adresse dans l'historique."
})

const selectedStops = computed(() => {
  const ids = new Set(selectedStopIds.value)
  return pickupStops.value.filter((stop) => ids.has(stop.id))
})

const orderedStops = computed(() => optimizedStops.value.length ? optimizedStops.value : selectedStops.value)

const mapUrl = computed(() => {
  const loc = selectedLocation.value
  if (!loc) return ""
  const delta = 0.01
  const left = loc.longitude - delta
  const right = loc.longitude + delta
  const top = loc.latitude + delta
  const bottom = loc.latitude - delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${loc.latitude}%2C${loc.longitude}`
})

const driverLink = computed(() => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://aarontravelgestion.web.app"
  const driverId = slugify(linkForm.value.driverId || linkForm.value.driverName || "chauffeur")
  const name = encodeURIComponent(linkForm.value.driverName || driverId)
  const tournee = encodeURIComponent(linkForm.value.tourneeId || new Date().toISOString().slice(0, 10))
  return `${origin}/#/driver/enlevement?driverId=${encodeURIComponent(driverId)}&name=${name}&tournee=${tournee}`
})

function buildClientPickupLink(client = {}, inviteId = "") {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://aarontravelgestion.web.app"
  const params = new URLSearchParams()
  if (inviteId) params.set("invite", inviteId)
  if (String(client.name || "").trim()) params.set("nom", String(client.name || "").trim())
  if (String(client.phone || "").trim()) params.set("phone", String(client.phone || "").trim())
  if (String(client.address || "").trim()) params.set("adresse", String(client.address || "").trim())
  const query = params.toString()
  return `${origin}/#/client/enlevement${query ? `?${query}` : ""}`
}

const validBulkClientRows = computed(() => {
  const seen = new Set()
  return clientBulkRows.value
    .map((row) => ({
      ...row,
      name: String(row.name || "").trim(),
      phone: cleanSmsPhone(row.phone),
      address: String(row.address || "").trim(),
    }))
    .filter((row) => {
      const key = `${row.phone}|${row.address}`
      if (!row.phone || seen.has(key)) return false
      seen.add(key)
      return true
    })
})

const routeUrl = computed(() => {
  if (!orderedStops.value.length) return ""

  const origin = selectedLocation.value
    ? `${selectedLocation.value.latitude},${selectedLocation.value.longitude}`
    : ""

  const stops = orderedStops.value.map((stop) => stop.address)
  const destination = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1)

  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination,
  })

  if (origin) params.set("origin", origin)
  if (waypoints.length) params.set("waypoints", waypoints.join("|"))

  return `https://www.google.com/maps/dir/?${params.toString()}`
})

const routePreview = computed(() => {
  if (!routeGeometry.value.length && !orderedStops.value.length && !selectedLocation.value) return null

  const points = []
  if (selectedLocation.value) {
    points.push({
      type: "driver",
      label: "Départ",
      lat: selectedLocation.value.latitude,
      lon: selectedLocation.value.longitude,
    })
  }

  orderedStops.value.forEach((stop, index) => {
    const coords = stopCoordinates.value[stop.id]
    if (coords) {
      points.push({
        type: "stop",
        label: String(index + 1),
        lat: coords.lat,
        lon: coords.lon,
      })
    }
  })

  const linePoints = routeGeometry.value.length
    ? routeGeometry.value.map(([lon, lat]) => ({ lon, lat }))
    : points

  if (!linePoints.length) return null

  const all = [...linePoints, ...points]
  const lons = all.map((point) => point.lon)
  const lats = all.map((point) => point.lat)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const padding = 28
  const width = 640
  const height = 320
  const lonSpan = maxLon - minLon || 0.01
  const latSpan = maxLat - minLat || 0.01

  const project = (point) => ({
    ...point,
    x: padding + ((point.lon - minLon) / lonSpan) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2),
  })

  return {
    width,
    height,
    path: linePoints.map(project).map((point) => `${point.x},${point.y}`).join(" "),
    points: points.map(project),
  }
})

const routeDistanceLabel = computed(() => {
  if (!routeSummary.value?.distance) return "—"
  return `${(routeSummary.value.distance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`
})

const routeDurationLabel = computed(() => {
  if (!routeSummary.value?.duration) return "—"
  const minutes = Math.round(routeSummary.value.duration / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return `${h} h ${String(m).padStart(2, "0")}`
})

const hasRouteMapPoints = computed(() => (routePreview.value?.points || []).length > 1)
const hasRouteTrace = computed(() => routeGeometry.value.length > 0)

const driverColorPalette = [
  "#176b8a",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5",
]

function formatDate(ts) {
  if (!ts) return "—"
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isRecent(ts) {
  if (!ts) return false
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return Date.now() - d.getTime() < 5 * 60 * 1000
}

function openExternalMap(loc) {
  window.open(`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`, "_blank", "noopener,noreferrer")
}

function getDriverColor(driverId) {
  const value = String(driverId || "")
  const sum = value.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return driverColorPalette[sum % driverColorPalette.length]
}

function getLocationDocId(loc) {
  return String(loc?.id || `${loc?.driverId || "chauffeur"}_${loc?.tourneeId || ""}`)
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function createMarkerIcon({ label, color, title = "", isDriver = false }) {
  const size = isDriver ? 34 : 30
  const safeTitle = escapeHtml(title)
  const safeLabel = escapeHtml(label)
  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; gap:4px; transform:translateY(-22px);">
        ${safeTitle ? `
          <div style="
            max-width:150px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            border:1px solid rgba(148,163,184,.45);
            border-radius:9999px;
            background:white;
            color:#0f172a;
            box-shadow:0 6px 18px rgba(15,23,42,.16);
            padding:3px 8px;
            font-weight:800;
            font-size:11px;
          ">${safeTitle}</div>
        ` : ""}
        <div style="
          width:${size}px;
          height:${size}px;
          border-radius:9999px;
          background:${color};
          color:white;
          border:3px solid white;
          box-shadow:0 8px 20px rgba(15,23,42,.25);
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:800;
          font-size:${isDriver ? 13 : 12}px;
        ">${safeLabel}</div>
      </div>
    `,
    iconSize: [160, 66],
    iconAnchor: [80, 50],
  })
}

function destroyTourMap() {
  if (tourMap.value) {
    tourMap.value.remove()
    tourMap.value = null
    tourLayer.value = null
  }
}

async function renderTourMap() {
  await nextTick()
  if (!tourMapEl.value || !hasRouteMapPoints.value || !selectedLocation.value) return

  if (!tourMap.value) {
    tourMap.value = L.map(tourMapEl.value, {
      zoomControl: true,
      scrollWheelZoom: true,
    })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(tourMap.value)
    tourLayer.value = L.layerGroup().addTo(tourMap.value)
  }

  tourLayer.value.clearLayers()
  const bounds = []
  const driverColor = getDriverColor(getLocationDocId(selectedLocation.value) || selectedLocation.value.driverId)
  const driverLatLng = [selectedLocation.value.latitude, selectedLocation.value.longitude]
  bounds.push(driverLatLng)

  L.marker(driverLatLng, {
    icon: createMarkerIcon({
      label: "D",
      color: driverColor,
      title: selectedLocation.value.driverName || selectedLocation.value.driverId || "Chauffeur",
      isDriver: true,
    }),
  })
    .bindPopup(`${selectedLocation.value.driverName || selectedLocation.value.driverId}<br/>Départ chauffeur`)
    .addTo(tourLayer.value)

  orderedStops.value.forEach((stop, index) => {
    const coords = stopCoordinates.value[stop.id]
    if (!coords) return
    const latLng = [coords.lat, coords.lon]
    bounds.push(latLng)
    L.marker(latLng, {
      icon: createMarkerIcon({
        label: String(index + 1),
        color: "#176b8a",
        title: stop.senderName || stop.clientName || "Ramassage",
      }),
    })
      .bindPopup(`<strong>${stop.clientName}</strong><br/>${stop.address}`)
      .addTo(tourLayer.value)
  })

  if (routeGeometry.value.length) {
    const polylinePoints = routeGeometry.value.map(([lon, lat]) => [lat, lon])
    L.polyline(polylinePoints, {
      color: driverColor,
      weight: 5,
      opacity: 0.85,
    }).addTo(tourLayer.value)
    bounds.push(...polylinePoints)
  }

  if (bounds.length) {
    tourMap.value.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 })
  }

  setTimeout(() => tourMap.value?.invalidateSize(), 60)
}

function hideDriver(locationId) {
  const id = String(locationId || "")
  if (!id) return
  if (!hiddenDriverIds.value.includes(id)) {
    hiddenDriverIds.value = [...hiddenDriverIds.value, id]
  }
  toast("Transporteur masqué dans la liste", { type: "info", autoClose: 1200 })
}

function showAllDrivers() {
  hiddenDriverIds.value = []
  removedDriverIds.value = []
}

async function stopDriver(loc) {
  const id = getLocationDocId(loc)
  try {
    if (!id) return
    if (!stoppedDriverIds.value.includes(id)) {
      stoppedDriverIds.value = [...stoppedDriverIds.value, id]
    }
    toast("Arrêt en cours...", { type: "info", autoClose: 900 })

    await updateDoc(doc(db, "driverLocations", id), {
      status: "stopped",
      stopRequested: true,
      stoppedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    toast("Ordre d'arrêt envoyé au chauffeur", { type: "success" })
  } catch (e) {
    console.error(e)
    stoppedDriverIds.value = stoppedDriverIds.value.filter((item) => item !== id)
    toast(e.message || "Impossible d'arrêter ce suivi", { type: "error" })
  }
}

async function continueDriver(loc) {
  const id = getLocationDocId(loc)
  try {
    if (!id) return
    stoppedDriverIds.value = stoppedDriverIds.value.filter((item) => item !== id)
    toast("Reprise en cours...", { type: "info", autoClose: 900 })

    await updateDoc(doc(db, "driverLocations", id), {
      status: "active",
      stopRequested: false,
      resumedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    toast("Suivi remis en actif", { type: "success" })
  } catch (e) {
    console.error(e)
    if (!stoppedDriverIds.value.includes(id)) {
      stoppedDriverIds.value = [...stoppedDriverIds.value, id]
    }
    toast(e.message || "Impossible de relancer ce suivi", { type: "error" })
  }
}

async function removeDriverPosition(loc) {
  const id = getLocationDocId(loc)
  try {
    if (!id) return
    if (!removedDriverIds.value.includes(id)) {
      removedDriverIds.value = [...removedDriverIds.value, id]
    }
    if (selectedId.value === id) selectedId.value = ""
    resetRoute()
    toast("Suppression en cours...", { type: "info", autoClose: 900 })

    await deleteDoc(doc(db, "driverLocations", id))
    toast("Position supprimée", { type: "success" })
  } catch (e) {
    console.error(e)
    removedDriverIds.value = removedDriverIds.value.filter((item) => item !== id)
    toast(e.message || "Impossible de supprimer cette position", { type: "error" })
  }
}

function getStopAddress(request) {
  return String(
    request.clientAdresse ||
    request.pickupAddress ||
    request.adresse ||
    request.address ||
    ""
  ).trim()
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "chauffeur"
}

function cleanSmsPhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "")
}

function inviteExpiryDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
}

function addClientBulkRow() {
  clientBulkRows.value = [
    ...clientBulkRows.value,
    { id: Date.now() + Math.random(), name: "", phone: "", address: "" },
  ]
}

function removeClientBulkRow(rowId) {
  if (clientBulkRows.value.length === 1) {
    clientBulkRows.value = [{ id: Date.now(), name: "", phone: "", address: "" }]
    return
  }
  clientBulkRows.value = clientBulkRows.value.filter((row) => row.id !== rowId)
}

function buildClientFormMessage(client, link, mode = "todo") {
  const name = client.name || "client"
  if (mode === "missed") {
    return [
      `TRANSPORT FOMEK - Bonjour ${name},`,
      "suite a notre dernier passage, merci de completer ce formulaire pour enregistrer votre enlevement :",
      link,
    ].join("\n")
  }

  return [
    `TRANSPORT FOMEK - Bonjour ${name},`,
    "merci de remplir ce formulaire avant l'arrivée du chauffeur :",
    link,
  ].join("\n")
}

async function savePlannedPickup(client, link) {
  const address = String(client.address || "").trim()
  if (!address) return

  await addDoc(collection(db, "plannedPickups"), {
    clientName: String(client.name || "").trim() || "Client",
    clientPhone: cleanSmsPhone(client.phone || ""),
    address,
    link,
    inviteId: client.inviteId || "",
    dateKey: todayKey.value,
    status: "sent",
    source: "clientFormSms",
    createdAt: serverTimestamp(),
  })
}

async function createPickupFormInvite(client = {}) {
  const inviteRef = await addDoc(collection(db, "pickupFormInvites"), {
    clientName: String(client.name || "").trim() || "Client",
    clientPhone: cleanSmsPhone(client.phone || ""),
    address: String(client.address || "").trim(),
    status: "pending",
    source: "driversMap",
    createdAt: serverTimestamp(),
    expireAt: inviteExpiryDate(),
    submittedAt: null,
  })

  return inviteRef.id
}

async function copyDriverLink() {
  await navigator.clipboard.writeText(driverLink.value)
  toast("Lien copié", { type: "success", autoClose: 1000 })
}

async function sendDriverLink() {
  try {
    if (!linkForm.value.driverPhone.trim()) {
      toast("Numéro chauffeur obligatoire", { type: "warning" })
      return
    }

    const user = auth.currentUser
    if (!user) {
      toast("Reconnecte-toi pour envoyer un SMS", { type: "error" })
      return
    }

    sending.value = true
    const token = await user.getIdToken()
    const response = await fetch(messagingEndpoint("sendDriverLinkSMS"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phoneNumber: linkForm.value.driverPhone,
        driverName: linkForm.value.driverName || "chauffeur",
        link: driverLink.value,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Erreur envoi SMS")
    }

    toast("Lien envoyé au chauffeur", { type: "success" })
  } catch (e) {
    console.error(e)
    toast(e.message || "Impossible d'envoyer le SMS", { type: "error" })
  } finally {
    sending.value = false
  }
}

async function sendBulkClientPickupLink() {
  try {
    if (!isSuperAdmin.value) {
      toast("Réservé au superadmin", { type: "warning" })
      return
    }

    const clients = validBulkClientRows.value
    if (!clients.length) {
      toast("Ajoute au moins une ligne avec un téléphone", { type: "warning" })
      return
    }

    const user = auth.currentUser
    if (!user) {
      toast("Reconnecte-toi pour envoyer un SMS", { type: "error" })
      return
    }

    sendingClientBulkForm.value = true
    const token = await user.getIdToken()

    let okCount = 0
    for (const client of clients) {
      const inviteId = await createPickupFormInvite(client)
      const clientWithInvite = { ...client, inviteId }
      const link = buildClientPickupLink(client, inviteId)
      const message = buildClientFormMessage(client, link, clientMessageMode.value)
      const response = await fetch(messagingEndpoint("sendInvoiceSMS"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phoneNumber: client.phone,
          message,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (response.ok && data.success) {
        okCount += 1
        await savePlannedPickup(clientWithInvite, link)
      } else {
        console.warn("Erreur SMS client", client.phone, data.error || response.statusText)
      }
    }

    toast(`Formulaire envoyé à ${okCount}/${clients.length} client(s)`, { type: okCount ? "success" : "warning" })
  } catch (e) {
    console.error(e)
    toast(e.message || "Impossible d'envoyer les SMS clients", { type: "error" })
  } finally {
    sendingClientBulkForm.value = false
  }
}

function toggleStop(stopId) {
  if (selectedStopIds.value.includes(stopId)) {
    selectedStopIds.value = selectedStopIds.value.filter((id) => id !== stopId)
  } else {
    selectedStopIds.value = [...selectedStopIds.value, stopId]
  }
  resetRoute()
}

function openRoute() {
  if (!routeUrl.value) {
    toast("Sélectionne au moins un point de ramassage", { type: "warning" })
    return
  }

  window.open(routeUrl.value, "_blank", "noopener,noreferrer")
}

function clearStops() {
  selectedStopIds.value = []
  resetRoute()
}

function removeStop(stopId) {
  selectedStopIds.value = selectedStopIds.value.filter((id) => id !== stopId)
  optimizedStops.value = optimizedStops.value.filter((stop) => stop.id !== stopId)
  resetRoute()
}

async function deletePlannedPickup(stop) {
  try {
    if (!stop?.docId) return
    const ok = await confirmToast("Supprimer ce ramassage du jour ?")
    if (!ok) return

    await updateDoc(doc(db, "plannedPickups", stop.docId), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
    })

    selectedStopIds.value = selectedStopIds.value.filter((id) => id !== stop.id)
    optimizedStops.value = optimizedStops.value.filter((item) => item.id !== stop.id)
    resetRoute()
    toast("Ramassage supprimé", { type: "success", autoClose: 1200 })
  } catch (e) {
    console.error(e)
    toast(e.message || "Impossible de supprimer ce ramassage", { type: "error" })
  }
}

function resetRoute() {
  routeError.value = ""
  routeSummary.value = null
  routeGeometry.value = []
  optimizedStops.value = []
}

function formatCoordinate(value) {
  return Number(value).toFixed(5)
}

async function requestRouteCalculation(mode = "route") {
  try {
    if (!selectedLocation.value) {
      toast("Sélectionne un chauffeur pour avoir le point de départ", { type: "warning" })
      return
    }
    if (!selectedStops.value.length) {
      toast("Sélectionne au moins un point de ramassage", { type: "warning" })
      return
    }
    const user = auth.currentUser
    if (!user) {
      toast("Reconnecte-toi pour calculer l'itinéraire", { type: "error" })
      return
    }

    routeLoading.value = true
    routeError.value = ""
    routeSummary.value = null
    routeGeometry.value = []
    optimizedStops.value = []

    const token = await user.getIdToken()
    const response = await fetch(routeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        start: {
          lat: selectedLocation.value.latitude,
          lon: selectedLocation.value.longitude,
        },
        stops: selectedStops.value,
        mode,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || data?.error || "Impossible de calculer l'itinéraire.")
    }

    optimizedStops.value = data.orderedStops || []
    stopCoordinates.value = data.stopCoordinates || {}
    routeSummary.value = data.summary || null
    routeGeometry.value = data.geometry || []
    toast(mode === "pointsOnly" ? "Points affichés sur la carte" : "Distance et tracé calculés", { type: "success" })
  } catch (e) {
    console.error(e)
    routeError.value = e.message || "Impossible de calculer l'itinéraire."
    toast(routeError.value, { type: "error" })
  } finally {
    routeLoading.value = false
  }
}

function showPickupPoints() {
  requestRouteCalculation("pointsOnly")
}

function calculateOptimizedRoute() {
  requestRouteCalculation("route")
}

watch(pickupTab, () => {
  clearStops()
})

watch([hasRouteMapPoints, selectedLocation, orderedStops, routeGeometry], () => {
  if (hasRouteMapPoints.value) {
    renderTourMap()
  } else {
    destroyTourMap()
  }
}, { deep: true, flush: "post" })

onBeforeUnmount(destroyTourMap)
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Chauffeurs</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Suivi des tournées</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-600">
            Visualise les chauffeurs qui ont démarré le suivi depuis leur lien public.
          </p>
        </div>
        <div class="rounded-lg bg-slate-50 px-4 py-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Actifs</p>
          <p class="text-2xl font-bold text-slate-950">{{ activeCount }}</p>
          <button
            v-if="hiddenCount"
            class="mt-1 text-xs font-bold text-cyan-800 hover:underline"
            type="button"
            @click="showAllDrivers"
          >
            Réafficher {{ hiddenCount }}
          </button>
        </div>
      </div>
    </div>

    <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Lien chauffeur</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950">Envoyer une tournée par SMS</h3>
          <p class="mt-1 max-w-2xl text-sm text-slate-600">
            Renseigne le chauffeur, copie le lien ou envoie-le directement via Twilio.
          </p>
        </div>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-4">
        <div>
          <label class="text-xs font-bold uppercase tracking-wide text-slate-500">Nom chauffeur</label>
          <input
            v-model="linkForm.driverName"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            placeholder="Ex : Mamadou"
          />
        </div>
        <div>
          <label class="text-xs font-bold uppercase tracking-wide text-slate-500">Téléphone</label>
          <input
            v-model="linkForm.driverPhone"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            placeholder="06..."
          />
        </div>
        <div>
          <label class="text-xs font-bold uppercase tracking-wide text-slate-500">ID chauffeur</label>
          <input
            v-model="linkForm.driverId"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            placeholder="Auto si vide"
          />
        </div>
        <div>
          <label class="text-xs font-bold uppercase tracking-wide text-slate-500">Tournée</label>
          <input
            v-model="linkForm.tourneeId"
            type="date"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
        </div>
      </div>

      <div class="mt-4 rounded-lg bg-slate-50 p-3">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Lien généré</p>
        <p class="mt-1 break-all text-sm text-slate-700">{{ driverLink }}</p>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          type="button"
          @click="copyDriverLink"
        >
          Copier le lien
        </button>
        <button
          class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60"
          type="button"
          :disabled="sending"
          @click="sendDriverLink"
        >
          {{ sending ? "Envoi..." : "Envoyer par SMS" }}
        </button>
      </div>
    </section>

    <section v-if="false" class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Formulaire client</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950">Envoyer le formulaire avant l'arrivee chauffeur</h3>
          <p class="mt-1 max-w-2xl text-sm text-slate-600">
            Ajoute les clients de la tournée, puis envoie un formulaire prérempli à chacun.
          </p>
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-col gap-1">
          <p class="text-sm font-bold text-slate-950">Envoi groupé début de tournée</p>
          <p class="text-sm text-slate-600">Ajoute les clients à prévenir. L'adresse est optionnelle et sert seulement à préremplir le formulaire et l'itinéraire.</p>
        </div>

        <div class="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Message envoyé</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              class="rounded-lg px-3 py-2 text-sm font-bold transition"
              type="button"
              :class="clientMessageMode === 'todo' ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
              @click="clientMessageMode = 'todo'"
            >
              À faire
            </button>
            <button
              class="rounded-lg px-3 py-2 text-sm font-bold transition"
              type="button"
              :class="clientMessageMode === 'missed' ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
              @click="clientMessageMode = 'missed'"
            >
              Déjà passé
            </button>
          </div>
          <p class="mt-2 text-sm text-slate-600">
            {{ clientMessageMode === 'todo'
              ? "Message actuel : le client remplit le formulaire avant l'arrivée du chauffeur."
              : "Message dernier passage : le client complète le formulaire car l'enlèvement n'a pas pu être enregistré." }}
          </p>
        </div>

        <div class="mt-4 space-y-3">
          <div
            v-for="(row, index) in clientBulkRows"
            :key="row.id"
            class="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_210px_minmax(0,1.4fr)_44px]"
          >
            <label class="block">
              <span class="text-xs font-bold uppercase tracking-wide text-slate-500">Nom client</span>
              <input
                v-model="row.name"
                class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                :placeholder="index === 0 ? 'Ex : Jean Dupont' : 'Nom client'"
              />
            </label>

            <label class="block">
              <span class="text-xs font-bold uppercase tracking-wide text-slate-500">Téléphone</span>
              <input
                v-model="row.phone"
                class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                :placeholder="index === 0 ? '+33 6 05 97 75 32' : 'Téléphone'"
              />
            </label>

            <label class="block">
              <span class="text-xs font-bold uppercase tracking-wide text-slate-500">Adresse optionnelle</span>
              <input
                v-model="row.address"
                class="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                :placeholder="index === 0 ? 'Adresse d’enlèvement' : 'Adresse'"
              />
            </label>

            <button
              class="mt-6 h-11 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100"
              type="button"
              title="Supprimer la ligne"
              @click="removeClientBulkRow(row.id)"
            >
              X
            </button>
          </div>
        </div>

        <div class="mt-3 rounded-lg bg-white p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Format envoyé</p>
          <p class="mt-1 text-sm text-slate-700">Un lien personnalisé est généré pour chaque client. Si l'adresse est renseignée, elle est préremplie et utilisable dans l'itinéraire.</p>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            type="button"
            @click="addClientBulkRow"
          >
            Ajouter une ligne
          </button>
          <button
            class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60"
            type="button"
            :disabled="sendingClientBulkForm"
            @click="sendBulkClientPickupLink"
          >
            {{ sendingClientBulkForm ? "Envoi..." : `Envoyer à ${validBulkClientRows.length} client(s)` }}
          </button>
          <span class="text-xs font-semibold text-slate-500">
            {{ validBulkClientRows.length }} ligne(s) prête(s)
            <span v-if="clientBulkRows.length > validBulkClientRows.length">
              · {{ clientBulkRows.length - validBulkClientRows.length }} à compléter
            </span>
          </span>
        </div>
      </div>

    </section>

    <section v-if="false" class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Itinéraire client</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950">{{ pickupTabTitle }}</h3>
          <p class="mt-1 max-w-2xl text-sm text-slate-600">{{ pickupTabDescription }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            type="button"
            @click="clearStops"
          >
            Réinitialiser
          </button>
          <button
            class="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            type="button"
            :disabled="routeLoading"
            @click="showPickupPoints"
          >
            {{ routeLoading ? "Chargement..." : hasRouteMapPoints && !hasRouteTrace ? "Réafficher les points" : "Afficher les points" }}
          </button>
          <button
            class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60"
            type="button"
            :disabled="routeLoading"
            @click="calculateOptimizedRoute"
          >
            {{ routeLoading ? "Calcul..." : hasRouteTrace ? "Réactualiser le tracé" : "Estimer et tracer" }}
          </button>
          <button
            class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            type="button"
            @click="openRoute"
          >
            Ouvrir Google Maps
          </button>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-lg px-4 py-2 text-sm font-bold transition"
          type="button"
          :class="pickupTab === 'today' ? 'bg-cyan-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
          @click="pickupTab = 'today'"
        >
          Tournée du jour
          <span class="ml-2 rounded bg-white/20 px-2 py-0.5 text-xs">{{ todayPickupStops.length }}</span>
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm font-bold transition"
          type="button"
          :class="pickupTab === 'clients' ? 'bg-cyan-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
          @click="pickupTab = 'clients'"
        >
          Client
          <span class="ml-2 rounded bg-white/20 px-2 py-0.5 text-xs">{{ clientPickupStops.length }}</span>
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm font-bold transition"
          type="button"
          :class="pickupTab === 'history' ? 'bg-cyan-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
          @click="pickupTab = 'history'"
        >
          Historique
          <span class="ml-2 rounded bg-white/20 px-2 py-0.5 text-xs">{{ historyPickupStops.length }}</span>
        </button>
      </div>

      <div v-if="routeSummary || routeError" class="mt-4 grid gap-3 md:grid-cols-3">
        <div class="rounded-lg bg-cyan-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Distance</p>
          <p class="mt-1 text-2xl font-bold text-slate-950">{{ routeDistanceLabel }}</p>
        </div>
        <div class="rounded-lg bg-emerald-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-emerald-700">Durée estimée</p>
          <p class="mt-1 text-2xl font-bold text-slate-950">{{ routeDurationLabel }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">État</p>
          <p class="mt-1 text-sm font-semibold" :class="routeError ? 'text-red-600' : 'text-emerald-700'">
            {{ routeError || "Trajet prêt" }}
          </p>
        </div>
      </div>

      <div class="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          <div v-if="!pickupStops.length" class="p-4 text-sm text-slate-500">
            {{ emptyPickupTabMessage }}
          </div>
          <div
            v-for="stop in pickupStops"
            :key="stop.id"
            class="grid w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-slate-100 p-3 text-left transition last:border-b-0 hover:bg-slate-50 sm:grid-cols-[24px_minmax(0,1fr)_auto]"
            @click="toggleStop(stop.id)"
          >
            <input
              class="mt-1 h-4 w-4"
              type="checkbox"
              :checked="selectedStopIds.includes(stop.id)"
              @click.stop="toggleStop(stop.id)"
            />
            <span>
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-slate-950">{{ stop.clientName }}</span>
                <span
                  v-if="stopCoordinates[stop.id]"
                  class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"
                >
                  localisé
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {{ stop.source === "planned" ? stop.isToday ? "Ramassage du jour" : "Client" : stop.source === "enlevement" ? "Formulaire reçu" : stop.status === "VALIDATED" ? "Validée" : "En attente" }}
                </span>
              </span>
              <span class="mt-1 block text-xs text-slate-600">{{ stop.address }}</span>
              <span class="mt-1 block text-xs text-slate-400">
                {{ stop.destination || "Destination inconnue" }}
                <span v-if="stop.reservationDate">• {{ stop.reservationDate }}</span>
                <span v-if="stop.reservationTime">à {{ stop.reservationTime }}</span>
                <span v-if="stop.colis">• {{ stop.colis }} colis</span>
              </span>
            </span>
            <button
              v-if="stop.source === 'planned' && stop.isToday"
              class="col-start-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 sm:col-start-auto"
              type="button"
              @click.stop="deletePlannedPickup(stop)"
            >
              Supprimer
            </button>
          </div>
        </div>

        <div class="rounded-lg bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Tournée sélectionnée</p>
          <p class="mt-1 text-2xl font-bold text-slate-950">{{ selectedStops.length }}</p>
          <p class="text-sm text-slate-500">point(s) de ramassage</p>

          <ol v-if="selectedStops.length" class="mt-4 space-y-2 text-sm text-slate-700">
            <li v-for="stop in orderedStops" :key="stop.id">
              <span class="flex items-start justify-between gap-2 rounded-lg bg-white p-2 shadow-sm">
                <span>
                  <span class="font-semibold">{{ stop.clientName }}</span>
                  <span class="block text-xs text-slate-500">{{ stop.address }}</span>
                  <span v-if="stopCoordinates[stop.id]" class="block text-[11px] text-slate-400">
                    {{ formatCoordinate(stopCoordinates[stop.id].lat) }}, {{ formatCoordinate(stopCoordinates[stop.id].lon) }}
                  </span>
                </span>
                <button
                  class="shrink-0 rounded-md border border-red-100 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"
                  type="button"
                  @click="removeStop(stop.id)"
                >
                  Retirer
                </button>
              </span>
            </li>
          </ol>

          <p v-if="selectedLocation" class="mt-4 text-xs text-slate-500">
            Départ : {{ selectedLocation.driverName || selectedLocation.driverId }}
          </p>
          <p v-else class="mt-4 text-xs text-amber-700">
            Sélectionne un chauffeur actif pour utiliser sa position comme départ.
          </p>
        </div>
      </div>

      <div v-if="routePreview" class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <div class="border-b border-slate-200 bg-white px-4 py-3">
          <p class="text-sm font-bold text-slate-950">Aperçu du trajet</p>
          <p class="text-xs text-slate-500">Vue simplifiée des points et de l’ordre conseillé.</p>
        </div>
        <div class="p-4">
          <p class="text-sm font-semibold text-slate-700">
            L’aperçu principal est maintenant affiché sur la vraie carte en bas de page.
          </p>
          <p class="mt-1 text-xs text-slate-500">
            Utilise “Retirer”, puis “Réactualiser” pour mettre à jour les points.
          </p>
        </div>
      </div>
    </section>

    <div class="grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-200 p-4">
          <h3 class="font-bold text-slate-950">Positions</h3>
        </div>

        <div v-if="!visibleLocations.length" class="p-5 text-sm text-slate-500">
          Aucun chauffeur actif pour le moment.
          <button
            v-if="hiddenCount"
            class="mt-2 block text-sm font-bold text-cyan-800 hover:underline"
            type="button"
            @click="showAllDrivers"
          >
            Réafficher les chauffeurs masqués
          </button>
        </div>

        <div v-else class="divide-y divide-slate-100">
          <div
            v-for="loc in visibleLocations"
            :key="getLocationDocId(loc)"
            class="block w-full cursor-pointer p-4 text-left transition hover:bg-slate-50"
            role="button"
            tabindex="0"
            @click="selectedId = getLocationDocId(loc)"
            @keydown.enter="selectedId = getLocationDocId(loc)"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="flex items-center gap-2 font-semibold text-slate-950">
                  <span
                    class="h-3 w-3 rounded-full"
                    :style="{ backgroundColor: getDriverColor(getLocationDocId(loc) || loc.driverId) }"
                  ></span>
                  {{ loc.driverName || loc.driverId }}
                </p>
                <p class="mt-1 text-xs text-slate-500">Tournée {{ loc.tourneeId || "—" }}</p>
              </div>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-bold"
                :class="loc.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'"
              >
                {{ stoppedDriverIds.includes(getLocationDocId(loc)) || loc.status === "stopped" ? "Arrêté" : loc.isActive ? "Actif" : loc.status || "inactif" }}
              </span>
            </div>
            <p class="mt-2 text-xs text-slate-500">Dernière mise à jour : {{ loc.updatedAtLabel }}</p>
            <p class="mt-1 text-xs text-slate-400">
              {{ loc.latitude.toFixed(5) }}, {{ loc.longitude.toFixed(5) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2" @click.stop>
              <button
                class="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                type="button"
                @click="hideDriver(getLocationDocId(loc))"
              >
                Masquer
              </button>
              <button
                v-if="stoppedDriverIds.includes(getLocationDocId(loc)) || loc.status === 'stopped'"
                class="rounded-md border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                type="button"
                @click="continueDriver(loc)"
              >
                Continuer
              </button>
              <button
                v-else
                class="rounded-md border border-amber-200 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50"
                type="button"
                @click="stopDriver(loc)"
              >
                Arrêter
              </button>
              <button
                class="rounded-md border border-red-100 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                type="button"
                @click="removeDriverPosition(loc)"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 class="font-bold text-slate-950">
              {{ hasRouteMapPoints ? "Carte de tournée" : selectedLocation?.driverName || selectedLocation?.driverId || "Carte" }}
            </h3>
            <p class="text-xs text-slate-500">
              {{
                hasRouteMapPoints
                  ? `${orderedStops.length} point(s) de ramassage sur la carte`
                  : selectedLocation
                    ? `Dernière position : ${selectedLocation.updatedAtLabel}`
                    : "Sélectionne un chauffeur"
              }}
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              v-if="selectedStops.length"
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              type="button"
              :disabled="routeLoading"
              @click="showPickupPoints"
            >
              {{ routeLoading ? "Chargement..." : "Afficher points" }}
            </button>
            <button
              v-if="selectedStops.length"
              class="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-60"
              type="button"
              :disabled="routeLoading"
              @click="calculateOptimizedRoute"
            >
              {{ routeLoading ? "Calcul..." : "Estimer/tracer" }}
            </button>
            <button
              v-if="selectedLocation"
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              type="button"
              @click="openExternalMap(selectedLocation)"
            >
              Ouvrir Maps
            </button>
          </div>
        </div>

        <div v-if="hasRouteMapPoints" class="relative h-[520px] overflow-hidden bg-slate-100">
          <div ref="tourMapEl" class="h-full w-full"></div>
          <div class="absolute bottom-4 left-4 right-4 rounded-lg bg-white/95 p-3 shadow-sm">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-sm font-bold text-slate-950">D = chauffeur, 1, 2, 3... = ordre des ramassages</p>
                <p class="text-xs text-slate-500">Couleur du chauffeur stable par transporteur. Retire un enlèvement, puis réactualise.</p>
              </div>
              <button
                class="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-800"
                type="button"
                @click="openRoute"
              >
                Ouvrir Google Maps
              </button>
            </div>
          </div>
        </div>
        <iframe
          v-else-if="mapUrl"
          class="h-[520px] w-full"
          :src="mapUrl"
          loading="lazy"
        ></iframe>
        <div v-else class="flex h-[520px] items-center justify-center text-sm text-slate-500">
          Aucune position à afficher.
        </div>
      </section>
    </div>
  </section>
</template>
