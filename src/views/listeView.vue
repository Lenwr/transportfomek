<script setup>
import { computed, ref, watch } from "vue"
import { doc, writeBatch } from "firebase/firestore"
import { db, listeEnlevements } from "../components/firebaseConfig"
import {
  canonicalizeStatut,
  formatCurrency,
  formatDateTime,
  norm,
  normalizeToDate,
  parsePrixToNumber,
} from "../components/useEnlevementsUtils"

const paymentStatuses = ["", "Non Payé", "Reste à payer", "Payé"]
const deliveryStatuses = ["", "En attente", "réceptionné", "expédié", "disponible pour retrait", "livré"]

const selectedDestination = ref("")
const selectedPaymentStatus = ref("")
const selectedDeliveryStatus = ref("")
const dateFrom = ref("")
const dateTo = ref("")
const query = ref("")
const sortBy = ref("date-desc")
const columnsOpen = ref(false)
const showIncomplete = ref(false)
const currentPage = ref(1)
const pageSize = ref(25)
const selectedIds = ref([])
const isDeleting = ref(false)

const columns = [
  { key: "date", label: "Date" },
  { key: "number", label: "Numéro" },
  { key: "sender", label: "Expéditeur" },
  { key: "recipient", label: "Destinataire" },
  { key: "destination", label: "Destination" },
  { key: "packages", label: "Colis" },
  { key: "amount", label: "Montant" },
  { key: "payment", label: "Paiement" },
  { key: "delivery", label: "Livraison" },
]

const columnsStorageKey = "aaronTravelGestion.liste.visibleColumns"
const defaultVisibleColumns = ["date", "number", "sender", "recipient", "destination", "packages", "payment", "delivery"]

function loadVisibleColumns() {
  try {
    const savedColumns = JSON.parse(localStorage.getItem(columnsStorageKey) || "null")
    const allowedKeys = new Set(columns.map((column) => column.key))
    const validColumns = Array.isArray(savedColumns)
      ? savedColumns.filter((key) => allowedKeys.has(key))
      : []

    return validColumns.length >= 3 ? [...new Set(validColumns)] : defaultVisibleColumns
  } catch {
    return defaultVisibleColumns
  }
}

const visibleColumns = ref(loadVisibleColumns())

watch(visibleColumns, (value) => {
  localStorage.setItem(columnsStorageKey, JSON.stringify(value))
})

const allItems = computed(() => listeEnlevements.value || [])

const destinations = computed(() => {
  const values = new Set()
  for (const item of allItems.value) {
    if (item.destination) values.add(item.destination)
  }
  return ["", ...Array.from(values).sort((a, b) => a.localeCompare(b, "fr"))]
})

function isWithinDateRange(item) {
  const date = normalizeToDate(item.date || item.createdAt)
  if (!date) return !dateFrom.value && !dateTo.value

  if (dateFrom.value) {
    const start = new Date(`${dateFrom.value}T00:00:00`)
    if (date < start) return false
  }

  if (dateTo.value) {
    const end = new Date(`${dateTo.value}T23:59:59`)
    if (date > end) return false
  }

  return true
}

function matchesSearch(item) {
  const q = norm(query.value)
  if (!q) return true

  return [
    item.numero,
    item.numeroSuivi,
    item.destinataire,
    item.expediteur,
    item.telephoneExpediteur,
    item.telephoneDestinataire,
    item.destination,
  ].some((value) => norm(value).includes(q))
}

function hasUsefulInfo(item) {
  return [
    item.destinataire,
    item.expediteur,
    item.telephoneExpediteur,
    item.telephoneDestinataire,
    item.destination,
    item.adresseExpediteur,
    item.adresseDestinataire,
  ].some((value) => norm(value))
}

function isIncompleteItem(item) {
  return !hasUsefulInfo(item)
}

