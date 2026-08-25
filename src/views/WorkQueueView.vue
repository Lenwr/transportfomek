<script setup>
import { computed } from "vue"
import { RouterLink } from "vue-router"
import { collection, orderBy, query } from "firebase/firestore"
import { useCollection } from "vuefire"
import { db } from "../components/firebaseConfig"

const pickupRequests = useCollection(query(collection(db, "pickupRequests"), orderBy("createdAt", "desc")))
const enlevements = useCollection(query(collection(db, "enlevements"), orderBy("createdAt", "desc")))
const plannedPickups = useCollection(query(collection(db, "plannedPickups"), orderBy("createdAt", "desc")))
const invoices = useCollection(query(collection(db, "invoices"), orderBy("createdAt", "desc")))
const invites = useCollection(query(collection(db, "pickupFormInvites"), orderBy("createdAt", "desc")))

function toDate(value) {
  if (!value) return null
  if (value?.toDate) return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return "-"
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function isOlderThan(value, hours) {
  const date = toDate(value)
  if (!date) return false
  return Date.now() - date.getTime() > hours * 60 * 60 * 1000
}

const pendingRequests = computed(() =>
  (pickupRequests.value || [])
    .filter((item) => String(item.status || "PENDING").toUpperCase() === "PENDING")
    .slice(0, 12)
)

const staleForms = computed(() => {
  const submittedIds = new Set(
    (invites.value || [])
      .filter((item) => String(item.status || "").toLowerCase() === "submitted")
      .map((item) => item.id)
  )

  return (plannedPickups.value || [])
    .filter((item) =>
      String(item.status || "sent") === "sent" &&
      isOlderThan(item.createdAt, 12) &&
      (!item.inviteId || !submittedIds.has(item.inviteId))
    )
    .slice(0, 12)
})

const unpaidInvoices = computed(() =>
  (invoices.value || [])
    .filter((item) => Number(item?.totals?.due || item?.resteAPayer || 0) > 0)
    .slice(0, 12)
)

const incompleteEnlevements = computed(() =>
  (enlevements.value || [])
    .filter((item) =>
      !item.destination ||
      !item.telephoneExpediteur ||
      !Array.isArray(item.colis) ||
      !item.colis.length ||
      String(item.deliveryStatus || "").toLowerCase() === "en attente"
    )
    .slice(0, 12)
)

const cards = computed(() => [
  { label: "Demandes en attente", value: pendingRequests.value.length, tone: "amber" },
  { label: "Formulaires sans retour", value: staleForms.value.length, tone: "blue" },
  { label: "Factures à encaisser", value: unpaidInvoices.value.length, tone: "red" },
  { label: "Dossiers à contrôler", value: incompleteEnlevements.value.length, tone: "slate" },
])
</script>

<template>
  <section class="page-shell">
    <div class="page-hero p-5 sm:p-6">
      <p class="eyebrow">Priorités</p>
      <h2 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">À traiter</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Les demandes, formulaires, paiements et dossiers qui méritent une action.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="card in cards" :key="card.label" class="surface-card p-5">
        <p class="text-sm font-medium text-slate-500">{{ card.label }}</p>
        <p class="mt-2 text-3xl font-extrabold text-slate-950">{{ card.value }}</p>
      </article>
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <section class="surface-card overflow-hidden">
        <div class="section-header">
          <div>
            <h3 class="font-bold text-slate-950">Demandes client</h3>
            <p class="text-sm text-slate-500">À valider ou refuser.</p>
          </div>
          <RouterLink class="text-sm font-bold text-cyan-800" to="/pickup-requests">Tout voir</RouterLink>
        </div>
        <div class="divide-y divide-slate-100">
          <RouterLink v-for="item in pendingRequests" :key="item.id" :to="`/validate-request/${item.id}`" class="block p-4 hover:bg-slate-50">
            <p class="font-bold text-slate-950">{{ [item.clientPrenom, item.clientNom].filter(Boolean).join(" ") || "Demande client" }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ item.clientPhone || "-" }} · {{ item.destination || item.pickupAddress || "-" }}</p>
          </RouterLink>
          <p v-if="!pendingRequests.length" class="p-6 text-sm text-slate-500">Aucune demande en attente.</p>
        </div>
      </section>

      <section class="surface-card overflow-hidden">
        <div class="section-header">
          <div>
            <h3 class="font-bold text-slate-950">Formulaires sans retour</h3>
            <p class="text-sm text-slate-500">Envoyés depuis plus de 12h.</p>
          </div>
        </div>
        <div class="divide-y divide-slate-100">
          <article v-for="item in staleForms" :key="item.id" class="p-4">
            <p class="font-bold text-slate-950">{{ item.clientName || "Client" }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ item.clientPhone || "-" }} · envoyé {{ formatDate(item.createdAt) }}</p>
          </article>
          <p v-if="!staleForms.length" class="p-6 text-sm text-slate-500">Aucun formulaire à relancer.</p>
        </div>
      </section>

      <section class="surface-card overflow-hidden">
        <div class="section-header">
          <div>
            <h3 class="font-bold text-slate-950">Factures à encaisser</h3>
            <p class="text-sm text-slate-500">Reste à payer détecté.</p>
          </div>
          <RouterLink class="text-sm font-bold text-cyan-800" to="/invoices">Factures</RouterLink>
        </div>
        <div class="divide-y divide-slate-100">
          <article v-for="item in unpaidInvoices" :key="item.id" class="p-4">
            <p class="font-bold text-slate-950">{{ item.number || item.invoiceNumber || "Facture" }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ item.client?.companyName || item.client?.representativeName || "Client" }} · {{ Number(item?.totals?.due || item?.resteAPayer || 0).toLocaleString("fr-FR") }} €</p>
          </article>
          <p v-if="!unpaidInvoices.length" class="p-6 text-sm text-slate-500">Aucune facture due.</p>
        </div>
      </section>

      <section class="surface-card overflow-hidden">
        <div class="section-header">
          <div>
            <h3 class="font-bold text-slate-950">Dossiers à contrôler</h3>
            <p class="text-sm text-slate-500">Données manquantes ou en attente.</p>
          </div>
          <RouterLink class="text-sm font-bold text-cyan-800" to="/liste">Enlèvements</RouterLink>
        </div>
        <div class="divide-y divide-slate-100">
          <RouterLink v-for="item in incompleteEnlevements" :key="item.id" :to="`/liste/${item.id}`" class="block p-4 hover:bg-slate-50">
            <p class="font-bold text-slate-950">{{ item.numero || item.numeroSuivi || item.expediteur || "Enlèvement" }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ item.expediteur || "-" }} · {{ item.destination || "Destination manquante" }}</p>
          </RouterLink>
          <p v-if="!incompleteEnlevements.length" class="p-6 text-sm text-slate-500">Aucun dossier urgent.</p>
        </div>
      </section>
    </div>
  </section>
</template>
