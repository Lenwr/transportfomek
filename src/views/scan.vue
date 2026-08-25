<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute } from "vue-router"
import { StreamBarcodeReader } from "vue-barcode-reader"
import { useFirestore } from "vuefire"
import { doc, updateDoc, getDoc } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { jsPDF } from "jspdf"
import { format } from "date-fns"
import frLocale from "date-fns/locale/fr"

const db = useFirestore()
const route = useRoute()

const scannedText = ref("")
const detailId = ref(route.params.id)
const docRef = doc(db, "chargements", detailId.value)
const chargement = ref({ packagesTable: [] })

const scanLock = ref(false)
const lastScannedValue = ref("")
const isExporting = ref(false)

const onLoaded = () => {
  console.log("Scanner chargé")
}

const isPhone = (s) => /^\+?\d{8,}$/.test((s || "").replace(/\s/g, ""))

function normalizeLegacyParts(parts) {
  let [
    expediteur = "",
    destinataire = "",
    nombreDeColis = "0",
    clientId = "",
    colisIndexStr = "0",
    detailIndexStr = "0",
    coli = "",
    telDest = ""
  ] = parts.map((s) => (s ?? "").trim())

  if (!telDest && isPhone(nombreDeColis)) {
    telDest = nombreDeColis
    nombreDeColis = "0"
  }

  return {
    source: "legacy",
    expediteur,
    destinataire,
    nombreDeColis: Number(nombreDeColis) || 0,
    clientId,
    colisIndex: Number(colisIndexStr) || 0,
    detailIndex: Number(detailIndexStr) || 0,
    coli,
    telephoneDestinataire: telDest || ""
  }
}

function normalizeScanText(text) {
  return String(text || "")
    .trim()
    .replaceAll("¶", "|")
}

function parseScannedText(text) {
  const raw = normalizeScanText(text)
  if (!raw) return null

  console.log("SCAN BRUT:", text)
  console.log("SCAN NORMALISÉ:", raw)

  // Format compact barcode :
  // TF|clientId|colisIndex|detailIndex (AT reste accepté pour les anciennes étiquettes)
  if (raw.startsWith("TF|") || raw.startsWith("AT|")) {
    const parts = raw.split("|")
    if (parts.length < 4) return null

    const [, clientId = "", colisIndexStr = "0", detailIndexStr = "0"] = parts

    return {
      source: "compact",
      clientId: clientId.trim(),
      colisIndex: Number(colisIndexStr) || 0,
      detailIndex: Number(detailIndexStr) || 0,
      coli: "",
      telephoneDestinataire: ""
    }
  }

  // Ancien QR CSV
  if (raw.includes(",")) {
    const parts = raw.split(",").map((s) => s?.trim())
    if (parts.length >= 8) {
      return normalizeLegacyParts(parts)
    }
  }

  // Fallback pipe sans préfixe
  if (raw.includes("|")) {
    const parts = raw.split("|")
    if (parts.length >= 3) {
      const [clientId = "", colisIndexStr = "0", detailIndexStr = "0"] = parts
      return {
        source: "minimal",
        clientId: clientId.trim(),
        colisIndex: Number(colisIndexStr) || 0,
        detailIndex: Number(detailIndexStr) || 0,
        coli: "",
        telephoneDestinataire: ""
      }
    }
  }

  return null
}

function formatDateTime(value) {
  if (!value) return "-"
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value)
  return format(d, "EEEE d MMMM yyyy - HH'h' mm", { locale: frLocale })
}

function formatDateShort(value) {
  if (!value) return "-"
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value)
  return format(d, "dd/MM/yyyy HH:mm", { locale: frLocale })
}

const packagesSorted = computed(() =>
  [...(chargement.value?.packagesTable || [])].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  )
)

const totalScanned = computed(() => packagesSorted.value.length)

const totalColis = computed(() =>
  packagesSorted.value.reduce((sum, item) => sum + Number(item.nombreDeColis || 0), 0)
)

async function chargerChargement() {
  try {
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      chargement.value = { id: snap.id, ...snap.data() }
    }
  } catch (e) {
    console.error("Erreur chargement :", e)
  }
}