function getDeliveryStatus(item) {
  const storedStatus = String(item?.deliveryStatus || "").trim()
  if (storedStatus && norm(storedStatus) !== "en attente") return storedStatus

  const packageStatuses = (Array.isArray(item?.colis) ? item.colis : [])
    .flatMap((group) => {
      const details = Array.isArray(group?.details) ? group.details : []
      if (details.length) return details.map((detail) => detail?.statutColis)
      return [group?.statutColis]
    })
    .map((status) => String(status || "").trim())
    .filter(Boolean)

  if (!packageStatuses.length) return storedStatus || "En attente"

  const rank = {
    receptionne: 1,
    charge: 2,
    expedie: 3,
    "en transit": 3,
    "disponible pour retrait": 4,
    livre: 5,
  }
  return packageStatuses.reduce((leastAdvanced, status) => {
    const currentRank = rank[norm(status)] || 0
    const leastRank = rank[norm(leastAdvanced)] || 0
    return currentRank < leastRank ? status : leastAdvanced
  }, packageStatuses[0])
}

const filteredList = computed(() => {
  const rows = allItems.value
    .filter((item) => {
      const payment = canonicalizeStatut(item.statut)
      const delivery = getDeliveryStatus(item)
      const searchActive = Boolean(norm(query.value))

      return (
        (showIncomplete.value || !isIncompleteItem(item) || searchActive) &&
        (!selectedDestination.value || item.destination === selectedDestination.value) &&
        (!selectedPaymentStatus.value || payment === selectedPaymentStatus.value) &&
        (!selectedDeliveryStatus.value || delivery === selectedDeliveryStatus.value) &&
        isWithinDateRange(item) &&
        matchesSearch(item)
      )
    })

  return rows.sort((a, b) => {
    const dateA = normalizeToDate(a.date || a.createdAt)?.getTime() || 0
    const dateB = normalizeToDate(b.date || b.createdAt)?.getTime() || 0
    const priceA = parsePrixToNumber(a.prix)
    const priceB = parsePrixToNumber(b.prix)

    if (sortBy.value === "date-asc") return dateA - dateB
    if (sortBy.value === "price-desc") return priceB - priceA
    if (sortBy.value === "price-asc") return priceA - priceB
    if (sortBy.value === "destination") return String(a.destination || "").localeCompare(String(b.destination || ""), "fr")
    return dateB - dateA
  })
})

const totalAmount = computed(() =>
  filteredList.value.reduce((sum, item) => sum + parsePrixToNumber(item.prix), 0)
)

const unpaidCount = computed(() =>
  filteredList.value.filter((item) => canonicalizeStatut(item.statut) !== "Payé").length
)

const deliveredCount = computed(() =>
  filteredList.value.filter((item) => norm(getDeliveryStatus(item)) === "livre").length
)

const hiddenIncompleteCount = computed(() =>
  allItems.value.filter((item) => isIncompleteItem(item)).length
)

const totalPages = computed(() => Math.max(1, Math.ceil(filteredList.value.length / pageSize.value)))

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

const pageStart = computed(() => {
  if (!filteredList.value.length) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, filteredList.value.length))

const selectedCount = computed(() => selectedIds.value.length)

const pageIds = computed(() => paginatedList.value.map((item) => item.id).filter(Boolean))

const allPageSelected = computed(() =>
  pageIds.value.length > 0 && pageIds.value.every((id) => selectedIds.value.includes(id))
)

watch(
  [
    query,
    selectedDestination,
    selectedPaymentStatus,
    selectedDeliveryStatus,
    dateFrom,
    dateTo,
    sortBy,
    showIncomplete,
    pageSize,
  ],
  () => {
    currentPage.value = 1
  }
)

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(allItems, (items) => {
  const existingIds = new Set(items.map((item) => item.id))
  selectedIds.value = selectedIds.value.filter((id) => existingIds.has(id))
})

function resetFilters() {
  selectedDestination.value = ""
  selectedPaymentStatus.value = ""
  selectedDeliveryStatus.value = ""
  dateFrom.value = ""
  dateTo.value = ""
  query.value = ""
  sortBy.value = "date-desc"
  showIncomplete.value = false
  currentPage.value = 1
}

