<script setup>
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../components/firebaseConfig"
import Form from "./form.vue"

const route = useRoute()
const inviteLoading = ref(false)
const inviteData = ref(null)
const inviteError = ref("")

function getInviteFromUrl() {
  if (typeof window === "undefined") return ""
  const href = window.location.href || ""
  const match = href.match(/[?&]invite=([^&#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ""
}

const inviteId = computed(() => String(route.query.invite || getInviteFromUrl() || "").trim())

const clientData = computed(() => {
  const invite = inviteData.value || {}
  const fullName = String(invite.clientName || route.query.nom || route.query.name || "").trim()
  const [prenom = "", ...rest] = fullName.split(/\s+/)

  return {
    displayName: fullName,
    prenom,
    nom: rest.join(" "),
    telephone: String(invite.clientPhone || route.query.phone || route.query.telephone || "").trim(),
    adresse: String(invite.address || route.query.adresse || route.query.address || "").trim(),
  }
})

const inviteAlreadySubmitted = computed(() =>
  inviteData.value && String(inviteData.value.status || "").toLowerCase() === "submitted"
)
const inviteExpired = computed(() => {
  const raw = inviteData.value?.expireAt
  if (!raw) return false
  const date = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isFinite(date.getTime()) && Date.now() > date.getTime()
})
const canShowForm = computed(() =>
  !inviteLoading.value &&
  !inviteError.value &&
  !inviteAlreadySubmitted.value &&
  !inviteExpired.value
)

onMounted(async () => {
  if (!inviteId.value) return

  inviteLoading.value = true
  try {
    const snap = await getDoc(doc(db, "pickupFormInvites", inviteId.value))
    if (!snap.exists()) {
      inviteError.value = "Ce lien de formulaire est introuvable ou a expiré."
      return
    }
    inviteData.value = { id: snap.id, ...snap.data() }
  } catch (error) {
    console.error("Erreur chargement invitation", error)
    inviteError.value = error?.code === "permission-denied"
      ? "Impossible de vérifier ce lien : les règles Firestore doivent être déployées."
      : "Impossible de vérifier ce lien pour le moment."
  } finally {
    inviteLoading.value = false
  }
})
</script>

<template>
  <main class="min-h-screen bg-[#f6f8fb] px-4 py-5 text-slate-900">
    <section class="mx-auto max-w-5xl">
      <div v-if="inviteLoading" class="rounded-lg border border-cyan-100 bg-white p-6 shadow-sm">
        <div class="operation-progress">
          <div class="operation-progress__label">
            <span>Vérification du lien...</span>
            <span>Patiente...</span>
          </div>
          <div class="operation-progress__track">
            <div class="operation-progress__bar"></div>
          </div>
        </div>
      </div>

      <div v-else-if="inviteError || inviteAlreadySubmitted || inviteExpired" class="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Transport Fomek</p>
        <h1 class="mt-3 text-2xl font-bold text-slate-950">
          {{ inviteAlreadySubmitted ? "Formulaire déjà envoyé" : inviteExpired ? "Lien expiré" : "Lien indisponible" }}
        </h1>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          {{ inviteAlreadySubmitted
            ? "Votre demande a déjà été transmise. Pour modifier une information, contactez Transport Fomek."
            : inviteExpired
              ? "Ce lien n'est plus disponible. Contactez Transport Fomek pour recevoir un nouveau formulaire."
            : inviteError }}
        </p>
      </div>

      <Form
        v-if="canShowForm"
        :expediteur-data="clientData"
        :pickup-invite-id="inviteId"
        public-client-mode
      />
    </section>
  </main>
</template>
