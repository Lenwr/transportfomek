<!-- src/components/contracts/ContractForm.vue -->
<script setup>
import { computed, reactive, watch } from "vue"

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  mode: {
    type: String,
    default: "create", // create | edit
  },
  saving: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  selectedBox: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(["update:modelValue", "submit", "preview", "cancel"])

/* =========================
  Local form sync
========================= */
const localForm = reactive({
  clientNumber: "",
  companyName: "",
  representativeName: "",
  address: "",
  email: "",
  phone: "",
  legalFormAndSiren: "",

  boxCode: "",
  siteAddress: "15 Rue des Écoles, 95500 LE THILLAY",
  startDate: "",
  durationChoice: 12,
  citySigned: "LE THILLAY",
  signedDate: "",

  // ⚠️ garde ton naming legacy
  // monthlyHT = TTC saisi
  monthlyHT: 0,
  tvaRate: 20,
  depositEnabled: true,
  depositMonths: 1,
  paymentMethod: "virement",

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

  clientSignatureDataUrl: "",
  providerSignatureDataUrl: "",
})

function syncFromProps(next = {}) {
  Object.assign(localForm, {
    clientNumber: next.clientNumber ?? "",
    companyName: next.companyName ?? "",
    representativeName: next.representativeName ?? "",
    address: next.address ?? "",
    email: next.email ?? "",
    phone: next.phone ?? "",
    legalFormAndSiren: next.legalFormAndSiren ?? "",

    boxCode: next.boxCode ?? "",
    siteAddress: next.siteAddress ?? "15 Rue des Écoles, 95500 LE THILLAY",
    startDate: next.startDate ?? "",
    durationChoice: Number(next.durationChoice ?? 12),
    citySigned: next.citySigned ?? "LE THILLAY",
    signedDate: next.signedDate ?? "",

    monthlyHT: Number(next.monthlyHT ?? 0),
    tvaRate: Number(next.tvaRate ?? 20),
    depositEnabled: !!next.depositEnabled,
    depositMonths: Number(next.depositMonths ?? 1),
    paymentMethod: next.paymentMethod ?? "virement",

    boxLocation: next.boxLocation ?? "",
    boxSurface: next.boxSurface ?? "",
    boxHeight: next.boxHeight ?? "",
    boxVolume: next.boxVolume ?? "",
    accessMode: next.accessMode ?? "heures_du_site",
    accessGiven: next.accessGiven ?? "code",
    accessOther: next.accessOther ?? "",
    padlock: next.padlock ?? "client",
    insuranceCompany: next.insuranceCompany ?? "",
    insurancePolicy: next.insurancePolicy ?? "",
    insuranceAttestationDate: next.insuranceAttestationDate ?? "",
    entryInspectionDone: !!next.entryInspectionDone,
    photosAttached: !!next.photosAttached,

    clientSignatureDataUrl: next.clientSignatureDataUrl ?? "",
    providerSignatureDataUrl: next.providerSignatureDataUrl ?? "",
  })
}

watch(
  () => props.modelValue,
  (val) => {
    syncFromProps(val || {})
  },
  { immediate: true, deep: true }
)

watch(
  localForm,
  () => {
    emit("update:modelValue", { ...localForm })
  },
  { deep: true }
)

/* =========================
  Helpers
========================= */
function money(n) {
  const v = Number(n || 0)
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(v)
}

/* =========================
  Pricing computed
========================= */
const monthlyTTCInput = computed(() => Number(localForm.monthlyHT || 0))
const tvaFactor = computed(() => 1 + Number(localForm.tvaRate || 0) / 100)

const monthlyHTComputed = computed(() => {
  const ttc = monthlyTTCInput.value
  const factor = tvaFactor.value
  return factor ? ttc / factor : ttc
})

const monthlyTVAAmount = computed(() => monthlyTTCInput.value - monthlyHTComputed.value)

const depositMonthsEffective = computed(() =>
  localForm.depositEnabled ? Number(localForm.depositMonths || 1) : 0
)

const depositTTC = computed(() => monthlyTTCInput.value * depositMonthsEffective.value)
const totalSignatureTTC = computed(() => monthlyTTCInput.value + depositTTC.value)

const submitLabel = computed(() => {
  if (props.saving) return props.mode === "edit" ? "Enregistrement..." : "Création..."
  return props.mode === "edit" ? "Enregistrer les modifications" : "Créer + PDF"
})

function handleSubmit() {
  emit("submit")
}

