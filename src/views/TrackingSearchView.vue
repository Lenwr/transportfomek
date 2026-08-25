<script setup>
import { computed, reactive } from "vue";
import { storeToRefs } from "pinia";
import { useTrackingStore } from "../stores/trackingStore";

const trackingStore = useTrackingStore();
const { loading, error, result, events } = storeToRefs(trackingStore);

const form = reactive({
  shippingLine: "MSC",
  carrierBookingReference: "",
  transportDocumentReference: "",
  equipmentReference: ""
});

const shippingLines = [
  { value: "MSC", label: "MSC" },
  { value: "MAERSK", label: "Maersk" },
  { value: "CMA_CGM", label: "CMA CGM" },
  { value: "HAPAG_LLOYD", label: "Hapag-Lloyd" },
  { value: "ONE", label: "ONE" },
  { value: "EVERGREEN", label: "Evergreen" },
  { value: "COSCO", label: "COSCO" },
  { value: "HMM", label: "HMM" },
  { value: "ZIM", label: "ZIM" },
  { value: "YANG_MING", label: "Yang Ming" },
  { value: "PIL", label: "PIL" }
];

const hasAtLeastOneReference = computed(() => {
  return Boolean(
    form.carrierBookingReference.trim() ||
      form.transportDocumentReference.trim() ||
      form.equipmentReference.trim()
  );
});

const lastEvent = computed(() => {
  if (!events.value?.length) return null;
  return [...events.value].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
});

async function onSearch() {
  if (!hasAtLeastOneReference.value || loading.value) return;

  await trackingStore.searchTracking({
    shippingLine: form.shippingLine,
    carrierBookingReference: form.carrierBookingReference.trim() || undefined,
    transportDocumentReference: form.transportDocumentReference.trim() || undefined,
    equipmentReference: form.equipmentReference.trim() || undefined
  });
}

async function onFollow() {
  await trackingStore.followCurrentResult();
}

