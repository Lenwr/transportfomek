"use strict";

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { normalizeAaronEnlevement } = require("./trackingAdapter");

const CENTRAL_TRACKING_API_URL = defineSecret("CENTRAL_TRACKING_API_URL");
const CENTRAL_TRACKING_API_KEY = defineSecret("CENTRAL_TRACKING_API_KEY");

exports.syncEnlevementToCentralTracking = onDocumentWritten(
  {
    document: "enlevements/{enlevementId}",
    region: "us-central1",
    retry: true,
    secrets: [CENTRAL_TRACKING_API_URL, CENTRAL_TRACKING_API_KEY],
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const source = after?.exists ? after.data() : before?.data();
    const sourceId = event.params.enlevementId;
    if (!source) return;

    const payload = normalizeAaronEnlevement(source, sourceId);
    const apiBase = String(CENTRAL_TRACKING_API_URL.value() || "").trim().replace(/\/$/, "");
    const apiKey = String(CENTRAL_TRACKING_API_KEY.value() || "").trim();
    if (!apiBase || !apiKey) throw new Error("Configuration TRACKSEND manquante");

    const isDeleted = !after?.exists;
    const url = isDeleted
      ? `${apiBase}/v1/shipments/${encodeURIComponent(payload.trackingNumber)}`
      : `${apiBase}/v1/shipments`;
    const response = await fetch(url, {
      method: isDeleted ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": "transport-fomek-app",
        "X-Api-Key": apiKey,
      },
      body: isDeleted ? undefined : JSON.stringify(payload),
    });

    if (!response.ok && !(isDeleted && response.status === 404)) {
      const details = await response.text();
      throw new Error(`Synchronisation TRACKSEND refusée (${response.status}): ${details.slice(0, 500)}`);
    }
    console.info("TRACKSEND synchronized", {
      sourceId,
      trackingNumber: payload.trackingNumber,
      operation: isDeleted ? "archive" : "upsert",
    });
  },
);