function handlePreview() {
  emit("preview")
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50 text-slate-900">
    <div class="max-w-[1100px] mx-auto px-4 py-6 space-y-5">
      <div class="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">
            {{ mode === "edit" ? "Modifier le contrat" : "Créer un contrat" }}
          </h1>
          <p class="text-sm text-slate-600">
            Génère le PDF complet (contrat + annexes) au format du modèle.
          </p>
          <p v-if="selectedBox" class="text-xs text-slate-500 mt-1">
            Box pré-sélectionné :
            <span class="font-semibold text-slate-900">{{ localForm.boxCode || "…" }}</span>
          </p>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-sm" type="button" @click="$emit('cancel')">
            ← Retour
          </button>
          <button class="btn btn-sm btn-primary" :disabled="saving || loading" type="button" @click="handleSubmit">
            {{ submitLabel }}
          </button>
        </div>
      </div>

      <div
        v-if="loading"
        class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 text-slate-600"
      >
        Chargement…
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-12 gap-4">
        <!-- Left -->
        <div class="md:col-span-8 space-y-4">
          <!-- Client -->
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold text-slate-900 mb-3">Infos client</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">Client N°</label>
                <input
                  v-model="localForm.clientNumber"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: 00123"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Raison sociale</label>
                <input
                  v-model="localForm.companyName"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: SARL KOUASSI"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="text-xs font-bold text-slate-600">Nom du client / représentant</label>
                <input
                  v-model="localForm.representativeName"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Kouassi Jean"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="text-xs font-bold text-slate-600">Adresse</label>
                <input
                  v-model="localForm.address"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Adresse complète"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Email</label>
                <input
                  v-model="localForm.email"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="email@exemple.com"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Téléphone</label>
                <input
                  v-model="localForm.phone"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="06…"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="text-xs font-bold text-slate-600">
                  Société/forme juridique + SIREN (optionnel)
                </label>
                <input
                  v-model="localForm.legalFormAndSiren"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: SARL / 123 456 789"
                />
              </div>
            </div>
          </div>

          <!-- Contract -->
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold text-slate-900 mb-3">Infos contrat</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">Box</label>
                <input
                  v-model="localForm.boxCode"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: B-001"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Adresse site</label>
                <input
                  v-model="localForm.siteAddress"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Début</label>
                <input
                  type="date"
                  v-model="localForm.startDate"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Durée initiale</label>
                <select
                  v-model.number="localForm.durationChoice"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option :value="1">1 mois</option>
                  <option :value="3">3 mois</option>
                  <option :value="6">6 mois</option>
                  <option :value="9">9 mois</option>
                  <option :value="12">12 mois</option>
                </select>
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Fait à (ville)</label>
                <input
                  v-model="localForm.citySigned"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Date signature</label>
                <input
                  type="date"
                  v-model="localForm.signedDate"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <!-- Pricing -->
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold text-slate-900 mb-3">Tarifs</div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">Mensuel TTC (€) · TVA incluse</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  v-model.number="localForm.monthlyHT"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">TVA (%)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  v-model.number="localForm.tvaRate"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Mode de paiement</label>
                <select
                  v-model="localForm.paymentMethod"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="virement">Virement</option>
                  <option value="prelevement">Prélèvement</option>
                  <option value="carte">Carte bancaire</option>
                  <option value="especes">Espèces</option>
                </select>
              </div>
            </div>

            <div class="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 bg-slate-50">
              <div>
                <div class="text-sm font-bold text-slate-900">Dépôt de garantie (caution)</div>
                <div class="text-xs text-slate-600">
                  Active/désactive la section 5.3 + la ligne dans l’annexe 1.
                </div>
              </div>

              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="localForm.depositEnabled" class="checkbox checkbox-primary" />
                <span class="text-sm font-semibold">
                  {{ localForm.depositEnabled ? "Activée" : "Désactivée" }}
                </span>
              </label>
            </div>

            <div v-if="localForm.depositEnabled" class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">Caution (mois TTC)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="localForm.depositMonths"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div class="text-xs text-slate-500">Mensuel TTC</div>
                <div class="text-lg font-extrabold text-slate-900">{{ money(monthlyTTCInput) }} €</div>
              </div>

              <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div class="text-xs text-slate-500">Dont TVA</div>
                <div class="text-lg font-extrabold text-slate-900">{{ money(monthlyTVAAmount) }} €</div>
              </div>

              <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div class="text-xs text-slate-500">Mensuel HT</div>
                <div class="text-lg font-extrabold text-slate-900">{{ money(monthlyHTComputed) }} €</div>
              </div>
            </div>

            <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div class="text-xs text-slate-500">Caution TTC</div>
                <div class="text-lg font-extrabold text-slate-900">
                  {{ localForm.depositEnabled ? money(depositTTC) : "—" }}
                  <span v-if="localForm.depositEnabled">€</span>
                </div>
              </div>

              <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div class="text-xs text-slate-500">Total signature TTC</div>
                <div class="text-lg font-extrabold text-slate-900">
                  {{ money(totalSignatureTTC) }} €
                </div>
              </div>
            </div>
          </div>

          <!-- Annexe -->
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold text-slate-900 mb-3">Annexe 1</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-slate-600">Localisation (allée, étage)</label>
                <input
                  v-model="localForm.boxLocation"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Allée B, étage 1"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Surface (m²)</label>
                <input
                  v-model="localForm.boxSurface"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: 20"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Hauteur (m)</label>
                <input
                  v-model="localForm.boxHeight"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: 2.5"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Volume (m³)</label>
                <input
                  v-model="localForm.boxVolume"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: 50"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Mode d’accès</label>
                <select
                  v-model="localForm.accessMode"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="heures_du_site">Heures du site</option>
                  <option value="24_7">24/7</option>
                  <option value="sur_rdv">Sur RDV</option>
                </select>
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Moyen d’accès remis</label>
                <select
                  v-model="localForm.accessGiven"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="code">Code</option>
                  <option value="badge">Badge</option>
                  <option value="cle">Clé</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div v-if="localForm.accessGiven === 'autre'" class="sm:col-span-2">
                <label class="text-xs font-bold text-slate-600">Précision moyen d’accès</label>
                <input
                  v-model="localForm.accessOther"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Télécommande"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Cadenas</label>
                <select
                  v-model="localForm.padlock"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="client">Fourni par le client</option>
                  <option value="prestataire">Fourni par le prestataire</option>
                </select>
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Assureur</label>
                <input
                  v-model="localForm.insuranceCompany"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nom de l’assureur"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Numéro de police</label>
                <input
                  v-model="localForm.insurancePolicy"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Référence police"
                />
              </div>

              <div>
                <label class="text-xs font-bold text-slate-600">Attestation fournie le</label>
                <input
                  type="date"
                  v-model="localForm.insuranceAttestationDate"
                  class="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="flex items-center gap-2 rounded-xl border border-slate-200 p-3 bg-slate-50">
                <input type="checkbox" v-model="localForm.entryInspectionDone" class="checkbox checkbox-primary" />
                <span class="text-sm font-medium text-slate-800">État des lieux d’entrée réalisé</span>
              </label>

              <label class="flex items-center gap-2 rounded-xl border border-slate-200 p-3 bg-slate-50">
                <input type="checkbox" v-model="localForm.photosAttached" class="checkbox checkbox-primary" />
                <span class="text-sm font-medium text-slate-800">Photos datées annexées</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Right -->
        <div class="md:col-span-4 space-y-4">
          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div class="font-extrabold text-slate-900">Box sélectionné</div>

            <div v-if="selectedBox" class="mt-3 space-y-2">
              <div class="text-sm">
                <span class="text-slate-500">Code :</span>
                <span class="font-bold text-slate-900">{{ selectedBox.code }}</span>
              </div>
              <div class="text-sm">
                <span class="text-slate-500">Taille :</span>
                <span class="font-semibold text-slate-900">{{ selectedBox.size || "—" }}</span>
              </div>
              <div class="text-sm">
                <span class="text-slate-500">Statut :</span>
                <span class="font-semibold text-slate-900">{{ selectedBox.status || "—" }}</span>
              </div>
              <div class="text-sm">
                <span class="text-slate-500">Prix :</span>
                <span class="font-semibold text-slate-900">
                  {{ Number(selectedBox.priceMonthly || 0).toLocaleString("fr-FR") }} € / mois
                </span>
              </div>
              <div class="text-xs text-slate-500">
                Emplacement : {{ selectedBox.locationNote || "—" }}
              </div>
            </div>

            <div v-else class="mt-3 text-sm text-slate-600">
              Aucun box pré-sélectionné.
            </div>

            <div class="mt-4">
              <button class="btn btn-primary w-full" :disabled="saving || loading" type="button" @click="handleSubmit">
                {{ submitLabel }}
              </button>

              <button class="btn btn-outline w-full mt-2" :disabled="loading" type="button" @click="handlePreview">
                Preview PDF (sans sauvegarder)
              </button>
            </div>
          </div>

          <div class="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 text-sm text-slate-700">
            <div class="font-extrabold text-slate-900 mb-2">
              {{ mode === "edit" ? "Mode édition" : "Mode création" }}
            </div>
            <ul class="list-disc ml-5 space-y-1">
              <li>Le formulaire est mutualisé entre création et modification.</li>
              <li>Le TTC est saisi, la TVA et le HT sont calculés automatiquement.</li>
              <li>Le preview et l’export utiliseront le même générateur PDF.</li>
              <li>La caution reste calculée sur le TTC.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Full Tailwind. No @layer, no @apply. */
</style>