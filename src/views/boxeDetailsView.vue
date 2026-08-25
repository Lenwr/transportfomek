<!-- src/views/boxes/BoxDetailsView.vue -->
<script setup>
import { computed, ref, watch, watchEffect } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useFirestore, useDocument, useCollection } from "vuefire"
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

const route = useRoute()
const router = useRouter()
const db = useFirestore()

/* =========================================================
   LOAD BOX
========================================================= */
const boxId = computed(() => String(route.params.id || "").trim())
const boxRef = computed(() => (boxId.value ? doc(db, "boxes", boxId.value) : null))
const boxSnap = useDocument(boxRef)
const box = computed(() => boxSnap.value || null)

/* =========================================================
   LOAD CONTRACT HISTORY (par boxId)
========================================================= */
const contractsQuery = computed(() => {
  if (!boxId.value) return null
  return query(
    collection(db, "contracts"),
    where("boxId", "==", boxId.value),
    orderBy("createdAt", "desc")
  )
})

const contractsSnap = useCollection(contractsQuery)
const contracts = computed(() => contractsSnap.value || [])

const activeContract = computed(() =>
  contracts.value.find((c) => c.status === "active" || c.status === "signed")
)

/* =========================================================
   PAYMENTS LIST (Encaissements) — UNIFIÉ: collection "payments"
========================================================= */
const selectedContractId = ref("")

watch(
  [contracts, activeContract],
  () => {
    if (!selectedContractId.value) {
      selectedContractId.value = activeContract.value?.id || contracts.value?.[0]?.id || ""
    }
  },
  { immediate: true }
)

const paymentsQuery = computed(() => {
  const cid = String(selectedContractId.value || "").trim()
  if (!cid) return null

  return query(
    collection(db, "payments"),
    where("contractId", "==", cid),
    orderBy("paidAt", "desc")
  )
})

const paymentsSnap = useCollection(paymentsQuery)
const payments = computed(() => paymentsSnap.value || [])

/* =========================================================
   EDIT FORM
========================================================= */
const formBox = ref({
  code: "",
  size: "S",
  volumeM3: 0,
  priceMonthly: 0,
  locationNote: "",
  status: "available",
})

watchEffect(() => {
  if (!box.value) return
  formBox.value = {
    code: box.value.code || "",
    size: box.value.size || "S",
    volumeM3: Number(box.value.volumeM3 || 0),
    priceMonthly: Number(box.value.priceMonthly || 0),
    locationNote: box.value.locationNote || "",
    status: box.value.status || "available",
  }
})

/* =========================================================
   HELPERS
========================================================= */
function norm(s) {
  return String(s || "").toLowerCase().trim()
}

