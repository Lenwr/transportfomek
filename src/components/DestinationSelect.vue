<script setup>
import { computed, ref } from "vue"
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { useCollection, useFirestore } from "vuefire"
import { toast } from "vue3-toastify"

const props = defineProps({
  modelValue: { type: String, default: "" },
  id: { type: String, default: "destination" },
  required: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue"])
const db = useFirestore()
const destinationsSnap = useCollection(collection(db, "pays"))
const showAdd = ref(false)
const newDestination = ref("")
const saving = ref(false)

const defaults = ["DOUALA", "YAOUNDE", "KRIBI"]
const canAdd = computed(() => Boolean(getAuth().currentUser))

function normalizeDestination(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 '-]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .slice(0, 80)
}

function destinationId(value = "") {
  return normalizeDestination(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

const destinations = computed(() => {
  const values = new Map(defaults.map((name) => [normalizeDestination(name), normalizeDestination(name)]))
  for (const item of destinationsSnap.value || []) {
    const name = normalizeDestination(item.name || item.label || "")
    if (name) values.set(name, name)
  }
  const current = normalizeDestination(props.modelValue)
  if (current) values.set(current, current)
  return [...values.values()].sort((a, b) => a.localeCompare(b, "fr"))
})

function onSelect(event) {
  const value = event.target.value
  if (value === "__ADD__") {
    showAdd.value = true
    return
  }
  emit("update:modelValue", value)
}

async function saveDestination() {
  const name = normalizeDestination(newDestination.value)
  const id = destinationId(name)
  if (!name || !id) {
    toast("Saisissez une destination valide.", { type: "warning" })
    return
  }
  if (!canAdd.value) {
    toast("Connectez-vous pour ajouter une destination.", { type: "warning" })
    return
  }

  saving.value = true
  try {
    await setDoc(doc(db, "pays", id), {
      name,
      normalizedName: name,
      updatedAt: serverTimestamp(),
      updatedBy: getAuth().currentUser.uid,
    }, { merge: true })
    emit("update:modelValue", name)
    newDestination.value = ""
    showAdd.value = false
    toast(`Destination ${name} ajoutée.`, { type: "success", autoClose: 1400 })
  } catch (error) {
    console.error("Erreur ajout destination", error)
    toast("Impossible d'ajouter la destination.", { type: "error" })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <select
      :id="id"
      :value="modelValue"
      :required="required"
      class="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
      @change="onSelect"
    >
      <option value="">Choisir une destination</option>
      <option v-for="destination in destinations" :key="destination" :value="destination">
        {{ destination }}
      </option>
      <option v-if="canAdd" value="__ADD__">＋ Ajouter une destination…</option>
    </select>

    <div v-if="showAdd && canAdd" class="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
      <label class="text-xs font-bold uppercase tracking-wide text-cyan-900">Nouvelle destination</label>
      <div class="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          v-model="newDestination"
          maxlength="80"
          class="h-11 min-w-0 flex-1 rounded-lg border border-cyan-200 bg-white px-3 text-sm uppercase outline-none focus:border-cyan-500"
          placeholder="Exemple : GAROUA"
          @keyup.enter.prevent="saveDestination"
        />
        <button type="button" class="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" :disabled="saving" @click="saveDestination">
          {{ saving ? "Ajout…" : "Ajouter" }}
        </button>
        <button type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700" @click="showAdd = false">
          Annuler
        </button>
      </div>
    </div>
  </div>
</template>