function isSelected(id) {
  return selectedIds.value.includes(id)
}

function toggleSelection(id) {
  if (!id) return
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id)
    return
  }

  selectedIds.value = [...selectedIds.value, id]
}

function togglePageSelection() {
  if (allPageSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !pageIds.value.includes(id))
    return
  }

  selectedIds.value = Array.from(new Set([...selectedIds.value, ...pageIds.value]))
}

async function deleteSelectedEnlevements() {
  if (!selectedIds.value.length || isDeleting.value) return

  const count = selectedIds.value.length
  const confirmed = window.confirm(`Supprimer définitivement ${count} enlèvement${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""} ?`)
  if (!confirmed) return

  isDeleting.value = true
  try {
    const ids = [...selectedIds.value]
    for (let index = 0; index < ids.length; index += 450) {
      const batch = writeBatch(db)
      ids.slice(index, index + 450).forEach((id) => {
        batch.delete(doc(db, "enlevements", id))
      })
      await batch.commit()
    }
    selectedIds.value = []
  } finally {
    isDeleting.value = false
  }
}

function isColumnVisible(key) {
  return visibleColumns.value.includes(key)
}

function toggleColumn(key) {
  if (visibleColumns.value.includes(key)) {
    if (visibleColumns.value.length <= 3) return
    visibleColumns.value = visibleColumns.value.filter((item) => item !== key)
    return
  }

  visibleColumns.value = [...visibleColumns.value, key]
}

function paymentClass(statut) {
  const s = canonicalizeStatut(statut)
  if (s === "Payé") return "bg-green-50 text-green-700"
  if (s === "Reste à payer") return "bg-amber-50 text-amber-700"
  return "bg-red-50 text-red-700"
}

function deliveryClass(status) {
  const s = norm(status || "En attente")
  if (s === "livre") return "bg-green-50 text-green-700"
  if (s === "expedie" || s === "disponible pour retrait") return "bg-cyan-50 text-cyan-800"
  if (s === "receptionne") return "bg-teal-50 text-teal-700"
  return "bg-slate-100 text-slate-700"
}
</script>

