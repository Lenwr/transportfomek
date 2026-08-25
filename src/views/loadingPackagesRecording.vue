<script setup>
import { computed, ref } from "vue"
import { useCollection, useFirestore } from "vuefire"
import { collection, addDoc, doc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore"
import { format } from "date-fns"
import frLocale from "date-fns/locale/fr"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

const db = useFirestore()
const chargements = useCollection(collection(db, "chargements"))
const modalRef = ref(null)
const editModalRef = ref(null)
const editingLoadId = ref("")
const editingContainerName = ref("")
const renaming = ref(false)

const chargement = ref({
  contenaire: "",
  date: "",
  packagesTable: [],
})

const sortedChargements = computed(() =>
  [...(chargements.value || [])].sort((a, b) => {
    const da = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime()
    const dbb = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime()
    return dbb - da
  })
)

const activeCount = computed(() => sortedChargements.value.length)

const scannedPackagesCount = computed(() =>
  sortedChargements.value.reduce((sum, item) => sum + Number(item.packagesTable?.length || 0), 0)
)

function openModal() {
  modalRef.value?.showModal()
}

function closeModal() {
  modalRef.value?.close()
}

function openEditModal(item) {
  editingLoadId.value = item.id
  editingContainerName.value = item.contenaire || ""
  editModalRef.value?.showModal()
}

function closeEditModal() {
  editModalRef.value?.close()
  editingLoadId.value = ""
  editingContainerName.value = ""
}

async function renameLoad() {
  const name = editingContainerName.value.trim()

  if (!editingLoadId.value || !name) {
    toast("Le nom du conteneur est obligatoire", { type: "warning" })
    return
  }

  try {
    renaming.value = true
    await updateDoc(doc(db, "chargements", editingLoadId.value), {
      contenaire: name,
      updatedAt: serverTimestamp(),
    })
    toast("Nom du conteneur modifié", {
      theme: "auto",
      type: "success",
      autoClose: 1200,
    })
    closeEditModal()
  } catch (e) {
    console.error("Erreur modification conteneur :", e)
    toast("Erreur lors de la modification", { type: "error" })
  } finally {
    renaming.value = false
  }
}

function formatDateTime(value) {
  if (!value) return "-"
  const date = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return format(date, "EEEE d MMMM yyyy à HH'h'mm", { locale: frLocale })
}

async function submitForm() {
  const payload = {
    contenaire: chargement.value.contenaire.trim(),
    date: chargement.value.date,
    packagesTable: [],
    status: "en cours",
    createdAt: serverTimestamp(),
  }

  try {
    await addDoc(collection(db, "chargements"), payload)
    toast("Chargement ajouté", {
      theme: "auto",
      type: "success",
      autoClose: 1000,
    })

    chargement.value = {
      contenaire: "",
      date: "",
      packagesTable: [],
    }

    closeModal()
  } catch (e) {
    console.error("Erreur ajout chargement :", e)
    toast("Erreur lors de l'ajout du chargement", { type: "error" })
  }
}

async function deleteLoad(id) {
  const ok = window.confirm("Supprimer ce chargement ?")
  if (!ok) return

  try {
    await deleteDoc(doc(db, "chargements", id))
    toast("Chargement supprimé", {
      theme: "auto",
      type: "error",
      autoClose: 1000,
    })
  } catch (e) {
    console.error("Erreur suppression chargement :", e)
    toast("Erreur lors de la suppression", { type: "error" })
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Conteneurs</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Chargements et listes de colissage</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Crée un chargement, ouvre sa fiche, puis scanne les colis entrants pour produire la liste de colissage.
          </p>
        </div>

        <button
          class="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800"
          type="button"
          @click="openModal"
        >
          Nouveau chargement
        </button>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <article class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm font-medium text-slate-500">Chargements</p>
        <p class="mt-2 text-3xl font-bold text-slate-950">{{ activeCount }}</p>
      </article>

      <article class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm font-medium text-slate-500">Colis scannés</p>
        <p class="mt-2 text-3xl font-bold text-slate-950">{{ scannedPackagesCount }}</p>
      </article>

      <article class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm font-medium text-slate-500">Statut</p>
        <p class="mt-3 inline-flex rounded-md bg-green-50 px-2.5 py-1 text-sm font-bold text-green-700">
          Opérationnel
        </p>
      </article>
    </div>

    <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 class="font-bold text-slate-950">Chargements</h3>
          <p class="text-sm text-slate-500">Ouvre un chargement pour scanner et consulter le colissage.</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-5 py-3">Date</th>
              <th class="px-5 py-3">Conteneur</th>
              <th class="px-5 py-3">Colis scannés</th>
              <th class="px-5 py-3">Statut</th>
              <th class="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in sortedChargements" :key="item.id" class="hover:bg-slate-50">
              <td class="whitespace-nowrap px-5 py-4 text-slate-600">
                {{ formatDateTime(item.date || item.createdAt) }}
              </td>
              <td class="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">
                {{ item.contenaire || "-" }}
              </td>
              <td class="whitespace-nowrap px-5 py-4 text-slate-600">
                {{ item.packagesTable?.length || 0 }}
              </td>
              <td class="whitespace-nowrap px-5 py-4">
                <span class="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">
                  {{ item.status || "en cours" }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-4 text-right">
                <div class="flex justify-end gap-2">
                  <RouterLink
                    :to="`/chargementsDetails/${item.id}`"
                    class="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-800"
                  >
                    Scanner
                  </RouterLink>
                  <button
                    class="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50"
                    type="button"
                    @click="openEditModal(item)"
                  >
                    Modifier
                  </button>
                  <button
                    class="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    type="button"
                    @click="deleteLoad(item.id)"
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="!sortedChargements.length">
              <td class="px-5 py-10 text-center text-slate-500" colspan="5">
                Aucun chargement enregistré.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <dialog ref="modalRef" class="modal">
      <div class="modal-box max-w-lg bg-white text-slate-950">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold">Nouveau chargement</h3>
            <p class="mt-1 text-sm text-slate-500">Renseigne le conteneur et la date de chargement.</p>
          </div>
          <form method="dialog">
            <button class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600" type="submit">
              Fermer
            </button>
          </form>
        </div>

        <form class="mt-6 space-y-4" @submit.prevent="submitForm">
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Date de chargement</span>
            <input
              v-model="chargement.date"
              type="datetime-local"
              required
              class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Conteneur</span>
            <input
              v-model="chargement.contenaire"
              type="text"
              required
              placeholder="Ex: MSKU1234567"
              class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <button
            type="submit"
            class="flex w-full justify-center rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800"
          >
            Enregistrer le chargement
          </button>
        </form>
      </div>
    </dialog>

    <dialog ref="editModalRef" class="modal" @close="closeEditModal">
      <div class="modal-box max-w-lg bg-white text-slate-950">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold">Modifier le conteneur</h3>
            <p class="mt-1 text-sm text-slate-500">
              Seul le nom du conteneur sera modifié. Les colis scannés seront conservés.
            </p>
          </div>
          <button
            class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600"
            type="button"
            @click="closeEditModal"
          >
            Fermer
          </button>
        </div>

        <form class="mt-6 space-y-4" @submit.prevent="renameLoad">
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Nom ou numéro du conteneur</span>
            <input
              v-model="editingContainerName"
              type="text"
              required
              maxlength="120"
              autofocus
              placeholder="Ex : MSKU1234567"
              class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <button
            type="submit"
            :disabled="renaming"
            class="flex w-full justify-center rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ renaming ? "Modification…" : "Enregistrer le nouveau nom" }}
          </button>
        </form>
      </div>
    </dialog>
  </section>
</template>
