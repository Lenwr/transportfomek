<script setup>
  import { ref, computed } from "vue"
  import { useFirestore, useCollection } from "vuefire"
  import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    orderBy,
  } from "firebase/firestore"
  import { toast } from "vue3-toastify"
  
  const db = useFirestore()
  
  // Catalog “active”
  const catalogId = "active"
  const itemsRef = collection(db, "pricingCatalog", catalogId, "items")
  const itemsCol = useCollection(query(itemsRef, orderBy("sort", "asc")))
  
  const DESTINATIONS = ["LOME", "COTONOU", "ABIDJAN"]
  const PRICING_TYPES = [
    { value: "FIXED_BY_DESTINATION", label: "Forfait par destination" },
    { value: "PER_INCH_BY_DESTINATION", label: "TV au pouce" },
  ]
  
  const search = ref("")
  const editing = ref(null) // {id, ...data}
  const modalRef = ref(null)
  
  const blankItem = () => ({
    label: "",
    key: "",
    category: "general",
    pricingType: "FIXED_BY_DESTINATION",
    unit: "piece",
    isActive: true,
    sort: 100,
    pricesByDestination: { LOME: 0, COTONOU: 0, ABIDJAN: 0 },
    ratesByDestination: { LOME: 0, COTONOU: 0, ABIDJAN: 0 },
  })
  
  const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    const list = itemsCol.value || []
    if (!q) return list
    return list.filter((it) =>
      [it.label, it.key, it.category].filter(Boolean).join(" ").toLowerCase().includes(q)
    )
  })
  
  const openCreate = () => {
    editing.value = { _mode: "create", ...blankItem() }
    modalRef.value?.showModal()
  }
  
  const openEdit = (item) => {
    editing.value = { _mode: "edit", id: item.id, ...item }
    modalRef.value?.showModal()
  }
  
  const closeModal = () => {
    editing.value = null
    modalRef.value?.close()
  }
  
  const slugify = (s = "") =>
    s
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
  
  const ensureKey = () => {
    if (!editing.value) return
    if (!editing.value.key && editing.value.label) editing.value.key = slugify(editing.value.label)
  }
  
  const save = async () => {
    if (!editing.value?.label) return toast.warn("Nom d’article obligatoire")
    ensureKey()
    if (!editing.value.key) return toast.warn("Key obligatoire (auto possible depuis le label)")
  
    const payload = {
      label: editing.value.label,
      key: editing.value.key,
      category: editing.value.category,
      pricingType: editing.value.pricingType,
      unit: editing.value.unit,
      isActive: !!editing.value.isActive,
      sort: Number(editing.value.sort) || 0,
      updatedAt: serverTimestamp(),
    }
  
    if (editing.value.pricingType === "FIXED_BY_DESTINATION") {
      payload.pricesByDestination = { ...editing.value.pricesByDestination }
      payload.ratesByDestination = { LOME: 0, COTONOU: 0, ABIDJAN: 0 }
    } else {
      payload.ratesByDestination = { ...editing.value.ratesByDestination }
      payload.pricesByDestination = { LOME: 0, COTONOU: 0, ABIDJAN: 0 }
    }
  
    try {
      if (editing.value._mode === "create") {
        payload.createdAt = serverTimestamp()
        await addDoc(itemsRef, payload)
        toast.success("Article ajouté ✅")
      } else {
        await updateDoc(doc(itemsRef, editing.value.id), payload)
        toast.success("Article modifié ✅")
      }
      closeModal()
    } catch (e) {
      console.error(e)
      toast.error("Erreur sauvegarde ❌")
    }
  }
  
  const removeItem = async (id) => {
    const ok = window.confirm("Supprimer cet article ?")
    if (!ok) return
    try {
      await deleteDoc(doc(itemsRef, id))
      toast.success("Supprimé ✅")
    } catch (e) {
      console.error(e)
      toast.error("Erreur suppression ❌")
    }
  }
  
  const typeLabel = (t) =>
    t === "PER_INCH_BY_DESTINATION" ? "TV au pouce" : "Forfait destination"
  </script>
  
  <template>
    <div class="min-h-screen bg-slate-100 px-4 py-6">
      <div class="max-w-6xl mx-auto">
        <!-- Header responsive -->
        <header class="flex flex-col gap-3 mb-5">
          <div>
            <h1 class="text-2xl font-semibold text-slate-900">Grille tarifaire</h1>
            <p class="text-sm text-slate-500">CRUD des articles + tarifs (source pour le devis client).</p>
          </div>
  
          <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              v-model="search"
              class="w-full sm:w-80 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Rechercher un article…"
            />
            <button
              class="w-full sm:w-auto px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
              @click="openCreate"
            >
              + Ajouter
            </button>
          </div>
        </header>
  
        <!-- Container -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <!-- Desktop header (hidden on mobile) -->
          <div class="hidden md:grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-500 border-b">
            <div class="col-span-4">Article</div>
            <div class="col-span-2">Catégorie</div>
            <div class="col-span-2">Type</div>
            <div class="col-span-1">Ordre</div>
            <div class="col-span-1">Actif</div>
            <div class="col-span-2 text-right">Actions</div>
          </div>
  
          <div v-if="!filtered.length" class="px-4 py-10 text-sm text-slate-500 text-center">
            Aucun article.
          </div>
  
          <!-- ✅ MOBILE: Cards -->
          <div class="md:hidden divide-y">
            <div v-for="it in filtered" :key="it.id" class="p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-semibold text-slate-900 truncate">{{ it.label }}</div>
                  <div class="text-xs text-slate-500 break-words">
                    {{ it.key }} • {{ it.unit }}
                  </div>
  
                  <div class="mt-2 flex flex-wrap gap-2 text-xs">
                    <span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                      Cat: {{ it.category }}
                    </span>
                    <span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                      {{ typeLabel(it.pricingType) }}
                    </span>
                    <span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                      Ordre: {{ it.sort ?? "-" }}
                    </span>
                  </div>
                </div>
  
                <span
                  class="shrink-0 text-[11px] px-2 py-0.5 rounded-full border"
                  :class="it.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'"
                >
                  {{ it.isActive ? "ON" : "OFF" }}
                </span>
              </div>
  
              <div class="mt-3 flex gap-2">
                <button
                  class="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  @click="openEdit(it)"
                >
                  Éditer
                </button>
                <button
                  class="flex-1 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50"
                  @click="removeItem(it.id)"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
  
          <!-- ✅ DESKTOP: Table/Grid -->
          <div class="hidden md:block">
            <div
              v-for="it in filtered"
              :key="it.id"
              class="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b hover:bg-slate-50"
            >
              <div class="col-span-4">
                <div class="font-semibold text-slate-900">{{ it.label }}</div>
                <div class="text-xs text-slate-500">{{ it.key }} • {{ it.unit }}</div>
              </div>
              <div class="col-span-2 text-slate-700">{{ it.category }}</div>
              <div class="col-span-2 text-slate-700">{{ typeLabel(it.pricingType) }}</div>
              <div class="col-span-1 text-slate-700">{{ it.sort ?? "-" }}</div>
              <div class="col-span-1">
                <span
                  class="text-[11px] px-2 py-0.5 rounded-full border"
                  :class="it.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'"
                >
                  {{ it.isActive ? "ON" : "OFF" }}
                </span>
              </div>
              <div class="col-span-2 flex justify-end gap-2">
                <button class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs" @click="openEdit(it)">
                  Éditer
                </button>
                <button class="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50" @click="removeItem(it.id)">
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  
      <!-- Modal create/edit -->
      <dialog ref="modalRef" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box bg-white text-slate-900 max-w-2xl">
          <h2 class="text-lg font-semibold mb-4">
            {{ editing?._mode === "create" ? "Ajouter un article" : "Modifier l’article" }}
          </h2>
  
          <div v-if="editing" class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Label</label>
                <input v-model="editing.label" @blur="ensureKey" class="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Key (slug)</label>
                <input v-model="editing.key" class="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
  
            <div class="grid sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Catégorie</label>
                <input v-model="editing.category" class="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Unité</label>
                <input v-model="editing.unit" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="piece / m3 / pouce..." />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Ordre (sort)</label>
                <input type="number" v-model.number="editing.sort" class="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
  
            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Type de pricing</label>
                <select v-model="editing.pricingType" class="w-full border rounded-lg px-3 py-2 text-sm">
                  <option v-for="t in PRICING_TYPES" :key="t.value" :value="t.value">
                    {{ t.label }}
                  </option>
                </select>
              </div>
              <div class="flex items-center gap-2 pt-6">
                <input id="isActive" type="checkbox" v-model="editing.isActive" />
                <label for="isActive" class="text-sm text-slate-700">Actif</label>
              </div>
            </div>
  
            <!-- Prices -->
            <div class="border rounded-xl p-3 bg-slate-50">
              <div class="text-sm font-semibold mb-2">Tarifs</div>
  
              <div v-if="editing.pricingType === 'FIXED_BY_DESTINATION'" class="grid sm:grid-cols-3 gap-3">
                <div v-for="dest in DESTINATIONS" :key="dest">
                  <label class="block text-xs font-medium text-slate-600 mb-1">{{ dest }}</label>
                  <input type="number" v-model.number="editing.pricesByDestination[dest]" class="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
              </div>
  
              <div v-else class="grid sm:grid-cols-3 gap-3">
                <div v-for="dest in DESTINATIONS" :key="dest">
                  <label class="block text-xs font-medium text-slate-600 mb-1">{{ dest }} (€/pouce)</label>
                  <input type="number" v-model.number="editing.ratesByDestination[dest]" class="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
              </div>
            </div>
  
            <div class="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button class="px-3 py-2 rounded-lg border border-slate-200 text-sm" @click="closeModal">
                Annuler
              </button>
              <button class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500" @click="save">
                Enregistrer
              </button>
            </div>
          </div>
  
          <div class="modal-action">
            <form method="dialog">
              <button class="hidden">close</button>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  </template>
  