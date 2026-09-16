// ✅ src/router/index.js
import { createRouter, createWebHashHistory } from "vue-router"
import { ref } from "vue"
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"
import { db } from "../components/firebaseConfig.js"

// Views
import HomeView from "../views/HomeView.vue"
import Form from "../views/form.vue"
import ListeView from "../views/listeView.vue"
import ListeDetailsView from "../views/listeDetailsView.vue"
import SoumissionFormulaire from "../views/soumissionFormulaire.vue"
import Scan from "../views/scan.vue"
import CustomersView from "../views/customersView.vue"
import CustomersFormView from "../views/customersFormView.vue"
import CustomersDetailsView from "../views/customersDetailsView.vue"
import SelectCustomersView from "../views/selectCustomersView.vue"
import LoadingPackagesRecording from "../views/loadingPackagesRecording.vue"
import ChargementsDetails from "../views/chargementsDetails.vue"
import SignaturePad from "../views/signaturePad.vue"
import VolumeCalculator from "../views/volumeCalculator.vue"
import EnlevementsStats from "../views/EnlevementsStats.vue"
import ValidateRequestView from "../views/ValidateRequestView.vue"
import PickupRequestsListView from "../views/PickupRequestsListView.vue"
import PricingAdmin from "../views/admin/PricingAdmin.vue"
import AdminSettingsView from "../views/admin/AdminSettingsView.vue"
import Tenant from "../views/tenant.vue"
import LoginFormView from "../views/loginFormView.vue"
import DeliveryScanView from "../views/DeliveryScanView.vue"
import BillingDocumentsView from "../views/BillingDocumentsView.vue"
import ClientPickupFormView from "../views/ClientPickupFormView.vue"
import ClientFollowupView from "../views/ClientFollowupView.vue"
import ActivityLogView from "../views/ActivityLogView.vue"

export const routeLoading = ref(false)

// Components
import GeneratorBarCode from "../components/GeneratorBarCode.vue"

