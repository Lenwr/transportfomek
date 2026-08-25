<script setup>
import { computed } from "vue"
import { collection, orderBy, query } from "firebase/firestore"
import { useCollection, useFirestore } from "vuefire"

const db = useFirestore()

const enlevements = useCollection(query(collection(db, "enlevements"), orderBy("createdAt", "desc")))
const customers = useCollection(collection(db, "customers"))
const invoices = useCollection(query(collection(db, "invoices"), orderBy("createdAt", "desc")))
const requests = useCollection(query(collection(db, "pickupRequests"), orderBy("createdAt", "desc")))
const chargements = useCollection(collection(db, "chargements"))

const todayKey = new Date().toISOString().slice(0, 10)

const getDateKey = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value.slice(0, 10)
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10)
  return ""
}

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  })

const formatDate = (value) => {
  if (!value) return "-"
  const date = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
}

const toAmount = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(",", ".")
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()

const shipmentStatus = (item = {}) => {
  const status = normalizeText(item.deliveryStatus || item.statutColis || item.status || item.statut)
  if (/annul|cancel/.test(status)) return "CANCELLED"
  if (/livr/.test(status)) return "DELIVERED"
  if (/disponible|retrait|arriv/.test(status)) return "READY"
  if (/transit|expedi|envoye/.test(status)) return "IN_TRANSIT"
  if (/charg|conteneur/.test(status)) return "LOADED"
  if (/reception|recu|depose/.test(status)) return "RECEIVED"
  return "PENDING"
}

const shipmentPrice = (item = {}) =>
  toAmount(item.prix ?? item.price ?? item.totalPrice ?? item.montantTotal ?? item.total)

const shipmentDue = (item = {}) =>
  Math.max(0, toAmount(item.resteAPayer ?? item.amountDue ?? item.solde ?? item.balanceDue))

const shipmentPackageCount = (item = {}) => {
  const packages = Array.isArray(item.colis) ? item.colis : Array.isArray(item.packages) ? item.packages : []
  if (!packages.length) return Number(item.nombreColis || item.packageCount || 1)
  return packages.reduce((sum, parcel) => sum + Math.max(1, Number(parcel.quantite || parcel.quantity || 1)), 0)
}

const openInvoices = computed(() =>
  (invoices.value || []).filter((invoice) => Number(invoice?.totals?.due || invoice?.resteAPayer || 0) > 0)
)

const todayEnlevements = computed(() =>
  (enlevements.value || []).filter((item) => getDateKey(item?.createdAt || item?.date) === todayKey)
)

const pendingRequests = computed(() =>
  (requests.value || []).filter((item) => !item?.status || ["pending", "new"].includes(String(item.status).toLowerCase()))
)

const invoiceDueTotal = computed(() =>
  openInvoices.value.reduce((sum, invoice) => sum + Number(invoice?.totals?.due || invoice?.resteAPayer || 0), 0)
)

const totalRevenue = computed(() =>
  (enlevements.value || []).reduce((sum, item) => sum + shipmentPrice(item), 0)
)

const totalDue = computed(() => {
  const shipmentBalance = (enlevements.value || []).reduce((sum, item) => sum + shipmentDue(item), 0)
  return shipmentBalance || invoiceDueTotal.value
})

const totalCollected = computed(() => Math.max(0, totalRevenue.value - totalDue.value))

const totalPackages = computed(() =>
  (enlevements.value || []).reduce((sum, item) => sum + shipmentPackageCount(item), 0)
)

const statusDefinitions = [
  { key: "PENDING", label: "En attente", color: "bg-slate-400" },
  { key: "RECEIVED", label: "Réceptionnés", color: "bg-cyan-600" },
  { key: "LOADED", label: "Chargés", color: "bg-indigo-500" },
  { key: "IN_TRANSIT", label: "En transit", color: "bg-amber-500" },
  { key: "READY", label: "Disponibles", color: "bg-violet-500" },
  { key: "DELIVERED", label: "Livrés", color: "bg-emerald-500" },
]

const statusRows = computed(() => {
  const shipments = enlevements.value || []
  const total = Math.max(1, shipments.length)
  return statusDefinitions.map((definition) => {
    const count = shipments.filter((item) => shipmentStatus(item) === definition.key).length
    return { ...definition, count, percent: Math.round((count / total) * 100) }
  })
})

