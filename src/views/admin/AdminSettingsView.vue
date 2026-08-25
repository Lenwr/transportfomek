<script setup>
import { computed, onMounted, ref } from "vue"
import { collection } from "firebase/firestore"
import { useCollection } from "vuefire"
import { getAuth } from "firebase/auth"
import { toast } from "vue3-toastify"
import { db } from "../../components/firebaseConfig"

const FUNCTIONS_BASE = String(import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "")

const permissionOptions = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clientFollowup", label: "Suivi client" },
  { key: "liste", label: "Enlevements" },
  { key: "form", label: "Nouvel enlevement" },
  { key: "pickupRequests", label: "Demandes clients" },
  { key: "pickupRequestScan", label: "Scan demande" },
  { key: "deliveryScan", label: "Scan livraison" },
  { key: "recording", label: "Chargements" },
  { key: "billing", label: "Factures & devis" },
  { key: "customers", label: "Clients" },
]

const roleLabels = {
  admin: "Admin",
  superAdmin: "SuperAdmin",
  manager: "Manager",
  staff: "Equipe",
  client: "Client portail",
}

const usersSnap = useCollection(collection(db, "users"))
const clientsSnap = useCollection(collection(db, "clients"))

const activeTab = ref("internal")
const saving = ref(false)
const userSearch = ref("")
const clientSearch = ref("")
const generatedAccess = ref(null)
const applicationUsers = ref([])
const loadingUsers = ref(false)

const newUser = ref({
  email: "",
  password: "",
  displayName: "",
  role: "admin",
  permissions: [],
  disabled: false,
})

const internalUsers = computed(() =>
  (applicationUsers.value.length ? applicationUsers.value : usersSnap.value || [])
    .filter((item) => item.role !== "client" && item.accessType !== "client")
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || ""), "fr"))
)

const portalUsers = computed(() =>
  (applicationUsers.value.length ? applicationUsers.value : usersSnap.value || [])
    .filter((item) => item.role === "client" || item.accessType === "client")
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || ""), "fr"))
)

const filteredInternalUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase()
  if (!q) return internalUsers.value
  return internalUsers.value.filter((item) =>
    [item.email, item.displayName, item.role].filter(Boolean).join(" ").toLowerCase().includes(q)
  )
})

const filteredClients = computed(() => {
  const q = clientSearch.value.trim().toLowerCase()
  const clients = [...(clientsSnap.value || [])].sort((a, b) => clientName(a).localeCompare(clientName(b), "fr"))
  if (!q) return clients
  return clients.filter((item) =>
    [item.email, item.displayName, item.nom, item.prenom, item.phone, item.telephone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  )
})

function roleLabel(role = "") {
  return roleLabels[role] || role || "Admin"
}

function clientName(item = {}) {
  return item.displayName || [item.prenom, item.nom].filter(Boolean).join(" ").trim() || item.email || "Client"
}

function allPermissionKeys() {
  return permissionOptions.filter((item) => item.defaultEnabled !== false).map((item) => item.key)
}

function defaultPermissionsFor(role) {
  if (role === "superAdmin") return []
  return allPermissionKeys()
}

function onNewRoleChange() {
  newUser.value.permissions = defaultPermissionsFor(newUser.value.role)
}

function toggleNewPermission(key) {
  const current = new Set(newUser.value.permissions)
  current.has(key) ? current.delete(key) : current.add(key)
  newUser.value.permissions = [...current]
}

function toggleUserPermission(user, key) {
  const current = new Set(Array.isArray(user.permissions) ? user.permissions : [])
  current.has(key) ? current.delete(key) : current.add(key)
  user.permissions = [...current]
}

async function postFunction(name, payload) {
  const token = await getAuth().currentUser?.getIdToken(true)
  if (!token) throw new Error("Session expirée.")

  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Action impossible.")
  }
  return data
}