const router = createRouter({
  history: createWebHashHistory(),
  linkActiveClass: "classActive",
  routes: [
    // ✅ PUBLIC
    { path: "/login", name: "login", component: LoginFormView, meta: { authNeeded: false } },
    { path: "/requests", name: "requests", component: Tenant, meta: { authNeeded: false } },
    { path: "/client/enlevement", name: "clientPickupForm", component: ClientPickupFormView, meta: { authNeeded: false } },
    { path: "/soumission", name: "soumission", component: SoumissionFormulaire, meta: { authNeeded: false } },

    // ✅ FORMULAIRE CHAUFFEUR (PUBLIC)
    { path: "/form", name: "form", component: Form, meta: { authNeeded: false } },

    // ✅ PROTECTED
    { path: "/", name: "home", component: HomeView, meta: { authNeeded: true, permission: "dashboard" } },
    { path: "/activity-log", name: "activityLog", component: ActivityLogView, meta: { authNeeded: true, superAdminOnly: true } },
    { path: "/client-followup", name: "clientFollowup", component: ClientFollowupView, meta: { authNeeded: true, permission: "clientFollowup" } },
    { path: "/pickup-requests", name: "pickupRequests", component: PickupRequestsListView, meta: { authNeeded: true, permission: "pickupRequests" } },
    { path: "/stats-enlevements", name: "EnlevementsStats", component: EnlevementsStats, meta: { authNeeded: true, permission: "liste" } },

    { path: "/liste", name: "liste", component: ListeView, meta: { authNeeded: true, permission: "liste" } },
    { path: "/liste/:id", name: "listeDetails", component: ListeDetailsView, meta: { authNeeded: true, permission: "liste" } },

    { path: "/pricing", name: "pricing", component: PricingAdmin, meta: { authNeeded: true, superAdminOnly: true } },
    { path: "/settings", name: "settings", component: AdminSettingsView, meta: { authNeeded: true, superAdminOnly: true } },

    { path: "/BarCode", name: "barcode", component: GeneratorBarCode, meta: { authNeeded: true, permission: "recording" } },

    { path: "/scan", name: "scan", component: Scan, meta: { authNeeded: true, permission: "recording" } },
    { path: "/delivery-scan", name: "deliveryScan", component: DeliveryScanView, meta: { authNeeded: true, permission: "deliveryScan" } },

    { path: "/customersForm", name: "customersForm", component: CustomersFormView, meta: { authNeeded: true, superAdminOnly: true } },
    { path: "/customers", name: "customers", component: CustomersView, meta: { authNeeded: true, permission: "customers" } },
    { path: "/customersDetails/:id", name: "customersDetails", component: CustomersDetailsView, meta: { authNeeded: true, permission: "customers" } },
    { path: "/selectForm", name: "selectForm", component: SelectCustomersView, meta: { authNeeded: true, permission: "customers" } },

    { path: "/recording", name: "recording", component: LoadingPackagesRecording, meta: { authNeeded: true, permission: "recording" } },
    { path: "/chargementsDetails/:id", name: "chargementsDetails", component: ChargementsDetails, meta: { authNeeded: true, permission: "recording" } },

    { path: "/validate-request/:id", name: "validateRequest", component: ValidateRequestView, meta: { authNeeded: true, permission: "pickupRequests" } },
    { path: "/sign/:id", name: "sign", component: SignaturePad, meta: { authNeeded: true, permission: "deliveryScan" } },
    { path: "/calculator", name: "calculator", component: VolumeCalculator, meta: { authNeeded: true, permission: "billing" } },

    { path: "/billing-documents", name: "billingDocuments", component: BillingDocumentsView, meta: { authNeeded: true, permission: "billing" } },

    // ✅ fallback
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
})

function firstAllowedRoute(permissions = []) {
  const routesByPermission = [
    ["dashboard", "home"],
    ["recording", "recording"],
    ["liste", "liste"],
    ["clientFollowup", "clientFollowup"],
    ["pickupRequests", "pickupRequests"],
    ["deliveryScan", "deliveryScan"],
    ["customers", "customers"],
    ["billing", "billingDocuments"],
  ]
  return routesByPermission.find(([permission]) => permissions.includes(permission))?.[1] || "login"
}

/* =========================
   Auth guard (fiable)
========================= */
let authReadyPromise

function waitForAuthReady() {
  if (authReadyPromise) return authReadyPromise

  authReadyPromise = new Promise((resolve) => {
    const auth = getAuth()
    const unsub = onAuthStateChanged(auth, () => {
      unsub()
      resolve(true)
    })
  })

  return authReadyPromise
}

router.beforeEach(async (to, from, next) => {
  routeLoading.value = true
  // pages publiques
  if (to.meta?.authNeeded === false) return next()

  // attendre auth
  await waitForAuthReady()

  const auth = getAuth()
  const user = auth.currentUser

  if (to.meta?.authNeeded === true && !user) {
    if (to.path !== "/login") {
      toast("Veuillez vous connecter pour accéder à cette page.", {
        theme: "auto",
        type: "warning",
        autoClose: 1200,
      })
    }
    return next({ path: "/login", query: { redirect: to.fullPath } })
  }

  if (user) {
    try {
      const token = await user.getIdTokenResult()
      const userSnap = await getDoc(doc(db, "users", user.uid))
      const userData = userSnap.exists() ? userSnap.data() : {}
      const explicitRole = userData?.role || token?.claims?.role || ""
      const clientId = userData?.clientId || token?.claims?.clientId || ""
      const isSuperAdmin =
        explicitRole === "superAdmin" ||
        token?.claims?.role === "superAdmin" ||
        token?.claims?.superAdmin === true ||
        userData?.superAdmin === true
      const resolvedRole = isSuperAdmin ? "superAdmin" : explicitRole || "admin"
      const isInternalUser = isSuperAdmin || userData?.accessType === "internal" || (!!resolvedRole && resolvedRole !== "client")
      const permissions = Array.isArray(userData?.permissions) ? userData.permissions : []

      if (userData?.disabled === true) {
        await signOut(auth)
        toast("Ce compte est désactivé.", {
          theme: "auto",
          type: "error",
          autoClose: 1800,
        })
        return next({ path: "/login" })
      }

      if (resolvedRole === "client") {
        await signOut(auth)
        toast("Compte portail client non autorisé sur l'application de gestion.", {
          theme: "auto",
          type: "error",
          autoClose: 1800,
        })
        return next({ path: "/login" })
      }

      if (to.meta?.authNeeded === true && !isInternalUser && resolvedRole !== "client") {
        await signOut(auth)
        toast("Compte non autorisé sur l'application de gestion.", {
          theme: "auto",
          type: "error",
          autoClose: 1800,
        })
        return next({ path: "/login" })
      }

      if (to.meta?.superAdminOnly && !isSuperAdmin) {
        toast("Accès réservé au super admin.", {
          theme: "auto",
          type: "warning",
          autoClose: 1200,
        })
        return next({ name: firstAllowedRoute(permissions) })
      }

      if (
        to.meta?.permission &&
        !isSuperAdmin &&
        !permissions.includes(to.meta.permission)
      ) {
        toast("Accès non autorisé pour ce compte.", {
          theme: "auto",
          type: "warning",
          autoClose: 1400,
        })
        return next({ name: firstAllowedRoute(permissions) })
      }
    } catch (error) {
      console.warn("Impossible de vérifier le rôle utilisateur", error)
    }
  }

  return next()
})

router.afterEach(() => {
  window.setTimeout(() => {
    routeLoading.value = false
  }, 180)
})

router.onError(() => {
  routeLoading.value = false
})

export default router