const freightRows = computed(() => {
  const shipments = enlevements.value || []
  const total = Math.max(1, shipments.length)
  return [
    { label: "Maritime", match: /maritime|mer/, color: "bg-[#176b8a]" },
    { label: "Aérien", match: /aerien|air|avion/, color: "bg-sky-400" },
  ].map((entry) => {
    const count = shipments.filter((item) => entry.match.test(normalizeText(item.typeDeFret || item.service || item.freightType))).length
    return { ...entry, count, percent: Math.round((count / total) * 100) }
  })
})

const destinationRows = computed(() => {
  const totals = new Map()
  for (const item of enlevements.value || []) {
    const label = String(item.destination || "Non renseignée").trim().toUpperCase()
    totals.set(label, (totals.get(label) || 0) + 1)
  }
  const max = Math.max(1, ...totals.values())
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count, percent: Math.round((count / max) * 100) }))
})

const stats = computed(() => [
  {
    label: "Enlevements du jour",
    value: todayEnlevements.value.length,
    detail: `${enlevements.value?.length || 0} au total`,
    tone: "blue",
  },
  {
    label: "Colis enregistrés",
    value: totalPackages.value,
    detail: `${customers.value?.length || 0} clients actifs`,
    tone: "slate",
  },
  {
    label: "Chiffre d’affaires",
    value: formatMoney(totalRevenue.value),
    detail: `${enlevements.value?.length || 0} dossiers`,
    tone: "green",
  },
  {
    label: "Montant encaissé",
    value: formatMoney(totalCollected.value),
    detail: totalRevenue.value ? `${Math.round((totalCollected.value / totalRevenue.value) * 100)} % encaissé` : "Aucun encaissement",
    tone: "blue",
  },
  {
    label: "Reste à encaisser",
    value: formatMoney(totalDue.value),
    detail: `${openInvoices.value.length} facture(s) à surveiller`,
    tone: "amber",
  },
  {
    label: "Chargements",
    value: chargements.value?.length || 0,
    detail: "Conteneurs et listes de colisage",
    tone: "slate",
  },
])

const recentEnlevements = computed(() => (enlevements.value || []).slice(0, 6))
const recentRequests = computed(() => (requests.value || []).slice(0, 5))

const actions = [
  {
    title: "Nouvel enlevement",
    text: "Creer une expedition",
    path: "/form",
    image: "/images/formulaire.png",
  },
  {
    title: "Scanner colis",
    text: "Reception et statut",
    path: "/scan",
    image: "/images/colis.png",
  },
  {
    title: "Charger un conteneur",
    text: "Scanner et lister les colis",
    path: "/recording",
    image: "/images/chargements.jpg",
  },
]
</script>

