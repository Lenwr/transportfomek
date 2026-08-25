<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { StreamBarcodeReader } from "vue-barcode-reader"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

const router = useRouter()
const manualCode = ref("")
const lastScan = ref("")
const error = ref("")
const cameraEnabled = ref(true)
const scanLocked = ref(false)

function normalizeScanText(text) {
  return String(text || "")
    .trim()
    .replaceAll("¶", "|")
}

function parseDeliveryCode(text) {
  const raw = normalizeScanText(text)
  if (!raw) return null

  if (raw.startsWith("TF|") || raw.startsWith("AT|")) {
    const [, clientId = "", colisIndex = "0", detailIndex = "0"] = raw.split("|")
    return {
      clientId: clientId.trim(),
      colisIndex: Number(colisIndex) || 0,
      detailIndex: Number(detailIndex) || 0,
    }
  }

  if (raw.includes("|")) {
    const [clientId = "", colisIndex = "0", detailIndex = "0"] = raw.split("|")
    return {
      clientId: clientId.trim(),
      colisIndex: Number(colisIndex) || 0,
      detailIndex: Number(detailIndex) || 0,
    }
  }

  return null
}

function openSignature(text) {
  if (scanLocked.value) return

  const parsed = parseDeliveryCode(text)
  lastScan.value = normalizeScanText(text)
  error.value = ""

  if (!parsed?.clientId) {
    error.value = "Code invalide. Le QR doit contenir la référence colis."
    toast(error.value, { type: "error" })
    return
  }

  scanLocked.value = true
  router.push({
    path: `/sign/${parsed.clientId}`,
    query: {
      colisIndex: parsed.colisIndex,
      detailIndex: parsed.detailIndex,
    },
  })
}

function onDecode(text) {
  openSignature(text)
}

function submitManualCode() {
  openSignature(manualCode.value)
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Livraison</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Scanner un colis à l'arrivée</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Scanne l'étiquette QR/barcode du colis, renseigne la personne qui le reçoit, puis le statut passe en livré.
          </p>
        </div>

        <button
          class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:border-cyan-200 hover:text-cyan-800"
          type="button"
          @click="cameraEnabled = !cameraEnabled"
        >
          {{ cameraEnabled ? "Masquer caméra" : "Afficher caméra" }}
        </button>
      </div>
    </div>

    <div class="grid min-w-0 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section class="overflow-hidden rounded-lg border border-slate-900 bg-slate-950 shadow-sm">
        <div class="border-b border-slate-800 px-4 py-3">
          <p class="text-sm font-bold text-white">Caméra de scan</p>
        </div>
        <div v-if="cameraEnabled" class="flex min-h-[320px] items-center justify-center">
          <StreamBarcodeReader @decode="onDecode" />
        </div>
        <div v-else class="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-slate-300">
          Caméra désactivée.
        </div>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="font-bold text-slate-950">Saisie manuelle</h3>
        <p class="mt-1 text-sm text-slate-500">
          Utile avec une douchette USB ou si la caméra ne lit pas le code.
        </p>

        <form class="mt-4 flex flex-col gap-3 sm:flex-row" @submit.prevent="submitManualCode">
          <input
            v-model="manualCode"
            class="block flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            placeholder="AT|id_enlevement|index_colis|index_detail"
          />
          <button
            class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800"
            type="submit"
          >
            Ouvrir signature
          </button>
        </form>

        <div class="mt-5 rounded-lg bg-slate-50 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Dernier code lu</p>
          <p class="mt-1 break-all text-sm text-slate-700">{{ lastScan || "Aucun scan pour le moment" }}</p>
        </div>

        <div v-if="error" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {{ error }}
        </div>

        <div class="mt-5 rounded-lg border border-cyan-100 bg-cyan-50 p-4">
          <p class="text-sm font-bold text-cyan-950">Workflow</p>
          <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-cyan-950">
            <li>Scanner l'étiquette du colis.</li>
            <li>Indiquer le nom de la personne qui reçoit.</li>
            <li>Joindre sa pièce d’identité si nécessaire.</li>
            <li>Le colis est marqué livré.</li>
          </ol>
        </div>
      </section>
    </div>
  </section>
</template>