async function buildItemFromEnlevement(parsed) {
  const enlevRef = doc(db, "enlevements", parsed.clientId)
  const snap = await getDoc(enlevRef)

  if (!snap.exists()) {
    throw new Error("Enlèvement introuvable")
  }

  const data = snap.data()
  const colisArr = Array.isArray(data.colis) ? data.colis : []
  const group = colisArr[parsed.colisIndex]

  if (!group) {
    throw new Error("Colis introuvable dans l'enlèvement")
  }

  let coliLabel = ""

  if (Array.isArray(group.details) && group.details.length) {
    const detail = group.details[parsed.detailIndex]
    if (!detail) {
      throw new Error("Détail colis introuvable")
    }
    coliLabel = detail.coli || ""
  } else if (group.quantite && group.quantite > 1) {
    coliLabel = `${group.nom} - ${parsed.detailIndex + 1}/${group.quantite}`
  } else {
    coliLabel = group.nom || `Colis ${parsed.colisIndex + 1}`
  }

  return {
    id: `${parsed.clientId}-${parsed.colisIndex}-${parsed.detailIndex}`,
    expediteur: data.expediteur || "",
    destinataire: data.destinataire || "",
    telephoneDestinataire: data.telephoneDestinataire || "",
    coli: coliLabel,
    nombreDeColis: Number(data.nombreDeColis) || 0,
    clientId: parsed.clientId,
    colisIndex: parsed.colisIndex,
    detailIndex: parsed.detailIndex,
    chargementId: detailId.value
  }
}

async function markEnlevementAsReceived(clientId, colisIndex, detailIndex) {
  const enlevRef = doc(db, "enlevements", clientId)
  const snap = await getDoc(enlevRef)

  if (!snap.exists()) return

  const data = snap.data()
  const arr = Array.isArray(data.colis) ? [...data.colis] : []
  const group = arr[colisIndex]

  if (!group) return

  if (Array.isArray(group.details) && group.details[detailIndex]) {
    const newDetails = [...group.details]
    newDetails[detailIndex] = {
      ...newDetails[detailIndex],
      statutColis: "réceptionné"
    }

    arr[colisIndex] = {
      ...group,
      details: newDetails
    }
  } else {
    arr[colisIndex] = {
      ...group,
      statutColis: "réceptionné"
    }
  }

  await updateDoc(enlevRef, { colis: arr })
}

async function onDecode(text) {
  if (scanLock.value && text === lastScannedValue.value) return

  try {
    scannedText.value = text
    const parsed = parseScannedText(text)

    if (!parsed?.clientId) {
      toast("Code invalide", { type: "error" })
      return
    }

    scanLock.value = true
    lastScannedValue.value = text

    const itemBase =
      parsed.source === "legacy" && parsed.expediteur
        ? {
            id: `${parsed.clientId}-${parsed.colisIndex}-${parsed.detailIndex}`,
            expediteur: parsed.expediteur,
            destinataire: parsed.destinataire,
            telephoneDestinataire: parsed.telephoneDestinataire,
            coli: parsed.coli,
            nombreDeColis: Number(parsed.nombreDeColis) || 0,
            clientId: parsed.clientId,
            colisIndex: parsed.colisIndex,
            detailIndex: parsed.detailIndex,
            chargementId: detailId.value
          }
        : await buildItemFromEnlevement(parsed)

    const deja = chargement.value?.packagesTable?.some((i) => i.id === itemBase.id)
    if (deja) {
      toast(`⚠️ Le colis ${itemBase.coli || itemBase.id} a déjà été scanné.`, {
        type: "info",
        autoClose: 1800
      })
      return
    }

    const nowIso = new Date().toISOString()

    const newItem = {
      ...itemBase,
      date: nowIso,
      status: "réceptionné",
      historique: [{ status: "réceptionné", date: nowIso }]
    }

    const newList = [...(chargement.value?.packagesTable || []), newItem]

    await updateDoc(docRef, { packagesTable: newList })

    chargement.value = {
      ...(chargement.value || {}),
      packagesTable: newList
    }

    await markEnlevementAsReceived(
      itemBase.clientId,
      itemBase.colisIndex,
      itemBase.detailIndex
    )

    toast("✅ Colis ajouté avec succès", {
      type: "success",
      autoClose: 1500
    })
  } catch (e) {
    console.error("Erreur pendant le scan :", e)
    toast("Erreur pendant le scan", { type: "error" })
  } finally {
    setTimeout(() => {
      scanLock.value = false
    }, 1200)
  }
}

function drawPdfHeader(pdf, title) {
  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, 0, 210, 24, "F")

  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(16)
  pdf.text("TRANSPORT FOMEK", 14, 15)

  pdf.setFontSize(13)
  pdf.text(title, 196, 15, { align: "right" })

  pdf.setTextColor(0, 0, 0)
}

