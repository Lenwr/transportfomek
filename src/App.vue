<script setup>
import { computed, onMounted, ref, watch } from "vue"
import { RouterLink, RouterView, useRoute } from "vue-router"
import { collection, doc, orderBy, query, updateDoc } from "firebase/firestore"
import { useCollection } from "vuefire"
import { useAuthStore } from "./stores/useAuthStore.js"
import { db } from "./components/firebaseConfig.js"
import GlobalSearch from "./components/GlobalSearch.vue"

const route = useRoute()
const store = useAuthStore()
const menuOpen = ref(false)
const notificationsOpen = ref(false)
const pickupRequestsSnap = useCollection(query(collection(db, "pickupRequests"), orderBy("createdAt", "desc")))
const adminNotificationsSnap = useCollection(query(collection(db, "adminNotifications"), orderBy("createdAt", "desc")))

const navSections = [
  {
    title: "Pilotage",
    items: [
      { label: "Dashboard", path: "/", icon: "DB", permission: "dashboard" },
      { label: "À traiter", path: "/work-queue", icon: "AT", permission: "dashboard" },
      { label: "Suivi client", path: "/client-followup", icon: "CL", permission: "clientFollowup" },
    ],
  },
  {
    title: "Enlevements",
    items: [
      { label: "Liste", path: "/liste", icon: "EN", permission: "liste" },
      { label: "Nouvel enlevement", path: "/form", icon: "NE", permission: "form" },
      { label: "Clients", path: "/customers", icon: "CL", permission: "customers" },
      { label: "Demandes", path: "/pickup-requests", icon: "DM", permission: "pickupRequests" },
      { label: "Scan demande", path: "/pickup-request-scan", icon: "SD", permission: "pickupRequestScan", activePaths: ["/pickup-request-scan", "/validate-request"] },
      { label: "Scan livraison", path: "/delivery-scan", icon: "SL", permission: "deliveryScan", activePaths: ["/delivery-scan", "/sign"] },
    ],
  },
  {
    title: "Chargements",
    items: [
      { label: "Conteneurs", path: "/recording", icon: "CO", permission: "recording", activePaths: ["/recording", "/chargementsDetails"] },
    ],
  },
  {
    title: "Facturation",
    items: [
      { label: "Factures & devis", path: "/billing-documents", icon: "FD", permission: "billing" },
      { label: "Calculateur", path: "/calculator", icon: "CA", permission: "billing" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Tarifs", path: "/pricing", icon: "TR", superAdminOnly: true },
      { label: "Paramètres", path: "/settings", icon: "PA", superAdminOnly: true },
      { label: "Journal", path: "/activity-log", icon: "JL", superAdminOnly: true },
    ],
  },
]

const navItems = navSections.flatMap((section) => section.items)

const quickActions = [
  { label: "Nouvel enlevement", path: "/form", permission: "form" },
  { label: "Nouveau chargement", path: "/recording", permission: "recording" },
  { label: "Nouveau client", path: "/customersForm", superAdminOnly: true },
]
const isClientUser = computed(() => store.role === "client")
const canSeeItem = (item) =>
  (!item.superAdminOnly || store.isSuperAdmin) &&
  (!item.permission || store.hasPermission(item.permission))
const visibleNavSections = computed(() =>
  !store.initialized || isClientUser.value
    ? []
    : navSections
        .map((section) => ({
          ...section,
          items: section.items.filter(canSeeItem),
        }))
        .filter((section) => section.items.length)
)
const visibleQuickActions = computed(() =>
  !store.initialized || isClientUser.value ? [] : quickActions.filter(canSeeItem)
)
const mobileNavItems = computed(() =>
  visibleNavSections.value.flatMap((section) => section.items).slice(0, 5)
)

const titles = {
  "/": "Dashboard",
  "/work-queue": "À traiter",
  "/activity-log": "Journal d’activité",
  "/liste": "Enlevements",
  "/scan": "Scan colis",
  "/delivery-scan": "Scan livraison",
  "/pickup-request-scan": "Scan demande client",
  "/sign": "Signature livraison",
  "/recording": "Chargements conteneurs",
  "/customers": "Clients",
  "/pickup-requests": "Demandes",
  "/billing-documents": "Factures & devis",
  "/calculator": "Calculateur",
  "/client-followup": "Suivi client",
  "/pricing": "Grille tarifaire",
  "/settings": "Paramètres",
}

onMounted(() => {
  store.init()
})

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    notificationsOpen.value = false
  }
)

