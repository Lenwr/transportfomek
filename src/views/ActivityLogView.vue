<script setup>
import { computed, ref } from "vue"
import { collection, orderBy, query } from "firebase/firestore"
import { useCollection } from "vuefire"
import { db } from "../components/firebaseConfig"

const logsSnap = useCollection(query(collection(db, "activityLogs"), orderBy("createdAt", "desc")))
const usersSnap = useCollection(collection(db, "users"))
const search = ref("")

function formatDate(value) {
  if (!value) return "-"
  const date = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

const logs = computed(() => logsSnap.value || [])
const usersById = computed(() => {
  const map = new Map()
  for (const user of usersSnap.value || []) {
    if (user?.id) map.set(user.id, user)
  }
  return map
})

const usersByEmail = computed(() => {
  const map = new Map()
  for (const user of usersSnap.value || []) {
    const email = String(user?.email || "").trim().toLowerCase()
    if (email) map.set(email, user)
  }
  return map
})
const filteredLogs = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return logs.value.slice(0, 80)
  return logs.value
    .filter((item) =>
      [item.action, item.targetType, item.targetId, item.label, actorLabel(item)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
    .slice(0, 80)
})

function actionLabel(action = "") {
  const labels = {
    pickup_request_submitted: "Formulaire client soumis",
    pickup_form_link_sent: "Lien formulaire envoyé",
    direct_message_sent: "Message direct envoyé",
    enlevement_created: "Enlèvement créé",
    enlevement_updated: "Enlèvement modifié",
  }
  if (labels[action]) return labels[action]

  const match = String(action || "").match(/^(.+)_(created|updated|deleted)$/)
  if (!match) return action || "Action"

  const [, target, verb] = match
  const verbs = {
    created: "créé",
    updated: "modifié",
    deleted: "supprimé",
  }
  return `${target} ${verbs[verb] || verb}`
}

function changedFields(item) {
  return Array.isArray(item?.details?.changedFields) ? item.details.changedFields.slice(0, 8) : []
}

function actorLabel(item = {}) {
  const directName =
    item.userName ||
    item.actorName ||
    item.createdByName ||
    item.updatedByName ||
    item.deletedByName ||
    item.details?.userName ||
    item.details?.actorName

  if (directName) return directName

  const uid =
    item.userId ||
    item.actorUid ||
    item.createdById ||
    item.updatedById ||
    item.deletedById ||
    item.createdBy ||
    item.updatedBy ||
    item.deletedBy
  const user = uid ? usersById.value.get(uid) : null

  if (user?.displayName) return user.displayName

  const directEmail =
    item.userEmail ||
    item.actorEmail ||
    item.createdByEmail ||
    item.updatedByEmail ||
    item.deletedByEmail ||
    item.details?.userEmail ||
    item.details?.actorEmail

  const emailUser = directEmail ? usersByEmail.value.get(String(directEmail).trim().toLowerCase()) : null
  if (emailUser?.displayName) return emailUser.displayName
  if (directEmail) return directEmail
  return user?.email || "Système / action automatique"
}
</script>

<template>
  <section class="page-shell">
    <div class="page-hero p-5 sm:p-6">
      <p class="eyebrow">Audit</p>
      <h2 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Journal d’activité</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Suivi des actions importantes : envois, soumissions, créations et modifications.
      </p>
      <input
        v-model="search"
        class="mt-4 h-11 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        placeholder="Rechercher action, dossier, utilisateur..."
      />
    </div>

    <section class="surface-card overflow-hidden">
      <div class="section-header">
        <div>
          <h3 class="font-bold text-slate-950">Actions récentes</h3>
          <p class="text-sm text-slate-500">{{ filteredLogs.length }} entrée(s) affichée(s)</p>
        </div>
      </div>

      <div class="divide-y divide-slate-100">
        <article v-for="item in filteredLogs" :key="item.id" class="p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="font-bold text-slate-950">{{ actionLabel(item.action) }}</p>
              <p class="mt-1 text-sm text-slate-500">
                {{ item.label || item.targetId || "-" }}
                <span v-if="item.targetType"> · {{ item.targetType }}</span>
              </p>
              <p class="mt-1 text-xs text-slate-400">
                {{ actorLabel(item) }}
              </p>
              <div v-if="changedFields(item).length" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="field in changedFields(item)"
                  :key="field"
                  class="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500"
                >
                  {{ field }}
                </span>
              </div>
            </div>
            <span class="text-sm font-semibold text-slate-500">{{ formatDate(item.createdAt) }}</span>
          </div>
        </article>

        <p v-if="!filteredLogs.length" class="p-8 text-center text-sm text-slate-500">
          Aucune activité enregistrée.
        </p>
      </div>
    </section>
  </section>
</template>