function drawPdfMeta(pdf) {
  pdf.setDrawColor(220, 220, 220)
  pdf.setFillColor(248, 250, 252)
  pdf.roundedRect(14, 30, 182, 24, 3, 3, "FD")

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("Chargement :", 20, 40)
  pdf.text("Lignes scannées :", 95, 40)
  pdf.text("Total colis :", 150, 40)

  pdf.setFont("helvetica", "normal")
  pdf.text(detailId.value || "-", 20, 47)
  pdf.text(String(totalScanned.value), 95, 47)
  pdf.text(String(totalColis.value), 150, 47)
}

function drawScannedTableHeader(pdf, y) {
  pdf.setFillColor(226, 232, 240)
  pdf.rect(14, y, 182, 10, "F")

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(9)

  pdf.text("Expéditeur", 16, y + 6.5)
  pdf.text("Destinataire", 54, y + 6.5)
  pdf.text("Colis", 95, y + 6.5)
  pdf.text("Qté", 148, y + 6.5)
  pdf.text("Date", 160, y + 6.5)
}

function exportListeScanneePDF() {
  try {
    isExporting.value = true

    const pdf = new jsPDF("p", "mm", "a4")
    drawPdfHeader(pdf, "Liste scannée")
    drawPdfMeta(pdf)

    let y = 62
    const pageHeight = 297
    const bottomLimit = 280

    drawScannedTableHeader(pdf, y)
    y += 10

    if (!packagesSorted.value.length) {
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(11)
      pdf.text("Aucun colis scanné pour le moment.", 14, y + 8)
      pdf.save(`liste_scannee_${detailId.value}.pdf`)
      return
    }

    for (const item of packagesSorted.value) {
      const exp = String(item.expediteur || "-")
      const dest = String(item.destinataire || "-")
      const coli = String(item.coli || "-")
      const qty = String(item.nombreDeColis || 0)
      const dateTxt = formatDateShort(item.date)

      const expLines = pdf.splitTextToSize(exp, 34)
      const destLines = pdf.splitTextToSize(dest, 38)
      const coliLines = pdf.splitTextToSize(coli, 50)
      const dateLines = pdf.splitTextToSize(dateTxt, 28)

      const maxLines = Math.max(
        expLines.length,
        destLines.length,
        coliLines.length,
        dateLines.length,
        1
      )

      const rowHeight = Math.max(10, maxLines * 5 + 3)

      if (y + rowHeight > bottomLimit) {
        pdf.addPage()
        drawPdfHeader(pdf, "Liste scannée")
        y = 20
        drawScannedTableHeader(pdf, y)
        y += 10
      }

      pdf.setDrawColor(230, 230, 230)
      pdf.rect(14, y, 182, rowHeight)

      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(8.5)

      pdf.text(expLines, 16, y + 5)
      pdf.text(destLines, 54, y + 5)
      pdf.text(coliLines, 95, y + 5)
      pdf.text(qty, 150, y + 5)
      pdf.text(dateLines, 160, y + 5)

      y += rowHeight
    }

    pdf.save(`liste_scannee_${detailId.value}.pdf`)
  } catch (e) {
    console.error(e)
    toast("Erreur export PDF", { type: "error" })
  } finally {
    isExporting.value = false
  }
}

onMounted(chargerChargement)
</script>