async function refreshApplicationUsers() {
  loadingUsers.value = true
  try {
    const data = await postFunction("listApplicationUsers", {})
    applicationUsers.value = Array.isArray(data.users) ? data.users : []
  } catch (error) {
    toast(error.message || "Impossible de charger les utilisateurs Auth.", { type: "error" })
  } finally {
    loadingUsers.value = false
  }
}

async function createInternalAccess() {
  saving.value = true
  generatedAccess.value = null
  try {
    const data = await postFunction("createInternalAccess", newUser.value)
    generatedAccess.value = data
    newUser.value = {
      email: "",
      password: "",
      displayName: "",
      role: "admin",
      permissions: [],
      disabled: false,
    }
    toast("Accès interne créé.", { type: "success", autoClose: 1400 })
    await refreshApplicationUsers()
  } catch (error) {
    toast(error.message || "Erreur création accès.", { type: "error" })
  } finally {
    saving.value = false
  }
}

async function updateAccess(user) {
  saving.value = true
  try {
    await postFunction("updateUserAccess", {
      uid: user.id,
      role: user.role || "admin",
      displayName: user.displayName || "",
      disabled: Boolean(user.disabled),
      permissions: user.role === "superAdmin" ? [] : user.permissions || [],
    })
    toast("Accès mis à jour.", { type: "success", autoClose: 1200 })
    await refreshApplicationUsers()
  } catch (error) {
    toast(error.message || "Erreur mise à jour.", { type: "error" })
  } finally {
    saving.value = false
  }
}

async function deleteClient(client) {
  if (!client?.id) return
  if (!window.confirm(`Supprimer le client ${clientName(client)} et son accès portail ?`)) return

  saving.value = true
  try {
    await postFunction("deleteClientAccount", {
      clientId: client.id,
      deleteAuth: true,
      deleteEnlevements: false,
    })
    toast("Client supprimé.", { type: "success", autoClose: 1400 })
  } catch (error) {
    toast(error.message || "Erreur suppression client.", { type: "error" })
  } finally {
    saving.value = false
  }
}