function resetForm() {
  form.shippingLine = "MSC";
  form.carrierBookingReference = "";
  form.transportDocumentReference = "";
  form.equipmentReference = "";
  trackingStore.clearSearch();
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getStatusBadgeClass(classifier) {
  if (classifier === "ACT") return "badge badge--success";
  if (classifier === "EST") return "badge badge--warning";
  return "badge";
}

function getStatusLabel(classifier) {
  if (classifier === "ACT") return "Réel";
  if (classifier === "EST") return "Estimé";
  return classifier || "Inconnu";
}

function getEventIcon(code) {
  const map = {
    GTOT: "📦",
    GTIN: "🏗️",
    LOAD: "🚢",
    DISC: "📤",
    DEPA: "🛫",
    ARRI: "📍"
  };

  return map[code] || "•";
}
</script>

<template>
  <section class="tracking-page">
    <div class="tracking-page__header">
      <div>
        <p class="eyebrow">Tracking conteneur</p>
        <h1>Recherche de conteneur</h1>
        <p class="subtitle">
          Recherche un booking, un BL ou un numéro de conteneur depuis l'espace admin.
        </p>
      </div>

      <button class="ghost-btn" type="button" @click="resetForm">
        Réinitialiser
      </button>
    </div>

    <div class="search-card">
      <div class="search-grid">
        <label class="field">
          <span>Compagnie maritime</span>
          <select v-model="form.shippingLine">
            <option
              v-for="line in shippingLines"
              :key="line.value"
              :value="line.value"
            >
              {{ line.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Booking</span>
          <input
            v-model="form.carrierBookingReference"
            type="text"
            placeholder="Ex: MSNU9294626"
            @keyup.enter="onSearch"
          />
        </label>

        <label class="field">
          <span>BL / document transport</span>
          <input
            v-model="form.transportDocumentReference"
            type="text"
            placeholder="Ex: MEDUXX123456"
            @keyup.enter="onSearch"
          />
        </label>

        <label class="field">
          <span>Numéro conteneur</span>
          <input
            v-model="form.equipmentReference"
            type="text"
            placeholder="Ex: MSCU1234567"
            @keyup.enter="onSearch"
          />
        </label>
      </div>

      <div class="search-actions">
        <button
          class="primary-btn"
          type="button"
          :disabled="loading || !hasAtLeastOneReference"
          @click="onSearch"
        >
          {{ loading ? "Recherche..." : "Rechercher" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert--error">
      {{ error }}
    </div>

    <div v-if="result" class="content-grid">
      <div class="summary-card">
        <div class="summary-card__top">
          <div>
            <p class="card-label">Dernier statut</p>
            <h2>{{ result.lastStatus || lastEvent?.label || "Aucun statut" }}</h2>
          </div>

          <span
            v-if="result.lastClassifier || lastEvent?.classifier"
            :class="getStatusBadgeClass(result.lastClassifier || lastEvent?.classifier)"
          >
            {{ getStatusLabel(result.lastClassifier || lastEvent?.classifier) }}
          </span>
        </div>

        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-item__label">Compagnie</span>
            <strong>{{ result.shippingLine || form.shippingLine || "-" }}</strong>
          </div>

          <div class="summary-item">
            <span class="summary-item__label">Booking</span>
            <strong>{{ result.reference || form.carrierBookingReference || "-" }}</strong>
          </div>

          <div class="summary-item">
            <span class="summary-item__label">Conteneur</span>
            <strong>{{ result.container || "-" }}</strong>
          </div>

          <div
            v-if="result.associatedContainers?.length"
            class="summary-item summary-item--wide"
          >
            <span class="summary-item__label">Conteneurs du BL</span>
            <strong>{{ result.associatedContainers.join(", ") }}</strong>
          </div>

          <div class="summary-item">
            <span class="summary-item__label">Lieu</span>
            <strong>{{ result.lastLocation || "-" }}</strong>
          </div>

          <div class="summary-item">
            <span class="summary-item__label">Navire</span>
            <strong>{{ result.vesselName || "-" }}</strong>
          </div>

          <div class="summary-item">
            <span class="summary-item__label">Dernière date</span>
            <strong>{{ formatDate(result.lastEventDate) }}</strong>
          </div>

          <div class="summary-item">
            <span class="summary-item__label">Code statut</span>
            <strong>{{ result.lastStatusCode || "-" }}</strong>
          </div>
        </div>

        <div class="summary-card__actions">
          <button class="secondary-btn" type="button" @click="onFollow">
            Suivre automatiquement
          </button>
        </div>
      </div>

      <div class="timeline-card">
        <div class="timeline-card__header">
          <div>
            <p class="card-label">Timeline</p>
            <h3>Historique des événements</h3>
          </div>

          <span class="event-count">{{ events.length }} événement(s)</span>
        </div>

        <div v-if="events.length" class="timeline">
          <div
            v-for="event in events"
            :key="event.id"
            class="timeline-item"
          >
            <div class="timeline-item__dot">
              {{ getEventIcon(event.code) }}
            </div>

            <div class="timeline-item__content">
              <div class="timeline-item__top">
                <strong>{{ event.label || event.description || "Événement logistique" }}</strong>

                <span :class="getStatusBadgeClass(event.classifier)">
                  {{ getStatusLabel(event.classifier) }}
                </span>
              </div>

              <p class="timeline-item__meta">
                {{ formatDate(event.date) }}
              </p>

              <div class="timeline-item__details">
                <span><b>Code :</b> {{ event.code || "-" }}</span>
                <span><b>Lieu :</b> {{ event.location || "-" }}</span>
                <span><b>Navire :</b> {{ event.vesselName || "-" }}</span>
                <span><b>Voyage :</b> {{ event.voyage || "-" }}</span>
                <span><b>Type :</b> {{ event.type || "-" }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          Aucun événement trouvé pour cette recherche.
        </div>
      </div>
    </div>

    <div v-else-if="!loading && !error" class="empty-panel">
      <div class="empty-panel__inner">
        <h3>Lance une recherche</h3>
        <p>
          Entre une référence pour récupérer la position et les derniers statuts du conteneur.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tracking-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  color: #111827;
}

.tracking-page__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #176b8a;
}

h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.1;
}

.subtitle {
  margin: 10px 0 0;
  color: #6b7280;
  max-width: 700px;
}

.search-card,
.summary-card,
.timeline-card,
.empty-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.05);
}

.search-card {
  padding: 20px;
  margin-bottom: 24px;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 14px;
  font-weight: 600;
}

.field input,
.field select {
  height: 46px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  background: #fff;
}

.field input:focus,
.field select:focus {
  border-color: #176b8a;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}

.search-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.primary-btn,
.secondary-btn,
.ghost-btn {
  border: 0;
  border-radius: 12px;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #176b8a;
  color: white;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-btn {
  background: #111827;
  color: white;
}

.ghost-btn {
  background: #f3f4f6;
  color: #111827;
}

.alert {
  padding: 14px 16px;
  border-radius: 14px;
  margin-bottom: 20px;
  font-weight: 600;
}

.alert--error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.content-grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
}

.summary-card {
  padding: 20px;
  height: fit-content;
}

.summary-card__top,
.timeline-card__header,
.timeline-item__top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.card-label {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  font-weight: 700;
  color: #6b7280;
}

.summary-card h2,
.timeline-card h3 {
  margin: 0;
  font-size: 22px;
}

.summary-grid {
  display: grid;
  gap: 14px;
  margin-top: 20px;
}

.summary-item {
  padding: 14px;
  border-radius: 14px;
  background: #f9fafb;
  overflow-wrap: anywhere;
}

.summary-item--wide {
  grid-column: 1 / -1;
}

.summary-item__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  font-weight: 700;
}

.summary-card__actions {
  margin-top: 20px;
}

.timeline-card {
  padding: 20px;
}

.event-count {
  font-size: 13px;
  font-weight: 700;
  color: #6b7280;
}

.timeline {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.timeline-item {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 14px;
  align-items: flex-start;
}

.timeline-item__dot {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eff6ff;
  font-size: 18px;
}

.timeline-item__content {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fcfcfd;
}

.timeline-item__meta {
  margin: 8px 0 12px;
  color: #6b7280;
}

.timeline-item__details {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 14px;
  color: #374151;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  background: #f3f4f6;
  color: #374151;
  white-space: nowrap;
}

.badge--success {
  background: #ecfdf5;
  color: #047857;
}

.badge--warning {
  background: #fffbeb;
  color: #b45309;
}

.empty-panel {
  padding: 40px 20px;
}

.empty-panel__inner,
.empty-state {
  text-align: center;
  color: #6b7280;
}

.empty-panel__inner h3 {
  margin: 0 0 8px;
  color: #111827;
}

@media (max-width: 960px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .search-grid {
    grid-template-columns: 1fr;
  }

  .tracking-page__header {
    flex-direction: column;
  }
}
</style>