<template>
  <div class="min-h-screen overflow-x-hidden bg-slate-950 text-white">
    <div class="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 lg:px-6">
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold">Scanner colis</h1>
          <p class="text-slate-300 text-sm">
            Scan QR / barcode et export de la liste scannée
          </p>
        </div>

        <button
          class="rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60"
          @click="exportListeScanneePDF"
          :disabled="isExporting"
        >
          {{ isExporting ? "Export PDF..." : "Exporter PDF lisible" }}
        </button>
      </div>

      <div class="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div class="rounded-2xl bg-black border border-slate-800 overflow-hidden min-h-[340px] flex items-center justify-center shadow-lg">
          <StreamBarcodeReader
            @decode="onDecode"
            @loaded="onLoaded"
          />
        </div>

        <div class="space-y-4">
          <div class="rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-lg">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="rounded-xl bg-slate-800 p-4">
                <p class="text-slate-400 text-xs uppercase tracking-wide">Lignes scannées</p>
                <p class="text-2xl font-bold mt-1">{{ totalScanned }}</p>
              </div>

              <div class="rounded-xl bg-slate-800 p-4">
                <p class="text-slate-400 text-xs uppercase tracking-wide">Total colis</p>
                <p class="text-2xl font-bold mt-1">{{ totalColis }}</p>
              </div>

              <div class="rounded-xl bg-slate-800 p-4">
                <p class="text-slate-400 text-xs uppercase tracking-wide">Chargement</p>
                <p class="text-sm font-semibold mt-2 break-all">{{ detailId }}</p>
              </div>
            </div>

            <div class="mt-4 rounded-xl bg-slate-800 p-4">
              <p class="text-slate-400 text-xs uppercase tracking-wide mb-2">Dernier scan</p>
              <p class="text-sm break-all text-white">
                {{ scannedText || "—" }}
              </p>
            </div>
          </div>

          <div class="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-800">
              <h2 class="font-semibold text-base">Liste des colis scannés</h2>
            </div>

            <!-- Mobile -->
            <div class="md:hidden p-3 space-y-3 max-h-[55vh] overflow-y-auto">
              <div
                v-for="(item, i) in packagesSorted"
                :key="item.id || i"
                class="rounded-xl bg-slate-800 p-4 border border-slate-700"
              >
                <div class="grid grid-cols-1 gap-2 text-sm">
                  <div><span class="text-slate-400">Expéditeur :</span> {{ item.expediteur }}</div>
                  <div><span class="text-slate-400">Destinataire :</span> {{ item.destinataire }}</div>
                  <div><span class="text-slate-400">Téléphone :</span> {{ item.telephoneDestinataire || "—" }}</div>
                  <div><span class="text-slate-400">Colis :</span> {{ item.coli }}</div>
                  <div><span class="text-slate-400">Qté :</span> {{ item.nombreDeColis }}</div>
                  <div><span class="text-slate-400">Date :</span> {{ formatDateTime(item.date) }}</div>
                  <div><span class="text-slate-400">Statut :</span> {{ item.status }}</div>
                </div>
              </div>

              <div
                v-if="packagesSorted.length === 0"
                class="rounded-xl bg-slate-800 p-6 text-center text-slate-400"
              >
                Aucun colis scanné pour le moment
              </div>
            </div>

            <!-- Desktop -->
            <div class="hidden md:block overflow-auto max-h-[65vh]">
              <table class="w-full min-w-[980px]">
                <thead class="bg-slate-800 text-slate-200 sticky top-0">
                  <tr>
                    <th class="text-left text-sm font-semibold px-4 py-3">Expéditeur</th>
                    <th class="text-left text-sm font-semibold px-4 py-3">Destinataire</th>
                    <th class="text-left text-sm font-semibold px-4 py-3">Téléphone</th>
                    <th class="text-left text-sm font-semibold px-4 py-3">Colis</th>
                    <th class="text-left text-sm font-semibold px-4 py-3">Qté</th>
                    <th class="text-left text-sm font-semibold px-4 py-3">Date</th>
                    <th class="text-left text-sm font-semibold px-4 py-3">Statut</th>
                  </tr>
                </thead>

                <tbody>
                  <tr
                    v-for="(item, i) in packagesSorted"
                    :key="item.id || i"
                    class="border-t border-slate-800 hover:bg-slate-800/60"
                  >
                    <td class="px-4 py-3 text-sm">{{ item.expediteur }}</td>
                    <td class="px-4 py-3 text-sm">{{ item.destinataire }}</td>
                    <td class="px-4 py-3 text-sm">{{ item.telephoneDestinataire || "—" }}</td>
                    <td class="px-4 py-3 text-sm">{{ item.coli }}</td>
                    <td class="px-4 py-3 text-sm">{{ item.nombreDeColis }}</td>
                    <td class="px-4 py-3 text-sm whitespace-nowrap">{{ formatDateTime(item.date) }}</td>
                    <td class="px-4 py-3 text-sm">
                      <span class="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-1 text-xs font-semibold">
                        {{ item.status || "—" }}
                      </span>
                    </td>
                  </tr>

                  <tr v-if="packagesSorted.length === 0">
                    <td colspan="7" class="px-4 py-8 text-center text-slate-400">
                      Aucun colis scanné pour le moment
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
table {
  border-collapse: collapse;
}

th,
td {
  vertical-align: top;
}
</style>