const isPublicRoute = computed(() => route.meta?.authNeeded === false)
const showLayout = computed(() => store.isLoggedIn && !isPublicRoute.value)
const pageTitle = computed(() => {
  if (route.path.startsWith("/chargementsDetails")) return "Liste de colissage"
  if (route.path.startsWith("/sign")) return "Signature livraison"
  return titles[route.path] || route.name || "Transport Fomek"
})
const userInitial = computed(() => store.user?.email?.charAt(0).toUpperCase() || "U")
const pendingPickupRequests = computed(() =>
  (pickupRequestsSnap.value || []).filter((request) =>
    String(request.status || "PENDING").toUpperCase() === "PENDING"
  )
)
const pendingRequestsCount = computed(() => pendingPickupRequests.value.length)
const unreadAdminNotifications = computed(() =>
  (adminNotificationsSnap.value || []).filter((notification) => notification.read !== true)
)
const notifications = computed(() =>
  [
    ...unreadAdminNotifications.value.map((notification) => ({
      id: `admin-${notification.id}`,
      documentId: notification.id,
      title: notification.title || "Notification",
      detail: notification.message || "Un colis a été livré.",
      path: notification.enlevementId ? `/liste/${notification.enlevementId}` : "/liste",
      kind: "admin",
    })),
    ...pendingPickupRequests.value.map((request) => ({
      id: `pickup-${request.id}`,
      title: [request.clientPrenom, request.clientNom].filter(Boolean).join(" ").trim() || "Demande client",
      detail: request.clientAdresse || request.pickupAddress || request.destination || "Nouvelle demande d'enlevement",
      path: `/validate-request/${request.id}`,
      kind: "pickup",
    })),
  ].slice(0, 8)
)
const notificationsCount = computed(() => pendingRequestsCount.value + unreadAdminNotifications.value.length)

const openNotification = async (notification) => {
  notificationsOpen.value = false
  if (notification.kind !== "admin" || !notification.documentId) return
  try {
    await updateDoc(doc(db, "adminNotifications", notification.documentId), { read: true })
  } catch (error) {
    console.error("Impossible de marquer la notification comme lue :", error)
  }
}

const logOut = async () => {
  await store.logout()
}

const isActive = (path) => {
  const item = navItems.find((navItem) => navItem.path === path)
  if (item?.activePaths?.some((activePath) => route.path.startsWith(activePath))) return true
  if (path === "/") return route.path === "/"
  return route.path === path || route.path.startsWith(`${path}/`)
}

const getBadgeCount = (item) => {
  if (item.path === "/pickup-requests") return pendingRequestsCount.value
  return 0
}
</script>