onMounted(refreshApplicationUsers)
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">SuperAdmin</p>
      <h2 class="mt-2 text-2xl font-bold text-slate-950">Paramètres</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Crée les accès internes, limite les pages par utilisateur et gère les comptes portail client.
      </p>
    </div>

    <div class="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <button
        class="rounded-lg px-4 py-2 text-sm font-bold"
        :class="activeTab === 'internal' ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-50'"
        type="button"
        @click="activeTab = 'internal'"
      >
        Accès internes
      </button>
      <button
        class="rounded-lg px-4 py-2 text-sm font-bold"
        :class="activeTab === 'portal' ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-50'"
        type="button"
        @click="activeTab = 'portal'"
      >
        Portail client
      </button>
    </div>

    <div v-if="activeTab === 'internal'" class="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" @submit.prevent="createInternalAccess">
        <h3 class="text-lg font-bold text-slate-950">Créer un accès</h3>
        <div class="mt-5 space-y-4">
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Email</span>
            <input v-model="newUser.email" type="email" required class="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Nom affiché</span>
            <input v-model="newUser.displayName" class="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Mot de passe temporaire</span>
            <input v-model="newUser.password" type="text" class="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Auto si vide" />
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-slate-700">Rôle</span>
            <select v-model="newUser.role" class="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" @change="onNewRoleChange">
              <option value="admin">Admin</option>
              <option value="chauffeur">Chauffeur</option>
              <option value="manager">Manager</option>
              <option value="superAdmin">SuperAdmin</option>
            </select>
          </label>

          <div v-if="newUser.role !== 'superAdmin'" class="rounded-lg bg-slate-50 p-3">
            <p class="text-sm font-bold text-slate-700">Pages autorisées</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <label v-for="permission in permissionOptions" :key="permission.key" class="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" class="checkbox checkbox-sm" :checked="newUser.permissions.includes(permission.key)" @change="toggleNewPermission(permission.key)" />
                <span>{{ permission.label }}</span>
              </label>
            </div>
          </div>

          <button class="w-full rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60" :disabled="saving">
            {{ saving ? "Création..." : "Créer l'accès" }}
          </button>

          <div v-if="generatedAccess" class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            <p class="font-bold">Identifiants générés</p>
            <p>Email : {{ generatedAccess.email }}</p>
            <p>Mot de passe : <span class="font-mono font-bold">{{ generatedAccess.temporaryPassword }}</span></p>
          </div>
        </div>
      </form>

      <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-200 p-5">
          <h3 class="text-lg font-bold text-slate-950">Utilisateurs internes</h3>
          <p class="mt-1 text-sm text-slate-500">
            {{ loadingUsers ? "Chargement des comptes Auth..." : `${internalUsers.length} compte(s) interne(s)` }}
          </p>
          <input v-model="userSearch" class="mt-4 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Rechercher un email, nom ou rôle" />
        </div>

        <div class="divide-y divide-slate-100">
          <article v-for="user in filteredInternalUsers" :key="user.id" class="p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <p class="break-all font-bold text-slate-950">{{ user.email || user.id }}</p>
                <p v-if="user.authOnly" class="mt-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                  Ancien compte sans profil Firestore
                </p>
                <input v-model="user.displayName" class="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm lg:w-80" placeholder="Nom affiché" />
              </div>
              <div class="flex flex-wrap gap-2">
                <select v-model="user.role" class="h-10 rounded-lg border border-slate-300 px-3 text-sm">
                  <option value="admin">Admin</option>
                  <option value="chauffeur">Chauffeur</option>
                  <option value="manager">Manager</option>
                  <option value="superAdmin">SuperAdmin</option>
                </select>
                <label class="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold">
                  <input v-model="user.disabled" type="checkbox" class="checkbox checkbox-sm" />
                  Désactivé
                </label>
                <button class="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" type="button" :disabled="saving" @click="updateAccess(user)">
                  Enregistrer
                </button>
              </div>
            </div>

            <div v-if="user.role !== 'superAdmin'" class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label v-for="permission in permissionOptions" :key="permission.key" class="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" class="checkbox checkbox-sm" :checked="(user.permissions || []).includes(permission.key)" @change="toggleUserPermission(user, permission.key)" />
                <span>{{ permission.label }}</span>
              </label>
            </div>
            <p v-else class="mt-4 text-sm font-semibold text-amber-700">Accès complet superAdmin.</p>
          </article>
          <p v-if="!filteredInternalUsers.length" class="p-8 text-center text-sm text-slate-500">Aucun utilisateur interne trouvé.</p>
        </div>
      </section>
    </div>

    <section v-else class="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-200 p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 class="text-lg font-bold text-slate-950">Clients portail</h3>
            <p class="mt-1 text-sm text-slate-500">{{ portalUsers.length }} accès portail dans users, {{ clientsSnap.length || 0 }} clients enregistrés.</p>
          </div>
          <input v-model="clientSearch" class="h-11 rounded-lg border border-slate-300 px-3 text-sm lg:w-96" placeholder="Rechercher client, email, téléphone" />
        </div>
      </div>

      <div class="divide-y divide-slate-100">
        <article v-for="client in filteredClients" :key="client.id" class="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <p class="font-bold text-slate-950">{{ clientName(client) }}</p>
            <p class="mt-1 break-all text-sm text-slate-500">{{ client.email || "Email non renseigné" }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ client.phone || client.telephone || "-" }}</p>
            <p class="mt-1 text-xs font-semibold text-slate-400">ID : {{ client.id }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RouterLink class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-cyan-200 hover:text-cyan-800" :to="`/customersDetails/${client.id}`">
              Ouvrir
            </RouterLink>
            <button class="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60" type="button" :disabled="saving" @click="deleteClient(client)">
              Supprimer client
            </button>
          </div>
        </article>
        <p v-if="!filteredClients.length" class="p-8 text-center text-sm text-slate-500">Aucun client trouvé.</p>
      </div>
    </section>
  </section>
</template>
