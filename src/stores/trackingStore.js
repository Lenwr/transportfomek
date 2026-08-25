import { defineStore } from "pinia";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../components/firebaseConfig.js";

const API_URL =
  import.meta.env.VITE_TRACKING_SEARCH_URL ||
  "https://us-central1-aarontravelgestion.cloudfunctions.net/searchMscTracking";

export const useTrackingStore = defineStore("tracking", {
  state: () => ({
    loading: false,
    error: "",
    result: null,
    events: []
  }),

  actions: {
    async searchTracking(payload) {
      this.loading = true;
      this.error = "";
      this.result = null;
      this.events = [];

      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error("Utilisateur non connecté.");
        }

        const token = await user.getIdToken();
        const cleanPayload = Object.entries(payload || {}).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            acc[key] = String(value).trim();
          }
          return acc;
        }, {});

        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(cleanPayload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || data.error || "Erreur pendant la recherche");
        }

        this.result = data.summary ?? null;
        this.events = Array.isArray(data.events) ? data.events : [];

        if (!this.result && this.events.length === 0) {
          this.error = "Aucun résultat trouvé.";
        }
      } catch (err) {
        this.error =
          err.message ||
          "Erreur pendant la recherche";
      } finally {
        this.loading = false;
      }
    },

    async followCurrentResult() {
      if (!this.result) {
        throw new Error("Aucun résultat à suivre.");
      }

      const user = auth.currentUser;
      if (!user) {
        this.error = "Utilisateur non connecté.";
        return;
      }

      const payload = {
        userId: user.uid,
        shippingLine: this.result.shippingLine || null,
        carrierBookingReference: this.result.reference || null,
        transportDocumentReference: this.result.transportDocumentReference || null,
        equipmentReference: this.result.container || null,
        active: true,
        lastStatus: this.result.lastStatus || null,
        lastStatusCode: this.result.lastStatusCode || null,
        lastStatusType: this.result.lastStatusType || null,
        lastClassifier: this.result.lastClassifier || null,
        lastEventDate: this.result.lastEventDate || null,
        lastLocation: this.result.lastLocation || null,
        vesselName: this.result.vesselName || null,
        createdAt: serverTimestamp(),
        lastCheckedAt: serverTimestamp()
      };

      await addDoc(collection(db, "shipments"), payload);
    },

    clearSearch() {
      this.loading = false;
      this.error = "";
      this.result = null;
      this.events = [];
    }
  }
});
