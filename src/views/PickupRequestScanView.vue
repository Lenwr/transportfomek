<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { StreamBarcodeReader } from "vue-barcode-reader"
import { toast } from "vue3-toastify"

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

function extractRequestId(text) {
  const raw = normalizeScanText(text)
  if (!raw) return ""

  if (raw.toUpperCase().startsWith("PR:")) {
    return raw.slice(3).trim()
  }

  const hashMatch = raw.match(/#\/validate-request\/([^/?#]+)/i)
  if (hashMatch?.[1]) return decodeURIComponent(hashMatch[1])

  const pathMatch = raw.match(/\/validate-request\/([^/?#]+)/i)
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1])

  if (!raw.includes(" ") && !raw.includes("|") && raw.length >= 8) {
    return raw
  }

  return ""
}

function openRequest(text) {
  if (scanLocked.value) return

  const raw = normalizeScanText(text)
  const requestId = extractRequestId(raw)
  lastScan.value = raw
  error.value = ""

  if (!requestId) {
    error.value = "Code invalide. Le QR doit contenir PR:ID_DEMANDE."
    toast(error.value, { type: "error" })
    return
  }

  scanLocked.value = true
  toast("Demande trouvée, ouverture de la validation...", { type: "success", autoClose: 900 })
  router.push(`/validate-request/${requestId}`)
}

function onDecode(text) {
  openRequest(text)
}

function submitManualCode() {
  openRequest(manualCode.value)
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Demandes client</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Scanner une demande d'enlèvement</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Scanne le QR affiché dans le portail client pour ouvrir sa demande, vérifier les colis sur place,
            puis valider ou refuser l'enlèvement.
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
          Colle un QR complet, un code <span class="font-semibold">PR:...</span>, ou directement l'ID de demande.
        </p>

        <form class="mt-4 flex flex-col gap-3 sm:flex-row" @submit.prevent="submitManualCode">
          <input
            v-model="manualCode"
            class="block flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            placeholder="PR:id_demande"
          />
          <button
            class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800"
            type="submit"
          >
            Ouvrir demande
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
          <p class="text-sm font-bold text-cyan-950">Workflow terrain</p>
          <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-cyan-950">
            <li>Scanner le QR client dans son portail.</li>
            <li>Vérifier les colis, photos, téléphone et destination.</li>
            <li>Créer l'enlèvement si tout est correct.</li>
            <li>Générer ensuite les vraies étiquettes QR colis.</li>
          </ol>
        </div>
      </section>
    </div>
  </section>
</template>
