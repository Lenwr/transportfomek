<script setup>
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { collection, orderBy, query } from "firebase/firestore"
import { useCollection } from "vuefire"
import { db } from "./firebaseConfig"

const router = useRouter()
const search = ref("")
const open = ref(false)

const enlevements = useCollection(query(collection(db, "enlevements"), orderBy("createdAt", "desc")))
const customers = useCollection(collection(db, "customers"))
const clients = useCollection(collection(db, "clients"))
const pickupRequests = useCollection(query(collection(db, "pickupRequests"), orderBy("createdAt", "desc")))
const invoices = useCollection(query(collection(db, "invoices"), orderBy("createdAt", "desc")))
const boxes = useCollection(collection(db, "boxes"))
const chargements = useCollection(collection(db, "chargements"))

function haystack(parts = []) {
  return parts.filter(Boolean).join(" ").toLowerCase()
}

const indexedItems = computed(() => [
  ...(enlevements.value || []).map((item) => ({
    id: `enlevement:${item.id}`,
    title: item.numero || item.numeroSuivi || item.expediteur || "Enlevement",
    subtitle: [item.expediteur, item.destinataire, item.destination].filter(Boolean).join(" · "),
    type: "Enlevement",
    path: `/liste/${item.id}`,
    text: haystack([item.numero, item.numeroSuivi, item.expediteur, item.destinataire, item.telephoneExpediteur, item.telephoneDestinataire, item.destination]),
  })),
  ...(customers.value || []).map((item) => ({
    id: `customer:${item.id}`,
    title: item.displayName || item.nom || item.expediteur || "Client",
    subtitle: [item.phone || item.telephone || item.telephoneExpediteur, item.adresse || item.adresseComplete].filter(Boolean).join(" · "),
    type: "Client",
    path: item.id ? `/customersDetails/${item.id}` : "/customers",
    text: haystack([item.displayName, item.nom, item.prenom, item.expediteur, item.phone, item.telephone, item.telephoneExpediteur, item.email, item.adresse, item.adresseComplete]),
  })),
  ...(clients.value || []).map((item) => ({
    id: `portalClient:${item.id}`,
    title: item.displayName || [item.prenom, item.nom].filter(Boolean).join(" ") || item.email || "Client portail",
    subtitle: [item.phone || item.telephone, item.email].filter(Boolean).join(" · "),
    type: "Portail",
    path: item.id ? `/customersDetails/${item.id}` : "/customers",
    text: haystack([item.displayName, item.prenom, item.nom, item.phone, item.telephone, item.email, item.adresse, item.adresseComplete]),
  })),
  ...(pickupRequests.value || []).map((item) => ({
    id: `request:${item.id}`,
    title: [item.clientPrenom, item.clientNom].filter(Boolean).join(" ") || "Demande client",
    subtitle: [item.clientPhone, item.destination, item.status || "PENDING"].filter(Boolean).join(" · "),
    type: "Demande",
    path: `/validate-request/${item.id}`,
    text: haystack([item.clientPrenom, item.clientNom, item.clientPhone, item.clientAdresse, item.destinataire, item.destination, item.status]),
  })),
  ...(invoices.value || []).map((item) => ({
    id: `invoice:${item.id}`,
    title: item.number || item.invoiceNumber || "Facture",
    subtitle: [item.client?.companyName || item.client?.representativeName, item.period].filter(Boolean).join(" · "),
    type: "Facture",
    path: "/invoices",
    text: haystack([item.number, item.invoiceNumber, item.period, item.client?.companyName, item.client?.representativeName, item.client?.phone, item.client?.email]),
  })),
  ...(boxes.value || []).map((item) => ({
    id: `box:${item.id}`,
    title: item.code || item.name || "Box",
    subtitle: [item.status, item.currentClientName, item.location].filter(Boolean).join(" · "),
    type: "Box",
    path: `/boxes/${item.id}`,
    text: haystack([item.code, item.name, item.status, item.currentClientName, item.location]),
  })),
  ...(chargements.value || []).map((item) => ({
    id: `chargement:${item.id}`,
    title: item.contenaire || item.container || item.id || "Chargement",
    subtitle: [item.destination, item.date].filter(Boolean).join(" · "),
    type: "Chargement",
    path: `/chargementsDetails/${item.id}`,
    text: haystack([item.contenaire, item.container, item.destination, item.date]),
  })),
])

const results = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (q.length < 2) return []
  return indexedItems.value.filter((item) => item.text.includes(q)).slice(0, 8)
})

function openResult(item) {
  search.value = ""
  open.value = false
  router.push(item.path)
}
</script>

<template>
  <div class="relative hidden min-w-[260px] max-w-md flex-1 md:block">
    <input
      v-model="search"
      class="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
      placeholder="Recherche globale..."
      @focus="open = true"
      @keydown.esc="open = false"
    />

    <div
      v-if="open && search.trim().length >= 2"
      class="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
    >
      <button
        v-for="item in results"
        :key="item.id"
        class="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
        type="button"
        @mousedown.prevent="openResult(item)"
      >
        <span class="text-xs font-bold uppercase tracking-wide text-cyan-800">{{ item.type }}</span>
        <span class="mt-1 block truncate text-sm font-bold text-slate-950">{{ item.title }}</span>
        <span class="mt-0.5 block truncate text-xs text-slate-500">{{ item.subtitle || "Ouvrir" }}</span>
      </button>

      <p v-if="!results.length" class="px-4 py-5 text-sm text-slate-500">Aucun résultat.</p>
    </div>
  </div>
</template>