function money(n) {
  return Number(n || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function toDateFR(v) {
  if (!v) return "—"
  if (v?.toDate) {
    const d = v.toDate()
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}/${d.getFullYear()}`
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [yyyy, mm, dd] = v.slice(0, 10).split("-")
    return `${dd}/${mm}/${yyyy}`
  }
  if (v instanceof Date) {
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(
      2,
      "0"
    )}/${v.getFullYear()}`
  }
  return "—"
}

const statusLabel = (st) => {
  const s = norm(st)
  if (s === "available") return "Disponible"
  if (s === "rented") return "Loué"
  if (s === "reserved") return "Réservé"
  if (s === "maintenance") return "Maintenance"
  if (s === "active") return "Actif"
  if (s === "signed") return "Signé"
  if (s === "closed") return "Clôturé"
  return st || "—"
}

const statusClass = (st) => {
  const s = norm(st)
  if (s === "available") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (s === "rented") return "bg-indigo-100 text-indigo-800 border-indigo-200"
  if (s === "signed") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (s === "active") return "bg-indigo-100 text-indigo-800 border-indigo-200"
  if (s === "closed") return "bg-slate-100 text-slate-700 border-slate-200"
  return "bg-slate-100 text-slate-800 border-slate-200"
}

/* =========================================================
   ACTIONS
========================================================= */
function goContract(cid) {
  if (!cid) return
  router.push(`/contracts/${cid}`)
}

async function saveBox() {
  try {
    if (!boxId.value) return
    if (!formBox.value.code?.trim()) {
      toast("Le code est obligatoire", { type: "warning" })
      return
    }

    await updateDoc(doc(db, "boxes", boxId.value), {
      code: formBox.value.code.trim(),
      size: formBox.value.size,
      volumeM3: Number(formBox.value.volumeM3 || 0),
      priceMonthly: Number(formBox.value.priceMonthly || 0),
      locationNote: String(formBox.value.locationNote || "").trim(),
      status: formBox.value.status,
      updatedAt: serverTimestamp(),
    })

    toast("Box mis à jour ✅", { type: "success" })
    const modal = document.getElementById("my_modal_update")
    if (modal?.close) modal.close()
  } catch (e) {
    console.error(e)
    toast("Erreur mise à jour ❌", { type: "error" })
  }
}

const selectedContract = computed(
  () => contracts.value.find((c) => c.id === selectedContractId.value) || null
)

const totalPaidForSelected = computed(() =>
  payments.value.reduce((sum, p) => sum + Number(p.amount || p.amountTTC || 0), 0)
)
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50 text-slate-900">
    <div class="max-w-[1100px] mx-auto px-4 py-6 space-y-6">
      <!-- HEADER -->
      <div class="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold">Détails du box</h1>
          <p class="text-sm text-slate-600">
            ID : <span class="font-mono break-all">{{ boxId }}</span>
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm" @click="router.back()">← Retour</button>

          <button
            v-if="activeContract"
            class="btn btn-sm btn-outline"
            @click="goContract(activeContract.id)"
          >
            Voir contrat actif
          </button>

          <button class="btn btn-sm btn-primary" onclick="my_modal_update.showModal()">
            Modifier
          </button>
        </div>
      </div>

      <!-- BOX CARD -->
      <div v-if="box" class="rounded-2xl bg-white p-6 shadow border">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-2xl font-extrabold">{{ box.code }}</div>
            <div class="text-sm text-slate-600 mt-1">
              Taille : <span class="font-semibold">{{ box.size }}</span>
              <span v-if="box.volumeM3"> • {{ box.volumeM3 }} m³</span>
            </div>
            <div class="text-sm text-slate-600 mt-1">
              {{ box.locationNote }}
            </div>
          </div>

          <span class="text-xs font-bold px-2 py-1 rounded-full border" :class="statusClass(box.status)">
            {{ statusLabel(box.status) }}
          </span>
        </div>

        <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-slate-50 p-4 rounded-xl border">
            <div class="text-xs text-slate-500">Prix / mois</div>
            <div class="text-xl font-extrabold">{{ money(box.priceMonthly) }} €</div>
          </div>

          <div class="bg-slate-50 p-4 rounded-xl border">
            <div class="text-xs text-slate-500">Contrats total</div>
            <div class="text-xl font-extrabold">{{ contracts.length }}</div>
          </div>

          <div class="bg-slate-50 p-4 rounded-xl border">
            <div class="text-xs text-slate-500">Contrat actif</div>
            <div class="text-sm font-bold break-all">
              {{ activeContract?.id || "Aucun" }}
            </div>
          </div>
        </div>
      </div>

      <!-- CONTRACT HISTORY -->
      <div class="rounded-2xl bg-white border shadow p-5">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-extrabold">Historique des contrats</h2>
        </div>

        <div v-if="!contracts.length" class="text-sm text-slate-500 mt-3">
          Aucun contrat pour ce box.
        </div>

        <div v-else class="mt-4 space-y-3">
          <div
            v-for="c in contracts"
            :key="c.id"
            class="border rounded-xl p-4 flex flex-col sm:flex-row justify-between gap-3"
          >
            <div>
              <div class="font-bold">
                {{ c.companyName || c.representativeName || "Client —" }}
              </div>
              <div class="text-xs text-slate-500 mt-1">Début : {{ c.startDate || "—" }}</div>
              <div class="text-xs mt-1">
                <span class="px-2 py-1 rounded-full border text-xs font-bold" :class="statusClass(c.status)">
                  {{ statusLabel(c.status) }}
                </span>
              </div>
            </div>

            <div class="flex gap-2 flex-wrap">
              <button class="btn btn-sm btn-outline" @click="goContract(c.id)">Ouvrir</button>

              <button
                class="btn btn-sm"
                :class="c.id === selectedContractId ? 'btn-primary' : 'btn-outline'"
                @click="selectedContractId = c.id"
              >
                Voir encaissements
              </button>

              <a
                v-if="c.pdfSignedUrl"
                :href="c.pdfSignedUrl"
                target="_blank"
                rel="noopener"
                class="btn btn-sm btn-primary"
              >
                PDF signé
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- PAYMENTS LIST -->
      <div class="rounded-2xl bg-white border shadow p-5">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 class="text-lg font-extrabold">Encaissements</h2>
            <p class="text-xs text-slate-500 mt-1">
              Contrat sélectionné : <span class="font-mono">{{ selectedContractId || "—" }}</span>
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select
              v-model="selectedContractId"
              class="select select-bordered w-full btn-primary sm:w-[360px]"
              :disabled="!contracts.length"
            >
              <option value="" disabled>Choisir un contrat</option>
              <option v-for="c in contracts" :key="c.id" :value="c.id">
                {{ (c.companyName || c.representativeName || "Client") }} — {{ c.startDate || "—" }} — {{ statusLabel(c.status) }}
              </option>
            </select>

            <button class="btn btn-outline" :disabled="!selectedContractId" @click="goContract(selectedContractId)">
              Ouvrir contrat
            </button>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-xl border p-4 bg-slate-50">
            <div class="text-xs text-slate-500">Client</div>
            <div class="font-extrabold">
              {{ selectedContract?.companyName || selectedContract?.representativeName || "—" }}
            </div>
          </div>
          <div class="rounded-xl border p-4 bg-slate-50">
            <div class="text-xs text-slate-500">Mensuel TTC</div>
            <div class="font-extrabold">{{ money(selectedContract?.monthlyTTC || 0) }} €</div>
          </div>
          <div class="rounded-xl border p-4 bg-slate-50">
            <div class="text-xs text-slate-500">Total encaissé (contrat)</div>
            <div class="font-extrabold">{{ money(totalPaidForSelected) }} €</div>
          </div>
        </div>

        <div v-if="!selectedContractId" class="mt-4 text-sm text-slate-500">
          Sélectionne un contrat pour afficher ses encaissements.
        </div>

        <div v-else-if="!payments.length" class="mt-4 text-sm text-slate-500">
          Aucun encaissement pour ce contrat.
        </div>

        <div v-else class="mt-4 space-y-3">
          <div
            v-for="p in payments"
            :key="p.id"
            class="border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          >
            <div class="min-w-0">
              <div class="font-extrabold">
                {{ money(p.amount ?? p.amountTTC ?? 0) }} €
                <span class="text-xs font-bold text-slate-500">({{ p.method || "—" }})</span>
              </div>
              <div class="text-xs text-slate-500 mt-1">
                Période : <span class="font-semibold">{{ p.period || "—" }}</span>
                • Payé le : <span class="font-semibold">{{ toDateFR(p.paidAt) }}</span>
              </div>
              <div v-if="p.note" class="text-xs text-slate-600 mt-1 break-words">
                Note : {{ p.note }}
              </div>
            </div>

            <div class="text-xs text-slate-500 font-mono break-all">{{ p.id }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL UPDATE -->
    <dialog id="my_modal_update" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box bg-white">
        <h3 class="font-extrabold text-lg">Modifier le box</h3>

        <form class="mt-4 space-y-3" @submit.prevent="saveBox">
          <input v-model="formBox.code" class="input input-bordered w-full" placeholder="Code" />
          <input v-model.number="formBox.volumeM3" type="number" class="input input-bordered w-full" placeholder="Volume" />
          <input v-model.number="formBox.priceMonthly" type="number" class="input input-bordered w-full" placeholder="Prix" />

          <div class="flex justify-end gap-2">
            <button type="button" class="btn" onclick="my_modal_update.close()">Annuler</button>
            <button type="submit" class="btn btn-primary">Sauvegarder</button>
          </div>
        </form>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
/* Tailwind only */
</style>