<template>
  <section class="page-shell">
    <div class="page-hero fomek-dashboard-hero overflow-hidden border-0">
      <div class="grid gap-0 lg:grid-cols-[1.6fr_1fr]">
        <div class="p-5 sm:p-7 lg:p-8">
          <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-200">Centre des opérations</p>
          <div class="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 class="max-w-2xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Votre activité France–Cameroun en un coup d’œil
              </h2>
              <p class="mt-2 max-w-xl text-sm leading-6 text-cyan-50/75">
                Enlèvements, clients, chargements, suivi et facturation réunis dans une vue de travail claire.
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <RouterLink class="pro-button bg-white text-[#073b55] hover:bg-cyan-50" to="/form">
                Nouvel enlevement
              </RouterLink>
              <RouterLink class="pro-button border border-white/20 bg-white/10 text-white hover:bg-white/20" to="/scan">
                Scanner
              </RouterLink>
              <RouterLink class="pro-button border border-white/20 bg-white/10 text-white hover:bg-white/20" to="/recording">
                Chargement conteneur
              </RouterLink>
            </div>
          </div>
        </div>

        <div class="relative min-h-48 overflow-hidden lg:min-h-full">
          <img class="h-full min-h-48 w-full object-cover opacity-75 mix-blend-luminosity" src="/images/chargements.jpg" alt="Conteneurs et operations logistiques" />
          <div class="absolute inset-0 bg-gradient-to-r from-[#073b55] via-transparent to-cyan-300/10"></div>
        </div>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <article
        v-for="item in stats"
        :key="item.label"
        class="surface-card group relative overflow-hidden p-5 transition hover:-translate-y-1 hover:border-cyan-200"
      >
        <div
          class="absolute inset-x-0 top-0 h-1"
          :class="{
            'bg-cyan-600': item.tone === 'blue',
            'bg-slate-500': item.tone === 'slate',
            'bg-amber-500': item.tone === 'amber',
            'bg-emerald-500': item.tone === 'green',
          }"
        ></div>
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-slate-500">{{ item.label }}</p>
            <p class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 2xl:text-[1.65rem]">{{ item.value }}</p>
          </div>
          <span
            class="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold"
            :class="{
              'bg-cyan-50 text-cyan-800': item.tone === 'blue',
              'bg-slate-100 text-slate-700': item.tone === 'slate',
              'bg-amber-50 text-amber-700': item.tone === 'amber',
              'bg-emerald-50 text-emerald-700': item.tone === 'green',
            }"
          >{{ item.label.slice(0, 2).toUpperCase() }}</span>
        </div>
        <p class="mt-3 text-sm font-medium text-slate-500">{{ item.detail }}</p>
      </article>
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section class="surface-card p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Flux des colis</p>
            <h3 class="mt-1 text-lg font-extrabold text-slate-950">Répartition par statut</h3>
          </div>
          <span class="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
            {{ enlevements.length || 0 }} expédition(s)
          </span>
        </div>

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <div v-for="row in statusRows" :key="row.key" class="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :class="row.color"></span>
                <span class="text-sm font-semibold text-slate-700">{{ row.label }}</span>
              </div>
              <strong class="text-lg text-slate-950">{{ row.count }}</strong>
            </div>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70">
              <div class="h-full rounded-full transition-all" :class="row.color" :style="{ width: `${row.percent}%` }"></div>
            </div>
            <p class="mt-2 text-right text-xs font-semibold text-slate-400">{{ row.percent }} %</p>
          </div>
        </div>
      </section>

      <section class="surface-card p-5 sm:p-6">
        <p class="eyebrow">Analyse logistique</p>
        <h3 class="mt-1 text-lg font-extrabold text-slate-950">Modes et destinations</h3>

        <div class="mt-6 grid grid-cols-2 gap-3">
          <div v-for="row in freightRows" :key="row.label" class="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <p class="text-sm font-semibold text-slate-500">{{ row.label }}</p>
            <div class="mt-2 flex items-end justify-between gap-2">
              <strong class="text-2xl text-slate-950">{{ row.count }}</strong>
              <span class="text-xs font-bold text-slate-400">{{ row.percent }} %</span>
            </div>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full" :class="row.color" :style="{ width: `${row.percent}%` }"></div>
            </div>
          </div>
        </div>

        <div class="mt-6 border-t border-slate-100 pt-5">
          <p class="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Destinations principales</p>
          <div v-if="destinationRows.length" class="mt-4 space-y-4">
            <div v-for="row in destinationRows" :key="row.label">
              <div class="flex items-center justify-between text-sm">
                <span class="font-semibold text-slate-700">{{ row.label }}</span>
                <strong class="text-slate-950">{{ row.count }}</strong>
              </div>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full bg-gradient-to-r from-[#176b8a] to-[#35a7c7]" :style="{ width: `${row.percent}%` }"></div>
              </div>
            </div>
          </div>
          <p v-else class="mt-4 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Aucune donnée de destination.</p>
        </div>
      </section>
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <section class="surface-card overflow-hidden">
        <div class="section-header">
          <div>
            <h3 class="text-base font-bold text-slate-950">Derniers enlevements</h3>
            <p class="text-sm text-slate-500">Suivi rapide des operations recentes</p>
          </div>
          <RouterLink class="text-sm font-bold text-cyan-800 hover:text-cyan-900" to="/liste">Voir tout</RouterLink>
        </div>

        <div class="home-recent-cards divide-y divide-slate-100 md:hidden">
          <RouterLink
            v-for="item in recentEnlevements"
            :key="item.id"
            :to="`/liste/${item.id}`"
            class="block px-5 py-4 hover:bg-slate-50"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-bold text-slate-950">
                  {{ item.expediteur || item.nomExpediteur || "Expediteur" }}
                </p>
                <p class="mt-1 truncate text-sm text-slate-500">
                  {{ item.numero || item.numeroSuivi || item.trackingNumber || item.id?.slice(0, 8) }}
                </p>
              </div>
              <span class="shrink-0 rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">
                {{ item.destination || "-" }}
              </span>
            </div>
            <div class="mt-3 flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>{{ formatDate(item.createdAt || item.date) }}</span>
              <span class="truncate">{{ item.deliveryStatus || item.statut || "En cours" }}</span>
            </div>
          </RouterLink>
          <p v-if="!recentEnlevements.length" class="px-5 py-8 text-center text-slate-500">
            Aucun enlevement recent
          </p>
        </div>

        <div class="home-recent-table hidden overflow-x-auto md:block">
          <table class="data-table">
            <thead>
              <tr>
                <th class="px-5 py-3">Reference</th>
                <th class="px-5 py-3">Expediteur</th>
                <th class="px-5 py-3">Destination</th>
                <th class="px-5 py-3">Date</th>
                <th class="px-5 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in recentEnlevements" :key="item.id">
                <td class="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                  {{ item.numeroSuivi || item.trackingNumber || item.id?.slice(0, 8) }}
                </td>
                <td class="whitespace-nowrap px-5 py-4 text-slate-600">
                  {{ item.expediteur || item.nomExpediteur || "-" }}
                </td>
                <td class="whitespace-nowrap px-5 py-4 text-slate-600">
                  {{ item.destination || "-" }}
                </td>
                <td class="whitespace-nowrap px-5 py-4 text-slate-600">
                  {{ formatDate(item.createdAt || item.date) }}
                </td>
                <td class="whitespace-nowrap px-5 py-4">
                  <span class="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">
                    {{ item.deliveryStatus || item.statut || "En cours" }}
                  </span>
                </td>
              </tr>
              <tr v-if="!recentEnlevements.length">
                <td class="px-5 py-8 text-center text-slate-500" colspan="5">Aucun enlevement recent</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="space-y-6">
        <section class="surface-card p-5">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-slate-950">Actions rapides</h3>
              <p class="text-sm text-slate-500">Acces direct aux modules</p>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            <RouterLink
              v-for="action in actions"
              :key="action.path"
              :to="action.path"
              class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:shadow-sm"
            >
              <img class="h-12 w-12 rounded-md object-cover" :src="action.image" :alt="action.title" />
              <div class="min-w-0">
                <p class="font-semibold text-slate-950">{{ action.title }}</p>
                <p class="text-sm text-slate-500">{{ action.text }}</p>
              </div>
            </RouterLink>
          </div>
        </section>

        <section class="surface-card p-5">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-slate-950">Demandes</h3>
              <p class="text-sm text-slate-500">{{ pendingRequests.length }} en attente</p>
            </div>
            <RouterLink class="text-sm font-semibold text-cyan-800" to="/pickup-requests">Ouvrir</RouterLink>
          </div>

          <div class="mt-4 space-y-3">
            <div
              v-for="request in recentRequests"
              :key="request.id"
              class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="truncate text-sm font-semibold text-slate-900">
                  {{ request.tenantName || request.customerName || "Demande client" }}
                </p>
                <span class="status-badge bg-amber-100 text-amber-700">
                  {{ request.status || "pending" }}
                </span>
              </div>
              <p class="mt-1 text-sm text-slate-500">{{ request.destination || request.requestedDate || "-" }}</p>
            </div>
            <p v-if="!recentRequests.length" class="rounded-lg bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
              Aucune demande recente
            </p>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.fomek-dashboard-hero {
  background:
    radial-gradient(circle at 20% 0%, rgb(53 167 199 / 0.28), transparent 24rem),
    linear-gradient(125deg, #073b55 0%, #0b5573 55%, #176b8a 100%);
  box-shadow: 0 24px 70px rgb(7 59 85 / 0.18);
}

@media (max-width: 767px) {
  .home-recent-cards {
    display: block !important;
  }

  .home-recent-table {
    display: none !important;
  }
}

@media (min-width: 768px) {
  .home-recent-cards {
    display: none !important;
  }

  .home-recent-table {
    display: block !important;
  }
}
</style>