<template>
  <template v-if="!showLayout">
    <RouterView />
  </template>

  <div v-else class="min-h-screen overflow-x-hidden text-slate-950">
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-72 overflow-hidden border-r border-slate-200/80 bg-white shadow-[14px_0_45px_rgba(3,55,80,0.08)] lg:flex lg:flex-col">
      <div class="flex h-24 items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-cyan-50/70 px-5">
        <img class="h-14 w-24 rounded-xl border border-slate-100 bg-white object-contain p-1.5 shadow-sm" src="/images/logo-fomek.png" alt="Transport Fomek" />
        <div>
          <p class="text-sm font-extrabold uppercase tracking-wide text-[#073b55]">Transport Fomek</p>
          <p class="text-xs font-medium text-[#176b8a]">France · Cameroun</p>
        </div>
      </div>

      <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        <div v-for="section in visibleNavSections" :key="section.title">
          <p class="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            {{ section.title }}
          </p>
          <div class="space-y-1">
            <RouterLink
              v-for="item in section.items"
              :key="item.path"
              :to="item.path"
              class="group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition"
              :class="isActive(item.path)
                ? 'bg-[#073b55] text-white shadow-md shadow-cyan-950/15'
                : 'text-slate-600 hover:bg-cyan-50 hover:text-[#075579]'"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                :class="isActive(item.path) ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-white'"
              >
                {{ item.icon }}
              </span>
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <span
                v-if="getBadgeCount(item)"
                class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white"
              >
                {{ getBadgeCount(item) > 99 ? "99+" : getBadgeCount(item) }}
              </span>
              <span
                v-if="item.superAdminOnly"
                class="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
              >
                Super
              </span>
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="border-t border-slate-100 p-4">
        <div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#073b55] text-sm font-bold text-white shadow-sm">
            {{ userInitial }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold text-slate-900">{{ store.user?.email }}</p>
            <button class="mt-1 text-xs font-medium text-[#176b8a] hover:text-[#073b55]" type="button" @click="logOut">
              Deconnexion
            </button>
          </div>
        </div>
      </div>
    </aside>

    <div
      v-if="menuOpen"
      class="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
      @click="menuOpen = false"
    ></div>

    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-1rem))] transform flex-col border-r border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform lg:hidden"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div class="flex items-center gap-3">
          <img class="h-10 w-28 rounded-lg bg-white object-contain px-1 ring-1 ring-slate-200" src="/images/logo-fomek.png" alt="Transport Fomek" />
          <div>
            <p class="text-sm font-bold uppercase tracking-wide">Transport Fomek</p>
            <p class="text-xs text-slate-500">Gestion de fret</p>
          </div>
        </div>
        <button class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600" type="button" @click="menuOpen = false">
          X
        </button>
      </div>

      <nav class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-5">
        <div v-for="section in visibleNavSections" :key="section.title">
          <p class="mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {{ section.title }}
          </p>
          <div class="space-y-1">
            <RouterLink
              v-for="item in section.items"
              :key="item.path"
              :to="item.path"
              class="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold"
              :class="isActive(item.path) ? 'bg-slate-950 text-white' : 'text-slate-600'"
            >
              <span class="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600">
                {{ item.icon }}
              </span>
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <span
                v-if="getBadgeCount(item)"
                class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white"
              >
                {{ getBadgeCount(item) > 99 ? "99+" : getBadgeCount(item) }}
              </span>
              <span
                v-if="item.superAdminOnly"
                class="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
              >
                Super
              </span>
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="shrink-0 border-t border-slate-200 p-4">
        <div class="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            {{ userInitial }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold text-slate-900">{{ store.user?.email }}</p>
            <button class="mt-1 text-xs font-medium text-red-600 hover:text-red-700" type="button" @click="logOut">
              Deconnexion
            </button>
          </div>
        </div>
      </div>
    </aside>

    <div class="min-w-0 lg:pl-72">
      <header class="sticky top-0 z-20 border-b border-white/10 bg-gradient-to-r from-[#073b55] via-[#0b5573] to-[#176b8a] text-white shadow-lg shadow-cyan-950/10">
        <div class="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div class="flex min-w-0 items-center gap-3">
            <button
              class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white lg:hidden"
              type="button"
              @click="menuOpen = true"
            >
              =
            </button>
            <div class="min-w-0">
              <p class="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">Transport Fomek</p>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h1 class="truncate text-xl font-extrabold tracking-tight text-white sm:text-2xl">{{ pageTitle }}</h1>
                <span
                  v-if="store.isSuperAdmin"
                  class="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700"
                >
                  Super admin
                </span>
              </div>
            </div>
          </div>

          <div class="flex min-w-0 flex-1 items-center justify-end gap-2">
            <GlobalSearch />

            <div class="relative">
              <button
                class="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm transition hover:bg-white/20"
                type="button"
                title="Notifications"
                @click="notificationsOpen = !notificationsOpen"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span
                  v-if="notificationsCount"
                  class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white ring-2 ring-white"
                >
                  {{ notificationsCount > 99 ? "99+" : notificationsCount }}
                </span>
              </button>

              <div
                v-if="notificationsOpen"
                class="absolute right-0 top-12 z-30 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
              >
                <div class="border-b border-slate-100 px-4 py-3">
                  <p class="text-sm font-bold text-slate-950">Notifications</p>
                  <p class="text-xs text-slate-500">{{ notificationsCount }} notification(s) non lue(s)</p>
                </div>

                <div v-if="notifications.length" class="max-h-80 overflow-y-auto">
                  <RouterLink
                    v-for="notification in notifications"
                    :key="notification.id"
                    :to="notification.path"
                    class="block border-b border-slate-100 px-4 py-3 transition last:border-b-0 hover:bg-slate-50"
                    @click="openNotification(notification)"
                  >
                    <p class="text-sm font-semibold text-slate-950">{{ notification.title }}</p>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ notification.detail }}</p>
                  </RouterLink>
                </div>

                <div v-else class="px-4 py-6 text-center text-sm text-slate-500">
                  Aucune notification.
                </div>

                <RouterLink
                  to="/pickup-requests"
                  class="block border-t border-slate-100 px-4 py-3 text-center text-sm font-bold text-cyan-800 hover:bg-cyan-50"
                  @click="notificationsOpen = false"
                >
                  Voir toutes les demandes
                </RouterLink>
              </div>
            </div>

            <RouterLink
              v-for="action in visibleQuickActions"
              :key="action.path"
              :to="action.path"
              class="hidden items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-[#073b55] md:inline-flex"
            >
              <span>{{ action.label }}</span>
              <span
                v-if="action.superAdminOnly"
                class="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
              >
                Super
              </span>
            </RouterLink>
          </div>
        </div>
      </header>

      <main class="min-h-[calc(100vh-5rem)] min-w-0 max-w-full overflow-x-hidden px-3 py-4 pb-24 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:pb-8">
        <RouterView />
      </main>
    </div>

    <nav class="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-1 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-[0_18px_55px_rgba(7,59,85,0.24)] backdrop-blur-xl lg:hidden">
      <RouterLink
        v-for="item in mobileNavItems"
        :key="`mobile-${item.path}`"
        :to="item.path"
        class="flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold"
        :class="isActive(item.path) ? 'bg-[#073b55] text-white' : 'text-slate-500'"
      >
        <span class="text-[11px]">{{ item.icon }}</span>
        <span class="w-full truncate text-center">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
