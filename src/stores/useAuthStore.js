import { defineStore } from "pinia";
import router from "../router";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../components/firebaseConfig.js";

function resolveUserAccess(userData = {}, claims = {}) {
  const explicitRole = userData?.role || claims?.role || "";
  const isSuperAdmin =
    userData?.superAdmin === true ||
    claims?.superAdmin === true ||
    explicitRole === "superAdmin";
  const role = isSuperAdmin ? "superAdmin" : explicitRole;
  const clientId = userData?.clientId || claims?.clientId || "";
  const isInternal = isSuperAdmin || userData?.accessType === "internal" || (!!role && role !== "client");

  return { role, clientId, isInternal };
}

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
  ];
  return routesByPermission.find(([permission]) => permissions.includes(permission))?.[1] || "login";
}

export const useAuthStore = defineStore({
  id: "storeAuth",
  state: () => ({
    email: "",
    password: "",
    user: null,
    role: "",
    clientId: "",
    permissions: [],
    claims: {},
    initialized: false, // ✅ pour savoir si firebase a fini le check
  }),

  getters: {
    isLoggedIn: (state) => !!state.user,
    isSuperAdmin: (state) =>
      state.role === "superAdmin" ||
      state.claims?.role === "superAdmin" ||
      state.claims?.superAdmin === true,
    hasPermission: (state) => (permission) =>
      state.role === "superAdmin" ||
      state.claims?.role === "superAdmin" ||
      state.claims?.superAdmin === true ||
      state.permissions.includes(permission),
  },

  actions: {
    async login() {
      try {
        const res = await signInWithEmailAndPassword(auth, this.email, this.password);
        if (res?.user) {
          const token = await res.user.getIdTokenResult(true);
          const userSnap = await getDoc(doc(db, "users", res.user.uid));
          const userData = userSnap.exists() ? userSnap.data() : {};
          const { role, isInternal } = resolveUserAccess(userData, token?.claims || {});

          if (isInternal) {
            const permissions = Array.isArray(userData?.permissions) ? userData.permissions : [];
            await router.replace({ name: role === "superAdmin" ? "home" : firstAllowedRoute(permissions) });
          } else {
            await signOut(auth);
            throw new Error(
              role === "client"
                ? "Ce compte appartient au portail client. Utilise le portail client."
                : "Compte non autorisé sur l'application de gestion."
            );
          }
        }
      } catch (error) {
        console.log(error);
        throw error;
      }
    },

    async logout() {
      await signOut(auth);
      this.email = "";
      this.password = "";
      this.user = null;
      this.clientId = "";
      this.permissions = [];
      // ✅ ok de rediriger ici
      await router.replace({ name: "login" });
    },

    init() {
      // ✅ IMPORTANT: init ne doit pas router.push/replace !
      if (this.initialized) return;

      onAuthStateChanged(auth, async (user) => {
        if (user) {
          let role = "";
          let clientId = "";
          let claims = {};
          this.permissions = [];

          try {
            const token = await user.getIdTokenResult();
            claims = token?.claims || {};

            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (userSnap.exists()) {
              const userData = userSnap.data() || {};
              const access = resolveUserAccess(userData, claims);
              role = access.role;
              clientId = access.clientId;
              this.permissions = Array.isArray(userData?.permissions) ? userData.permissions : [];
            }
          } catch (error) {
            console.warn("Impossible de charger le rôle utilisateur", error);
          }

          this.user = {
            id: user.uid,
            email: user.email,
            clientId: clientId || claims?.clientId || "",
          };
          this.role = role || resolveUserAccess({}, claims).role || "";
          this.clientId = clientId || claims?.clientId || "";
          this.claims = claims;
        } else {
          this.user = null;
          this.role = "";
          this.clientId = "";
          this.permissions = [];
          this.claims = {};
        }
        this.initialized = true;
      });
    },
  },
});
