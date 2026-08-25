<script setup>
import { computed, onMounted, ref } from "vue"
import { useFirestore } from "vuefire"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import {
  BOX_CONTRACT_TEMPLATE_DOC_PATH,
  cloneDefaultBoxContractTemplate,
  normalizeBoxContractTemplate,
} from "../../utils/boxContractTemplate"

const db = useFirestore()
const loading = ref(false)
const saving = ref(false)
const template = ref(cloneDefaultBoxContractTemplate())

const variables = [
  "{providerName}",
  "{providerAddress}",
  "{providerRegistration}",
  "{providerRepresentative}",
  "{clientName}",
  "{clientAddress}",
  "{clientEmail}",
  "{clientPhone}",
  "{boxCode}",
  "{boxLocation}",
  "{boxSurface}",
  "{boxHeight}",
  "{boxVolume}",
  "{startDate}",
  "{endDate}",
  "{durationChoice}",
  "{monthlyHT}",
  "{monthlyTTC}",
  "{depositTTC}",
]

const sectionsCount = computed(() => template.value.sections?.length || 0)

function normalizeEditableTemplate(next = {}) {
  const normalized = normalizeBoxContractTemplate(next)
  normalized.sections = normalized.sections.map((section) => ({
    ...section,
    text: (section.paragraphs || []).join("\n\n"),
  }))
  return normalized
}

function buildPayload() {
  return {
    enabled: !!template.value.enabled,
    title: String(template.value.title || "").trim(),
    legalNotice: String(template.value.legalNotice || "").trim(),
    provider: {
      name: String(template.value.provider?.name || "").trim(),
      address: String(template.value.provider?.address || "").trim(),
      registration: String(template.value.provider?.registration || "").trim(),
      representative: String(template.value.provider?.representative || "").trim(),
    },
    sections: (template.value.sections || []).map((section) => ({
      title: String(section.title || "").trim(),
      paragraphs: String(section.text || "")
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    })),
    updatedAt: serverTimestamp(),
  }
}

async function loadTemplate() {
  loading.value = true
  try {
    const snap = await getDoc(doc(db, ...BOX_CONTRACT_TEMPLATE_DOC_PATH))
    template.value = normalizeEditableTemplate(snap.exists() ? snap.data() : cloneDefaultBoxContractTemplate())
  } catch (e) {
    console.error(e)
    toast("Erreur chargement du modèle", { type: "error" })
  } finally {
    loading.value = false
  }
}

async function saveTemplate() {
  saving.value = true
  try {
    await setDoc(doc(db, ...BOX_CONTRACT_TEMPLATE_DOC_PATH), buildPayload(), { merge: true })
    toast("Modèle de contrat enregistré", { type: "success", autoClose: 1400 })
    await loadTemplate()
  } catch (e) {
    console.error(e)
    toast("Erreur sauvegarde du modèle", { type: "error" })
  } finally {
    saving.value = false
  }
}

function resetDefault() {
  template.value = normalizeEditableTemplate(cloneDefaultBoxContractTemplate())
}

function addSection() {
  template.value.sections.push({
    title: `Nouvelle clause ${sectionsCount.value + 1}`,
    paragraphs: [],
    text: "Texte de la clause.",
  })
}

function removeSection(index) {
  template.value.sections.splice(index, 1)
}

function moveSection(index, direction) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= template.value.sections.length) return
  const next = [...template.value.sections]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  template.value.sections = next
}

onMounted(loadTemplate)
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <div class="mx-auto max-w-[1150px] px-4 py-6 space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="text-xs font-bold uppercase tracking-wide text-cyan-800">Boxes</div>
          <h1 class="text-2xl font-extrabold tracking-tight">Modèle de contrat</h1>
          <p class="text-sm text-slate-600">
            Les nouveaux PDF de contrat utiliseront ce texte et remplaceront automatiquement les variables.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm" type="button" :disabled="loading || saving" @click="resetDefault">
            Modèle par défaut
          </button>
          <button class="btn btn-sm btn-primary" type="button" :disabled="loading || saving" @click="saveTemplate">
            {{ saving ? "Enregistrement..." : "Enregistrer" }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Chargement...
      </div>

      <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div class="space-y-4 lg:col-span-8">
          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="sm:col-span-2">
                <span class="text-xs font-bold text-slate-600">Titre du contrat</span>
                <input v-model="template.title" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>

              <label class="sm:col-span-2">
                <span class="text-xs font-bold text-slate-600">Avertissement / note légale</span>
                <textarea v-model="template.legalNotice" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>

              <label>
                <span class="text-xs font-bold text-slate-600">Prestataire</span>
                <input v-model="template.provider.name" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>

              <label>
                <span class="text-xs font-bold text-slate-600">Immatriculation</span>
                <input v-model="template.provider.registration" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>

              <label class="sm:col-span-2">
                <span class="text-xs font-bold text-slate-600">Adresse prestataire</span>
                <input v-model="template.provider.address" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>

              <label class="sm:col-span-2">
                <span class="text-xs font-bold text-slate-600">Représentant</span>
                <input v-model="template.provider.representative" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>
          </section>

          <section
            v-for="(section, index) in template.sections"
            :key="index"
            class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="text-sm font-extrabold text-slate-900">Clause {{ index + 1 }}</div>
              <div class="flex gap-2">
                <button class="btn btn-xs" type="button" :disabled="index === 0" @click="moveSection(index, -1)">Monter</button>
                <button class="btn btn-xs" type="button" :disabled="index === template.sections.length - 1" @click="moveSection(index, 1)">Descendre</button>
                <button class="btn btn-xs border-red-200 text-red-700" type="button" @click="removeSection(index)">Supprimer</button>
              </div>
            </div>

            <label>
              <span class="text-xs font-bold text-slate-600">Titre</span>
              <input v-model="section.title" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>

            <label class="mt-3 block">
              <span class="text-xs font-bold text-slate-600">Texte</span>
              <textarea
                v-model="section.text"
                rows="7"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6"
              />
            </label>
          </section>

          <button class="btn w-full" type="button" @click="addSection">
            Ajouter une clause
          </button>
        </div>

        <aside class="lg:col-span-4">
          <div class="sticky top-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div class="text-sm font-extrabold text-slate-900">Variables disponibles</div>
            <p class="mt-1 text-xs text-slate-500">
              À insérer dans le texte, elles seront remplacées dans le PDF.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <code
                v-for="variable in variables"
                :key="variable"
                class="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {{ variable }}
              </code>
            </div>

            <div class="mt-4 rounded-lg bg-cyan-50 p-3 text-xs text-cyan-950">
              Les annexes conditions particulières, règlement intérieur et grille tarifaire restent générées automatiquement avec les données du contrat.
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