<template>
  <section class="page-shell">
    <div class="page-hero p-5 sm:p-6">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="eyebrow">Enlevements</p>
          <h2 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Liste des enlèvements</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Recherche, filtre et suis les enlèvements par client, destination, paiement et statut de livraison.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <RouterLink class="pro-button pro-button-primary" to="/form">
            Nouvel enlèvement
          </RouterLink>
          <RouterLink class="pro-button pro-button-secondary" to="/delivery-scan">
            Scan livraison
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Résultats</p>
        <p class="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{{ filteredList.length }}</p>
      </article>
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Montant filtré</p>
        <p class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{{ formatCurrency(totalAmount) }}</p>
      </article>
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Paiements ouverts</p>
        <p class="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{{ unpaidCount }}</p>
      </article>
      <article class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">Livrés</p>
        <p class="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{{ deliveredCount }}</p>
      </article>
    </div>

    <div
      class="surface-card relative min-w-0 p-4"
      :class="columnsOpen ? 'z-30' : 'z-0'"
    >
      <div class="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(260px,1.4fr)_repeat(6,minmax(0,1fr))]">
        <input
          v-model="query"
          type="search"
          placeholder="Nom, téléphone, numéro, destination..."
          class="field-control sm:col-span-2 xl:col-span-2 2xl:col-span-1"
        />

        <select v-model="selectedDestination" class="field-control">
          <option v-for="destination in destinations" :key="destination" :value="destination">
            {{ destination || "Toutes destinations" }}
          </option>
        </select>

        <select v-model="selectedPaymentStatus" class="field-control">
          <option v-for="status in paymentStatuses" :key="status" :value="status">
            {{ status || "Tous paiements" }}
          </option>
        </select>

        <select v-model="selectedDeliveryStatus" class="field-control">
          <option v-for="status in deliveryStatuses" :key="status" :value="status">
            {{ status || "Tous statuts livraison" }}
          </option>
        </select>

        <input v-model="dateFrom" type="date" class="field-control" />
        <input v-model="dateTo" type="date" class="field-control" />

        <select v-model="sortBy" class="field-control">
          <option value="date-desc">Plus récents</option>
          <option value="date-asc">Plus anciens</option>
          <option value="price-desc">Montant décroissant</option>
          <option value="price-asc">Montant croissant</option>
          <option value="destination">Destination</option>
        </select>
      </div>

      <div class="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
          <input v-model="showIncomplete" type="checkbox" class="checkbox checkbox-sm border-slate-300" />
          <span>Afficher les dossiers incomplets</span>
          <span v-if="hiddenIncompleteCount" class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
            {{ hiddenIncompleteCount }}
          </span>
        </label>

        <div class="flex flex-wrap justify-end gap-3">
          <div class="relative">
            <button class="text-sm font-bold text-slate-600 hover:text-cyan-800" type="button" @click="columnsOpen = !columnsOpen">
              Colonnes
            </button>
            <div
              v-if="columnsOpen"
              class="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
            >
              <p class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Afficher</p>
              <label
                v-for="column in columns"
                :key="column.key"
                class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs"
                  :checked="isColumnVisible(column.key)"
                  @change="toggleColumn(column.key)"
                />
                <span>{{ column.label }}</span>
              </label>
            </div>
          </div>

          <button class="text-sm font-bold text-slate-500 hover:text-cyan-800" type="button" @click="resetFilters">
            Réinitialiser les filtres
          </button>
        </div>
      </div>
    </div>

    <div class="surface-card overflow-hidden">
      <div
        v-if="selectedCount"
        class="flex flex-col gap-3 border-b border-slate-200 bg-cyan-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm font-bold text-cyan-900">
          {{ selectedCount }} enlèvement{{ selectedCount > 1 ? "s" : "" }} sélectionné{{ selectedCount > 1 ? "s" : "" }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-cyan-800 hover:border-cyan-300"
            type="button"
            @click="selectedIds = []"
          >
            Désélectionner
          </button>
          <button
            class="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="isDeleting"
            @click="deleteSelectedEnlevements"
          >
            {{ isDeleting ? "Suppression..." : "Supprimer la sélection" }}
          </button>
        </div>
      </div>

      <div class="hidden overflow-x-auto lg:block">
        <table class="data-table min-w-[1100px]">
          <thead>
            <tr>
              <th class="w-12 px-5 py-3">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm border-slate-300"
                  :checked="allPageSelected"
                  :disabled="!pageIds.length"
                  @change="togglePageSelection"
                />
              </th>
              <th v-if="isColumnVisible('date')" class="px-5 py-3">Date</th>
              <th v-if="isColumnVisible('number')" class="px-5 py-3">Numéro</th>
              <th v-if="isColumnVisible('sender')" class="px-5 py-3">Expéditeur</th>
              <th v-if="isColumnVisible('recipient')" class="px-5 py-3">Destinataire</th>
              <th v-if="isColumnVisible('destination')" class="px-5 py-3">Destination</th>
              <th v-if="isColumnVisible('packages')" class="px-5 py-3">Colis</th>
              <th v-if="isColumnVisible('amount')" class="px-5 py-3">Montant</th>
              <th v-if="isColumnVisible('payment')" class="px-5 py-3">Paiement</th>
              <th v-if="isColumnVisible('delivery')" class="px-5 py-3">Livraison</th>
              <th class="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in paginatedList"
              :key="item.id"
              :class="isSelected(item.id) ? 'bg-cyan-50/60' : ''"
            >
              <td class="whitespace-nowrap px-5 py-4">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm border-slate-300"
                  :checked="isSelected(item.id)"
                  @change="toggleSelection(item.id)"
                />
              </td>
              <td v-if="isColumnVisible('date')" class="whitespace-nowrap px-5 py-4 text-slate-600">{{ formatDateTime(item.date || item.createdAt) }}</td>
              <td v-if="isColumnVisible('number')" class="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">{{ item.numero || item.numeroSuivi || item.id.slice(0, 8) }}</td>
              <td v-if="isColumnVisible('sender')" class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.expediteur || "-" }}</td>
              <td v-if="isColumnVisible('recipient')" class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.destinataire || "-" }}</td>
              <td v-if="isColumnVisible('destination')" class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.destination || "-" }}</td>
              <td v-if="isColumnVisible('packages')" class="whitespace-nowrap px-5 py-4 text-slate-600">{{ item.nombreDeColis || 0 }}</td>
              <td v-if="isColumnVisible('amount')" class="whitespace-nowrap px-5 py-4 text-slate-600">{{ formatCurrency(parsePrixToNumber(item.prix)) }}</td>
              <td v-if="isColumnVisible('payment')" class="whitespace-nowrap px-5 py-4">
                <span class="status-badge" :class="paymentClass(item.statut)">
                  {{ canonicalizeStatut(item.statut) || "-" }}
                </span>
              </td>
              <td v-if="isColumnVisible('delivery')" class="whitespace-nowrap px-5 py-4">
                <span class="status-badge" :class="deliveryClass(getDeliveryStatus(item))">
                  {{ getDeliveryStatus(item) }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-4 text-right">
                <RouterLink class="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800" :to="`/liste/${item.id}`">
                  Ouvrir
                </RouterLink>
              </td>
            </tr>
            <tr v-if="!filteredList.length">
              <td class="px-5 py-10 text-center text-slate-500" :colspan="visibleColumns.length + 2">Aucun résultat.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="divide-y divide-slate-100 lg:hidden">
        <div
          v-for="item in paginatedList"
          :key="item.id"
          class="flex gap-3 p-4 hover:bg-slate-50"
          :class="isSelected(item.id) ? 'bg-cyan-50/60' : ''"
        >
          <div class="pt-1">
            <input
              type="checkbox"
              class="checkbox checkbox-sm border-slate-300"
              :checked="isSelected(item.id)"
              @change="toggleSelection(item.id)"
            />
          </div>
          <RouterLink :to="`/liste/${item.id}`" class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold text-slate-950">{{ item.expediteur || "Expéditeur" }}</p>
                <p class="mt-1 text-sm text-slate-500">{{ item.destinataire || "-" }} · {{ item.destination || "-" }}</p>
              </div>
              <span class="rounded-md px-2.5 py-1 text-xs font-bold" :class="deliveryClass(getDeliveryStatus(item))">
                {{ getDeliveryStatus(item) }}
              </span>
            </div>
            <div class="mt-3 grid gap-2 text-sm text-slate-600">
              <p>{{ formatDateTime(item.date || item.createdAt) }}</p>
              <p>{{ item.nombreDeColis || 0 }} colis · {{ formatCurrency(parsePrixToNumber(item.prix)) }}</p>
              <p>
                <span class="rounded-md px-2.5 py-1 text-xs font-bold" :class="paymentClass(item.statut)">
                  {{ canonicalizeStatut(item.statut) || "-" }}
                </span>
              </p>
            </div>
          </RouterLink>
        </div>

        <p v-if="!filteredList.length" class="px-5 py-10 text-center text-slate-500">Aucun résultat.</p>
      </div>

      <div
        v-if="filteredList.length"
        class="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm font-medium text-slate-500">
          {{ pageStart }}-{{ pageEnd }} sur {{ filteredList.length }} enlèvements
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model.number="pageSize"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <option :value="10">10 / page</option>
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
          </select>

          <button
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :disabled="currentPage <= 1"
            @click="currentPage -= 1"
          >
            Précédent
          </button>
          <span class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :disabled="currentPage >= totalPages"
            @click="currentPage += 1"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
