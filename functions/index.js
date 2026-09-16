/* functions/index.js */

const { onRequest } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
} = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const twilio = require("twilio");
const crypto = require("crypto");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

/* =========================
   Configuration & Constantes
========================= */
const DEFAULT_ADMIN_PHONE = "+33766813707";
const DEFAULT_WHATSAPP_FROM = "";
const DEFAULT_WHATSAPP_TEMPLATE_SID = "";
const DEFAULT_SMS_SENDER_ID = "FOMEK";
const ADMIN_APP_URL = process.env.ADMIN_APP_URL || "http://localhost:5173";

/* =========================
   Helpers
========================= */
function cleanPhone(p) {
  return String(p || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/^0/, "+33");
}

function normalizeTrackingPhone(value, destination = "") {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (/^(33|237)/.test(digits)) return `+${digits}`;

  const country = String(destination || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if ((country.includes("cameroun") || country.includes("douala") || country.includes("yaounde") || country.includes("kribi")) && digits.length === 9) return `+237${digits}`;
  if (digits.startsWith("0")) return `+33${digits.slice(1)}`;
  return `+${digits}`;
}

function formatTrackingPickupDate(value) {
  if (!value) return "à une date non renseignée";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "à une date non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatMoneyFR(n) {
  return Number(n || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sendSMS(to, body) {
  const dest = cleanPhone(to);
  if (!dest) throw new Error("Numéro invalide");
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  return twilioClient.messages.create({
    body: String(body).trim(),
    from: String(process.env.TWILIO_SMS_SENDER_ID || DEFAULT_SMS_SENDER_ID).trim(),
    to: dest,
  });
}

function formatWhatsappAddress(phone) {
  const raw = String(phone || "").trim();
  const cleaned = cleanPhone(raw);

  if (!cleaned) throw new Error("Numéro WhatsApp invalide");
  if (cleaned.startsWith("whatsapp:")) return cleaned;
  if (cleaned.startsWith("+")) return `whatsapp:${cleaned}`;
  if (cleaned.startsWith("00")) return `whatsapp:+${cleaned.slice(2)}`;
  return `whatsapp:+${cleaned}`;
}

function getWhatsappSender() {
  const sender = String(process.env.TWILIO_WHATSAPP_FROM || DEFAULT_WHATSAPP_FROM).trim();
  if (!sender) throw new Error("Expéditeur WhatsApp non configuré (TWILIO_WHATSAPP_FROM)");
  return sender.startsWith("whatsapp:") ? sender : `whatsapp:${sender}`;
}

function sendWhatsApp(to, body) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const message = String(body || "").trim();

  if (!message) throw new Error("Message WhatsApp manquant");

  return twilioClient.messages.create({
    body: message,
    from: getWhatsappSender(),
    to: formatWhatsappAddress(to),
  });
}

function sendWhatsAppTemplate(to, contentSid, contentVariables = {}) {
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const sid = String(contentSid || process.env.TWILIO_WHATSAPP_TEMPLATE_SID || DEFAULT_WHATSAPP_TEMPLATE_SID).trim();

  if (!sid) throw new Error("Template WhatsApp manquant");

  const payload = {
    from: getWhatsappSender(),
    to: formatWhatsappAddress(to),
    contentSid: sid,
  };

  if (contentVariables && Object.keys(contentVariables).length) {
    payload.contentVariables = JSON.stringify(contentVariables);
  }

  return twilioClient.messages.create(payload);
}

function getAdminPhones() {
  const raw = String(process.env.ADMIN_PHONES || "");

  const phones = raw
    .split(",")
    .map(cleanPhone)
    .filter(Boolean);

  const fallback = cleanPhone(DEFAULT_ADMIN_PHONE);
  if (fallback && !phones.includes(fallback)) {
    phones.push(fallback);
  }

  return phones;
}

function withCors(handler) {
  return (req, res) =>
    cors(req, res, async () => {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Méthode non autorisée" });
      }
      return handler(req, res);
    });
}

function buildInvoiceSmsMessage(inv) {
  const num = inv?.number || "—";
  const pdfUrl = String(inv?.pdfUrl || "").trim();

  if (!pdfUrl) {
    throw new Error("Lien PDF manquant sur la facture");
  }

  return `AARON TRAVEL - Facture ${num}\nTéléchargement PDF : ${pdfUrl}`;
}

function buildInvoiceReminderSmsMessage(inv) {
  const num = inv?.number || "—";
  const due = formatMoneyFR(inv?.totals?.due || 0);
  const dueDate = String(inv?.dueDate || "—");
  const clientName =
    inv?.client?.companyName ||
    inv?.client?.representativeName ||
    inv?.client?.displayName ||
    "Client";

  return `Bonjour ${clientName}, rappel AARON TRAVEL : la facture ${num} arrivée à échéance le ${dueDate} présente un solde restant de ${due} €. Merci de régulariser dès que possible.`;
}

function buildPickupRequestAdminSmsMessage(data, requestId) {
  const clientName = [data?.clientPrenom, data?.clientNom].filter(Boolean).join(" ").trim() || "Client";
  const clientPhone = data?.clientPhone || "—";
  const recipient = data?.destinataire || "—";
  const recipientPhone =
    data?.telephoneDestinataireDirect ||
    data?.telephoneDestinataire ||
    "—";
  const whatsapp = data?.telephoneDestinataireWhatsapp || "";
  const destination = data?.destination || "—";
  const freight = data?.typeDeFret || "—";
  const count = data?.nombreDeColis || (Array.isArray(data?.colis) ? data.colis.length : 0);
  const requestedSlot = [data?.reservationDate, data?.reservationTime].filter(Boolean).join(" ") || "Non précisé";
  const responseLink = `${ADMIN_APP_URL.replace(/\/$/, "")}/#/validate-request/${requestId}`;

  const lines = [
    "AARON TRAVEL - Nouvelle demande d'enlevement",
    `Client: ${clientName}`,
    `Tel client: ${clientPhone}`,
    `Destinataire: ${recipient}`,
    `Tel dest: ${recipientPhone}`,
  ];

  if (whatsapp) {
    lines.push(`WhatsApp: ${whatsapp}`);
  }

  lines.push(
    `Destination: ${destination}`,
    `Fret: ${freight}`,
    `Colis: ${count}`,
    `Passage souhaite: ${requestedSlot}`,
    `Repondre: ${responseLink}`
  );

  return lines.join("\n");
}

function buildPickupRequestClientSmsMessage(data) {
  const clientName = [data?.clientPrenom, data?.clientNom].filter(Boolean).join(" ").trim();
  const hello = clientName ? `Bonjour ${clientName},` : "Bonjour,";
  const status = String(data?.status || "").toUpperCase();
  const destination = data?.destination || "votre destination";
  const response = String(data?.responseMessage || "").trim();

  if (status === "VALIDATED") {
    return [
      `${hello} AARON TRAVEL a valide votre demande d'enlevement vers ${destination}.`,
      response || "Notre equipe vous contactera pour la suite.",
    ].join("\n");
  }

  if (status === "CANCELLED") {
    return [
      `${hello} AARON TRAVEL n'a pas pu valider votre demande d'enlevement vers ${destination}.`,
      response || "Contactez-nous si vous souhaitez plus d'informations.",
    ].join("\n");
  }

  return "";
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateCoordinatePair(name, point) {
  const lat = toNumber(point?.lat);
  const lon = toNumber(point?.lon);

  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`${name} invalide`);
  }

  return { lat, lon };
}

function haversineDistance(from, to) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortStopsByNearest(start, stops) {
  const remaining = stops.map((stop) => ({ ...stop }));
  const ordered = [];
  let current = start;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;

    remaining.forEach((stop, index) => {
      const distance = haversineDistance(current, stop.coordinates);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = next.coordinates;
  }

  return ordered;
}

async function geocodeWithOpenRouteService(address) {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", address);
  url.searchParams.set("size", "1");

  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `Adresse introuvable : ${address}`);
  }

  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    throw new Error(`Adresse introuvable : ${address}`);
  }

  return {
    lon: Number(coords[0]),
    lat: Number(coords[1]),
  };
}

async function getDirectionsWithOpenRouteService(coordinates) {
  const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.OPENROUTESERVICE_API_KEY,
    },
    body: JSON.stringify({
      coordinates,
      instructions: false,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "Impossible de calculer l'itinéraire.");
  }

  const feature = data?.features?.[0] || {};
  return {
    summary: feature?.properties?.summary || null,
    geometry: feature?.geometry?.coordinates || [],
  };
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.events)) return value.events;
  return [];
}

function normalizeShippingLine(value) {
  const raw = String(value || "MSC")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  const aliases = {
    CMA: "CMA_CGM",
    CMACGM: "CMA_CGM",
    "CMA_CGM": "CMA_CGM",
    HAPAG: "HAPAG_LLOYD",
    HAPAG_LLOYD: "HAPAG_LLOYD",
    YANGMING: "YANG_MING",
    YANG_MING: "YANG_MING",
  };

  return aliases[raw] || raw;
}

function formatTrackingLocation(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  return [
    value.name,
    value.city,
    value.portName,
    value.port,
    value.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizeTrackingEvent(event, index) {
  const location = formatTrackingLocation(
    firstValue(event.location, event.eventLocation, event.place, event.port)
  );

  return {
    id: String(firstValue(event.id, event.eventId, `${index}`)),
    code: String(firstValue(event.code, event.eventCode, event.statusCode, event.activityCode)),
    label: String(firstValue(event.label, event.description, event.eventType, event.status, "Evenement logistique")),
    description: String(firstValue(event.description, event.eventDescription, event.label)),
    classifier: String(firstValue(event.classifier, event.eventClassifierCode, event.type, event.actual ? "ACT" : "")),
    date: String(firstValue(event.date, event.eventDateTime, event.eventTime, event.timestamp, event.actualTime, event.estimatedTime)),
    location,
    vesselName: String(firstValue(event.vesselName, event.vessel, event.transportCall?.vessel?.name)),
    voyage: String(firstValue(event.voyage, event.voyageNumber, event.exportVoyageNumber, event.importVoyageNumber)),
    type: String(firstValue(event.type, event.eventType, event.transportEventTypeCode)),
  };
}

function extractTrackingEvents(payload) {
  const containers = asArray(
    firstValue(payload.containers, payload.data?.containers, payload.shipments?.[0]?.containers)
  );
  const firstContainer = containers[0] || {};

  return asArray(
    firstValue(
      payload.events,
      payload.data?.events,
      payload.tracking?.events,
      payload.shipment?.events,
      payload.shipments?.[0]?.events,
      firstContainer.events,
      firstContainer.tracking?.events
    )
  )
    .map(normalizeTrackingEvent)
    .filter((event) => event.date || event.label || event.code || event.location);
}

function normalizeTrackingPayload(payload, input) {
  const events = extractTrackingEvents(payload).sort((a, b) => {
    const aTime = new Date(a.date || 0).getTime();
    const bTime = new Date(b.date || 0).getTime();
    return bTime - aTime;
  });

  const latest = events[0] || {};
  const containers = asArray(
    firstValue(payload.containers, payload.data?.containers, payload.shipments?.[0]?.containers)
  );
  const firstContainer = containers[0] || {};
  const root = payload.data || payload;
  const associatedContainerNumbers = asArray(root.associated_container_numbers);
  const containerDisplay = associatedContainerNumbers.length
    ? associatedContainerNumbers.slice(0, 4).join(", ") + (associatedContainerNumbers.length > 4 ? ` +${associatedContainerNumbers.length - 4}` : "")
    : "";

  const summary = {
    provider: "JSONCargo",
    shippingLine: input.shippingLine,
    reference: String(firstValue(
      root.reference,
      root.bookingReference,
      root.carrierBookingReference,
      input.carrierBookingReference,
      input.reference
    )),
    transportDocumentReference: String(firstValue(
      root.transportDocumentReference,
      root.billOfLading,
      root.bill_of_lading,
      root.blNumber,
      input.transportDocumentReference
    )),
    container: String(firstValue(
      root.container,
      root.containerNumber,
      root.container_id,
      root.equipmentReference,
      firstContainer.container,
      firstContainer.containerNumber,
      firstContainer.equipmentReference,
      containerDisplay,
      input.equipmentReference
    )),
    associatedContainers: associatedContainerNumbers,
    lastStatus: String(firstValue(root.lastStatus, root.status, root.container_status, latest.label, latest.description)),
    lastStatusCode: String(firstValue(root.lastStatusCode, root.statusCode, latest.code)),
    lastStatusType: String(firstValue(root.lastStatusType, latest.type)),
    lastClassifier: String(firstValue(root.lastClassifier, latest.classifier)),
    lastEventDate: String(firstValue(
      root.lastEventDate,
      root.updatedAt,
      root.last_updated,
      root.timestamp_of_last_location,
      root.last_movement_timestamp,
      latest.date
    )),
    lastLocation: String(firstValue(
      formatTrackingLocation(root.lastLocation),
      root.last_location,
      root.last_location_terminal,
      formatTrackingLocation(root.location),
      latest.location
    )),
    vesselName: String(firstValue(root.vesselName, root.vessel, root.current_vessel_name, root.last_vessel_name, latest.vesselName)),
  };

  return { summary, events };
}

async function callJsonCargoTracking(input) {
  const apiKey = String(process.env.JSONCARGO_API_TOKEN || "").trim();
  if (!apiKey) {
    throw new Error("Tracking conteneur temporairement désactivé");
  }

  const shippingLine = normalizeShippingLine(input.shippingLine);
  const equipmentReference = String(input.equipmentReference || "").trim().toUpperCase();
  const transportDocumentReference = String(input.transportDocumentReference || "").trim().toUpperCase();
  const carrierBookingReference = String(input.carrierBookingReference || "").trim().toUpperCase();
  const reference = equipmentReference || transportDocumentReference || carrierBookingReference;

  if (!reference) {
    throw new Error("Entre un numéro de conteneur, un BL ou un booking");
  }

  const baseUrl = String(process.env.JSONCARGO_BASE_URL || "https://api.jsoncargo.com/api/v1").replace(/\/$/, "");
  const path = equipmentReference
    ? `containers/${encodeURIComponent(reference)}`
    : `containers/bol/${encodeURIComponent(reference)}`;
  const url = new URL(`${baseUrl}/${path}`);
  url.searchParams.set("shipping_line", shippingLine);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.detail ||
        `Recherche conteneur impossible (${response.status})`
    );
  }

  return normalizeTrackingPayload(data, {
    ...input,
    reference,
    shippingLine,
    equipmentReference,
    transportDocumentReference,
    carrierBookingReference,
  });
}

/* =========================
   ✅ Auth helper
========================= */
async function requireAuth(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s(.+)$/);
  const idToken = match?.[1];
  if (!idToken) throw new Error("Unauthorized: missing token");
  return admin.auth().verifyIdToken(idToken);
}

async function requireSuperAdmin(req) {
  const user = await requireAuth(req);
  const userSnap = await admin.firestore().collection("users").doc(user.uid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const isSuperAdmin =
    user.superAdmin === true ||
    user.role === "superAdmin" ||
    userData.superAdmin === true ||
    userData.role === "superAdmin";

  if (!isSuperAdmin) {
    throw new Error("Forbidden: superAdmin required");
  }

  return {
    ...user,
    displayName: userData.displayName || user.name || user.email || "",
  };
}

async function requireSuperAdminOrPermission(req, permission) {
  const user = await requireAuth(req);
  const userSnap = await admin.firestore().collection("users").doc(user.uid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const permissions = Array.isArray(userData.permissions) ? userData.permissions : [];
  const isSuperAdmin =
    user.superAdmin === true ||
    user.role === "superAdmin" ||
    userData.superAdmin === true ||
    userData.role === "superAdmin";

  if (!isSuperAdmin && !permissions.includes(permission)) {
    throw new Error(`Forbidden: ${permission} permission required`);
  }

  return {
    ...user,
    displayName: userData.displayName || user.name || user.email || "",
  };
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const raw = Array.from(crypto.randomBytes(12))
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
  return `${raw}Aa1!`;
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function redactAuditValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.GeoPoint) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(redactAuditValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|token|secret|apiKey|sid/i.test(key))
        .slice(0, 40)
        .map(([key, nestedValue]) => [key, redactAuditValue(nestedValue)])
    );
  }
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  return value;
}

function pickActor(data = {}) {
  const candidates = [
    data.updatedBy,
    data.createdBy,
    data.deletedBy,
    data.actor,
    data.user,
    data.auditUser,
  ].filter(Boolean);
  const actor = candidates.find((item) => typeof item === "object") || {};
  const stringActor = candidates.find((item) => typeof item === "string") || "";

  return {
    userId: data.updatedById || data.createdById || data.deletedById || actor.uid || actor.id || stringActor || "",
    userName: data.updatedByName || data.createdByName || data.deletedByName || actor.displayName || actor.name || "",
    userEmail: data.updatedByEmail || data.createdByEmail || data.deletedByEmail || actor.email || "",
    userRole: data.updatedByRole || data.createdByRole || data.deletedByRole || actor.role || "",
  };
}

async function resolveAuditActor(event, actor = {}) {
  const authId = event.authType === "USER" && event.authId ? String(event.authId) : "";
  const userId = actor.userId || authId;

  if (!userId || (actor.userName && actor.userEmail)) return actor;

  let userData = {};
  try {
    const userSnap = await admin.firestore().collection("users").doc(userId).get();
    userData = userSnap.exists ? userSnap.data() || {} : {};
  } catch (e) {
    userData = {};
  }

  let authUser = null;
  if (!userData.displayName || !userData.email) {
    try {
      authUser = await admin.auth().getUser(userId);
    } catch (e) {
      authUser = null;
    }
  }

  return {
    userId,
    userName: actor.userName || userData.displayName || authUser?.displayName || "",
    userEmail: actor.userEmail || userData.email || authUser?.email || "",
    userRole: actor.userRole || userData.role || "",
  };
}

function getChangedFields(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => JSON.stringify(redactAuditValue(before[key])) !== JSON.stringify(redactAuditValue(after[key])))
    .filter((key) => !/password|token|secret|apiKey|sid/i.test(key))
    .slice(0, 80);
}

function buildAuditLabel(collectionId, data = {}, documentId = "") {
  return (
    data.label ||
    data.displayName ||
    data.name ||
    data.nom ||
    data.clientName ||
    data.customerName ||
    data.number ||
    data.reference ||
    documentId ||
    collectionId
  );
}

async function writeAuditLog(event, targetType) {
  const beforeExists = Boolean(event.data?.before?.exists);
  const afterExists = Boolean(event.data?.after?.exists);
  const before = beforeExists ? event.data.before.data() || {} : {};
  const after = afterExists ? event.data.after.data() || {} : {};
  const current = afterExists ? after : before;
  const targetId = event.params.documentId || event.params.itemId || "";

  if (!afterExists && !beforeExists) return;
  if (targetType === "activityLogs") return;

  const action = !beforeExists ? "created" : !afterExists ? "deleted" : "updated";
  const changedFields = action === "updated" ? getChangedFields(before, after) : [];
  if (action === "updated" && changedFields.length === 0) return;

  const actor = await resolveAuditActor(event, pickActor(current));

  await admin.firestore().collection("activityLogs").add({
    action: `${targetType}_${action}`,
    targetType,
    targetId,
    label: buildAuditLabel(targetType, current, targetId),
    details: {
      source: "firestore_trigger",
      changedFields,
      before: action === "updated" ? Object.fromEntries(changedFields.map((key) => [key, redactAuditValue(before[key])])) : {},
      after: action !== "deleted" ? Object.fromEntries((action === "updated" ? changedFields : Object.keys(after).slice(0, 40)).map((key) => [key, redactAuditValue(after[key])])) : {},
    },
    ...actor,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/* =========================
   TRIGGERS FIRESTORE (v2)
========================= */

exports.auditTopLevelDocumentWrite = onDocumentWrittenWithAuthContext(
  "{collectionId}/{documentId}",
  async (event) => writeAuditLog(event, event.params.collectionId)
);

exports.auditPricingItemWrite = onDocumentWrittenWithAuthContext(
  "pricingCatalog/{catalogId}/items/{itemId}",
  async (event) => writeAuditLog(event, `pricingCatalog/${event.params.catalogId}/items`)
);

/**
 * IMPORTANT
 * Désactivé pour éviter le doublon de factures :
 * la facture est déjà créée / synchronisée côté front.
 */
exports.onPaymentCreated = onDocumentCreated("payments/{paymentId}", async () => {
  return;
});

// 2) reservationRequests -> SMS admin
exports.onReservationRequestCreate = onDocumentCreated(
  { document: "reservationRequests/{requestId}", },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};

    const body = `📦 AARON TRAVEL — Nouvelle demande\nNom: ${data.tenantName}\nTel: ${data.tenantPhone}\nDate: ${data.requestedDate}\nDest: ${data.destination}`;

    const results = [];
    for (const to of getAdminPhones()) {
      try {
        const sms = await sendSMS(to, body);
        results.push({ to, ok: true, sid: sms.sid });
      } catch (e) {
        results.push({ to, ok: false, error: e.message });
      }
    }

    await snap.ref.update({
      adminNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNotifyResults: results,
    });
  }
);

// 3) pickupRequests -> SMS admin
exports.onPickupRequestCreate = onDocumentCreated(
  { document: "pickupRequests/{requestId}", },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};

    const body = buildPickupRequestAdminSmsMessage(data, event.params.requestId);
    const results = [];

    for (const to of getAdminPhones()) {
      try {
        const sms = await sendSMS(to, body);
        results.push({ to, ok: true, sid: sms.sid });
      } catch (e) {
        results.push({ to, ok: false, error: e.message });
      }
    }

    await snap.ref.update({
      adminNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNotifyResults: results,
    });
  }
);

// 4) pickupRequests status update -> SMS client
exports.onPickupRequestStatusUpdate = onDocumentUpdated(
  { document: "pickupRequests/{requestId}", },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const beforeStatus = String(before.status || "PENDING").toUpperCase();
    const afterStatus = String(after.status || "PENDING").toUpperCase();

    if (beforeStatus === afterStatus) return;
    if (!["VALIDATED", "CANCELLED"].includes(afterStatus)) return;

    const phone = after.clientPhone;
    if (!phone) return;

    const body = buildPickupRequestClientSmsMessage(after);
    if (!body) return;

    const sms = await sendSMS(phone, body);
    await event.data.after.ref.update({
      clientDecisionSmsSentAt: admin.firestore.FieldValue.serverTimestamp(),
      clientDecisionSmsSid: sms.sid,
    });
  }
);

// 5) status update -> SMS locataire
exports.onReservationRequestStatusUpdate = onDocumentUpdated(
  { document: "reservationRequests/{requestId}", },
  async (event) => {
    const beforeStatus = event.data.before.data()?.status;
    const after = event.data.after.data() || {};
    const afterStatus = after?.status;

    if (beforeStatus === afterStatus || !["approved", "rejected"].includes(afterStatus) || !after.tenantPhone) return;

    const hello = after.tenantName ? `Bonjour ${after.tenantName}, ` : "Bonjour, ";
    const body =
      afterStatus === "approved"
        ? `${hello}✅ AARON TRAVEL: Votre demande du ${after.requestedDate} vers ${after.destination} a été acceptée.`
        : `${hello}❌ AARON TRAVEL: Votre demande du ${after.requestedDate} vers ${after.destination} a été refusée.`;

    const sms = await sendSMS(after.tenantPhone, body);
    await event.data.after.ref.update({
      decisionSmsSentAt: admin.firestore.FieldValue.serverTimestamp(),
      decisionSmsSid: sms.sid,
    });
  }
);

/* =========================
   FONCTIONS HTTPS
========================= */

exports.sendInvoiceSMS = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { phoneNumber, message } = req.body;
      const sms = await sendSMS(phoneNumber, message);
      return res.status(200).json({ success: true, sid: sms.sid });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  })
);

exports.sendWhatsAppMessage = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { phoneNumber, message, contentSid, contentVariables, useTemplate } = req.body || {};
      const whatsapp =
        contentSid || useTemplate
          ? await sendWhatsAppTemplate(phoneNumber, contentSid, contentVariables)
          : await sendWhatsApp(phoneNumber, message);

      return res.status(200).json({
        success: true,
        sid: whatsapp.sid,
        status: whatsapp.status,
        to: whatsapp.to,
        from: whatsapp.from,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        success: false,
        error: e.message || "Erreur envoi WhatsApp",
      });
    }
  })
);

exports.sendBroadcastSMS = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { phones, message } = req.body;
      if (!Array.isArray(phones)) {
        return res.status(400).json({ success: false, error: "phones must be an array" });
      }

      const results = [];
      for (const to of [...new Set(phones)]) {
        try {
          const sms = await sendSMS(to, message);
          results.push({ to, ok: true, sid: sms.sid });
        } catch (e) {
          results.push({ to, ok: false, error: e.message });
        }
      }
      return res.status(200).json({ success: true, results });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  })
);

exports.sendContainerTrackingLinks = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      const user = await requireSuperAdmin(req);
      const chargementId = String(req.body?.chargementId || "").trim();
      const dryRun = req.body?.dryRun === true;

      if (!/^[A-Za-z0-9_-]{1,160}$/.test(chargementId)) {
        return res.status(400).json({ success: false, error: "Chargement invalide" });
      }

      const chargementSnap = await admin.firestore().collection("chargements").doc(chargementId).get();
      if (!chargementSnap.exists) {
        return res.status(404).json({ success: false, error: "Chargement introuvable" });
      }

      const packages = Array.isArray(chargementSnap.data()?.packagesTable)
        ? chargementSnap.data().packagesTable
        : [];
      const clientIds = [...new Set(packages.map((item) => {
        const legacyMatch = String(item?.id || "").match(/^(.*)-(\d+)-(\d+)$/);
        return String(item?.clientId || legacyMatch?.[1] || "").trim();
      }).filter(Boolean))];

      const pickupSnaps = await Promise.all(
        clientIds.map((id) => admin.firestore().collection("enlevements").doc(id).get())
      );
      const recipientsByPhone = new Map();
      let skipped = 0;

      for (const pickupSnap of pickupSnaps) {
        if (!pickupSnap.exists) {
          skipped += 1;
          continue;
        }

        const pickup = pickupSnap.data() || {};
        const phone = normalizeTrackingPhone(pickup.telephoneExpediteur, pickup.destination);
        const trackingNumber = String(pickup.numero || pickup.numeroSuivi || pickup.trackingNumber || "").trim();
        if (!phone || !trackingNumber) {
          skipped += 1;
          continue;
        }

        if (!recipientsByPhone.has(phone)) {
          recipientsByPhone.set(phone, {
            phone,
            name: String(pickup.expediteur || "Client").trim(),
            shipments: new Map(),
          });
        }

        recipientsByPhone.get(phone).shipments.set(trackingNumber, {
          trackingNumber,
          pickupDate: formatTrackingPickupDate(pickup.date || pickup.createdAt),
          link: `https://tracksend.vercel.app/suivi/transport-fomek?code=${encodeURIComponent(trackingNumber)}`,
        });
      }

      const recipients = [...recipientsByPhone.values()].map((recipient) => ({
        ...recipient,
        shipments: [...recipient.shipments.values()],
      }));

      if (dryRun) {
        return res.status(200).json({
          success: true,
          dryRun: true,
          recipientCount: recipients.length,
          shipmentCount: recipients.reduce((sum, item) => sum + item.shipments.length, 0),
          skipped,
          recipients: recipients.map((item) => ({
            name: item.name,
            phoneMasked: item.phone.replace(/.(?=.{4})/g, "•"),
            shipmentCount: item.shipments.length,
          })),
        });
      }

      const results = [];
      for (const recipient of recipients) {
        const links = recipient.shipments.flatMap((shipment) => [
          `Votre colis, récupéré le ${shipment.pickupDate}, vient d'être chargé dans un conteneur et est désormais en cours d'acheminement.`,
          `Suivez sa progression sur TRACKSEND : ${shipment.link}`,
        ]);
        const message = [
          `Bonjour ${recipient.name || "Client"},`,
          ...links,
          "TRANSPORT FOMEK — Suivez. Expédiez. Livrez.",
        ].join("\n");

        try {
          const sms = await sendSMS(recipient.phone, message);
          results.push({ ok: true, sid: sms.sid, shipmentCount: recipient.shipments.length });
        } catch (error) {
          results.push({ ok: false, error: error.message, shipmentCount: recipient.shipments.length });
        }
      }

      const sent = results.filter((item) => item.ok).length;
      const failed = results.length - sent;
      await admin.firestore().collection("activityLogs").add({
        action: "container_tracking_links_sent",
        targetType: "chargements",
        targetId: chargementId,
        label: `Liens de suivi envoyés (${sent}/${results.length})`,
        details: { sent, failed, skipped, recipientCount: recipients.length },
        actorUid: user.uid,
        actorEmail: user.email || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ success: true, sent, failed, skipped });
    } catch (error) {
      const message = error.message || "Erreur d'envoi des liens de suivi";
      const status = message.startsWith("Forbidden") ? 403 : message.startsWith("Unauthorized") ? 401 : 500;
      console.error("sendContainerTrackingLinks", error);
      return res.status(status).json({ success: false, error: message });
    }
  })
);

exports.sendPickupTrackingLink = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      const user = await requireSuperAdmin(req);
      const enlevementId = String(req.body?.enlevementId || "").trim();
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(enlevementId)) {
        return res.status(400).json({ success: false, error: "Enlèvement invalide" });
      }

      const pickupRef = admin.firestore().collection("enlevements").doc(enlevementId);
      const pickupSnap = await pickupRef.get();
      if (!pickupSnap.exists) {
        return res.status(404).json({ success: false, error: "Enlèvement introuvable" });
      }

      const pickup = pickupSnap.data() || {};
      const status = String(pickup.deliveryStatus || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const packageShipped = (pickup.colis || []).some(item => [item.statutColis, ...(item.details || []).map(detail => detail.statutColis)].some(value => {
        const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return normalized.includes("expedi") || normalized.includes("transit");
      }));
      if (!status.includes("expedi") && !status.includes("transit") && !pickup.transitDate && !packageShipped) {
        return res.status(409).json({ success: false, error: "Le colis n'est pas encore expédié" });
      }

      const phone = normalizeTrackingPhone(pickup.telephoneExpediteur, pickup.destination);
      const trackingNumber = String(pickup.numero || pickup.numeroSuivi || pickup.trackingNumber || "").trim();
      if (!phone) {
        return res.status(400).json({ success: false, error: "Téléphone de l'expéditeur manquant" });
      }
      if (!trackingNumber) {
        return res.status(400).json({ success: false, error: "Numéro de suivi manquant" });
      }

      const link = `https://tracksend.vercel.app/suivi/transport-fomek?code=${encodeURIComponent(trackingNumber)}`;
      const name = String(pickup.expediteur || "Client").trim();
      const pickupDate = formatTrackingPickupDate(pickup.date || pickup.createdAt);
      const message = [
        `Bonjour ${name},`,
        `Votre colis, récupéré le ${pickupDate}, vient d'être chargé dans un conteneur et est désormais en cours d'acheminement.`,
        `Suivez sa progression sur TRACKSEND : ${link}`,
        "TRANSPORT FOMEK — Suivez. Expédiez. Livrez.",
      ].join("\n");
      const sms = await sendSMS(phone, message);
      const sentAt = admin.firestore.FieldValue.serverTimestamp();

      await pickupRef.update({
        trackingLinkSentAt: sentAt,
        trackingLinkSmsSid: sms.sid,
        trackingLinkSentBy: user.uid,
      });
      await admin.firestore().collection("activityLogs").add({
        action: "pickup_tracking_link_sent",
        targetType: "enlevements",
        targetId: enlevementId,
        label: `Lien de suivi envoyé pour ${trackingNumber}`,
        details: { channel: "sms", trackingNumber },
        actorUid: user.uid,
        actorEmail: user.email || "",
        createdAt: sentAt,
      });

      return res.status(200).json({ success: true, sid: sms.sid });
    } catch (error) {
      const message = error.message || "Erreur d'envoi du lien de suivi";
      const status = message.startsWith("Forbidden") ? 403 : message.startsWith("Unauthorized") ? 401 : 500;
      console.error("sendPickupTrackingLink", error);
      return res.status(status).json({ success: false, error: message });
    }
  })
);

exports.sendBoxTenantBroadcastSMS = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      const user = await requireSuperAdminOrPermission(req, "boxBroadcast");

      const { phones, message } = req.body;
      if (!Array.isArray(phones)) {
        return res.status(400).json({ success: false, error: "phones must be an array" });
      }

      const results = [];
      for (const to of [...new Set(phones)]) {
        try {
          const sms = await sendSMS(to, message);
          results.push({ to, ok: true, sid: sms.sid });
        } catch (e) {
          results.push({ to, ok: false, error: e.message });
        }
      }

      await admin.firestore().collection("activityLogs").add({
        action: "box_broadcast_sms_sent",
        targetType: "boxBroadcastMessages",
        targetId: "",
        label: `Diffusion boxes (${results.filter((item) => item.ok).length}/${results.length})`,
        details: {
          source: "cloud_function",
          recipientsCount: [...new Set(phones)].length,
          successCount: results.filter((item) => item.ok).length,
          failedCount: results.filter((item) => !item.ok).length,
        },
        actorUid: user.uid,
        actorEmail: user.email || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ success: true, results });
    } catch (e) {
      const message = e.message || "Erreur diffusion boxes";
      const status = message.startsWith("Forbidden") ? 403 : message.startsWith("Unauthorized") ? 401 : 500;
      return res.status(status).json({ success: false, error: message });
    }
  })
);

exports.sendDriverLinkSMS = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { phoneNumber, driverName, link } = req.body || {};
      const phone = cleanPhone(phoneNumber);
      const url = String(link || "").trim();
      const name = String(driverName || "chauffeur").trim();

      if (!phone) {
        return res.status(400).json({ success: false, error: "phoneNumber required" });
      }

      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ success: false, error: "link invalid" });
      }

      const body = [
        `AARON TRAVEL - Bonjour ${name},`,
        "voici votre lien de tournée pour enregistrer les enlèvements :",
        url,
        "Ouvrez le lien, puis gardez la page ouverte pendant la tournée.",
      ].join("\n");

      const sms = await sendSMS(phone, body);
      return res.status(200).json({ success: true, sid: sms.sid, to: phone });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "error" });
    }
  })
);

exports.createClientPortalAccess = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      const adminUser = await requireSuperAdmin(req);
      const { clientId, email, password } = req.body || {};
      const cleanClientId = String(clientId || "").trim();
      const cleanClientEmail = cleanEmail(email);

      if (!cleanClientId) {
        return res.status(400).json({ success: false, error: "clientId requis" });
      }

      if (!cleanClientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanClientEmail)) {
        return res.status(400).json({ success: false, error: "Email client invalide" });
      }

      const clientRef = admin.firestore().collection("clients").doc(cleanClientId);
      const clientSnap = await clientRef.get();

      if (!clientSnap.exists) {
        return res.status(404).json({ success: false, error: "Client introuvable" });
      }

      const clientData = clientSnap.data() || {};
      const tempPassword = String(password || "").trim() || generateTemporaryPassword();

      if (tempPassword.length < 8) {
        return res.status(400).json({ success: false, error: "Mot de passe trop court" });
      }

      let authUser = null;
      const existingUid = String(clientData.authUid || "").trim();

      if (existingUid) {
        authUser = await admin.auth().updateUser(existingUid, {
          email: cleanClientEmail,
          password: tempPassword,
          displayName: clientData.displayName || [clientData.prenom, clientData.nom].filter(Boolean).join(" ").trim() || "Client",
          disabled: false,
        });
      } else {
        try {
          authUser = await admin.auth().getUserByEmail(cleanClientEmail);
          await admin.auth().updateUser(authUser.uid, {
            password: tempPassword,
            displayName: clientData.displayName || [clientData.prenom, clientData.nom].filter(Boolean).join(" ").trim() || "Client",
            disabled: false,
          });
        } catch (error) {
          if (error.code !== "auth/user-not-found") throw error;
          authUser = await admin.auth().createUser({
            email: cleanClientEmail,
            password: tempPassword,
            displayName: clientData.displayName || [clientData.prenom, clientData.nom].filter(Boolean).join(" ").trim() || "Client",
            disabled: false,
          });
        }
      }

      await admin.auth().setCustomUserClaims(authUser.uid, {
        role: "client",
        clientId: cleanClientId,
      });

      const now = admin.firestore.FieldValue.serverTimestamp();
      await Promise.all([
        clientRef.update({
          authUid: authUser.uid,
          email: cleanClientEmail,
          hasPortalAccess: true,
          portalAccessUpdatedAt: now,
          portalAccessCreatedBy: adminUser.uid,
        }),
        admin.firestore().collection("users").doc(authUser.uid).set(
          {
            email: cleanClientEmail,
            role: "client",
            clientId: cleanClientId,
            displayName: clientData.displayName || [clientData.prenom, clientData.nom].filter(Boolean).join(" ").trim() || "Client",
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);

      return res.status(200).json({
        success: true,
        uid: authUser.uid,
        email: cleanClientEmail,
        temporaryPassword: tempPassword,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "Erreur création accès client" });
    }
  })
);

const INTERNAL_PERMISSION_KEYS = new Set([
  "dashboard",
  "planning",
  "driversMap",
  "clientFollowup",
  "liste",
  "form",
  "pickupRequests",
  "pickupRequestScan",
  "deliveryScan",
  "recording",
  "tracking",
  "boxes",
  "contracts",
  "billing",
  "customers",
]);

function cleanPermissions(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim()).filter((item) => INTERNAL_PERMISSION_KEYS.has(item));
}

function validInternalRole(value) {
  return value === "superAdmin" || (/^[a-z0-9_-]{2,50}$/.test(value) && value !== "client");
}

exports.createInternalAccess = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      const adminUser = await requireSuperAdmin(req);
      const { email, password, role = "admin", displayName = "", permissions = [], disabled = false } = req.body || {};
      const cleanUserEmail = cleanEmail(email);
      const cleanRole = String(role || "admin").trim();
      const cleanDisplayName = String(displayName || "").trim();
      const tempPassword = String(password || "").trim() || generateTemporaryPassword();

      if (!cleanUserEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanUserEmail)) {
        return res.status(400).json({ success: false, error: "Email invalide" });
      }
      if (!validInternalRole(cleanRole)) {
        return res.status(400).json({ success: false, error: "Rôle interne invalide" });
      }
      if (cleanRole !== "superAdmin" && !(await admin.firestore().collection("roles").doc(cleanRole).get()).exists) {
        return res.status(400).json({ success: false, error: "Ce rôle n’existe pas" });
      }
      if (tempPassword.length < 8) {
        return res.status(400).json({ success: false, error: "Mot de passe trop court" });
      }

      let authUser = null;
      try {
        authUser = await admin.auth().getUserByEmail(cleanUserEmail);
        authUser = await admin.auth().updateUser(authUser.uid, {
          password: tempPassword,
          displayName: cleanDisplayName || authUser.displayName || cleanUserEmail,
          disabled: Boolean(disabled),
        });
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        authUser = await admin.auth().createUser({
          email: cleanUserEmail,
          password: tempPassword,
          displayName: cleanDisplayName || cleanUserEmail,
          disabled: Boolean(disabled),
        });
      }

      const superAdmin = cleanRole === "superAdmin";
      await admin.auth().setCustomUserClaims(authUser.uid, {
        role: cleanRole,
        superAdmin,
      });

      const now = admin.firestore.FieldValue.serverTimestamp();
      await admin.firestore().collection("users").doc(authUser.uid).set(
        {
          email: cleanUserEmail,
          displayName: cleanDisplayName || authUser.displayName || cleanUserEmail,
          role: cleanRole,
          superAdmin,
          disabled: Boolean(disabled),
          permissions: cleanPermissions(permissions),
          accessType: "internal",
          createdBy: adminUser.uid,
          createdByName: adminUser.displayName || "",
          createdByEmail: adminUser.email || "",
          updatedBy: adminUser.uid,
          updatedByName: adminUser.displayName || "",
          updatedByEmail: adminUser.email || "",
          updatedAt: now,
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        uid: authUser.uid,
        email: cleanUserEmail,
        temporaryPassword: tempPassword,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "Erreur création accès interne" });
    }
  })
);

exports.updateUserAccess = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      const adminUser = await requireSuperAdmin(req);
      const { uid, role, permissions = [], disabled = false, displayName = "" } = req.body || {};
      const cleanUid = String(uid || "").trim();
      const cleanRole = String(role || "").trim();
      const cleanDisplayName = String(displayName || "").trim();

      if (!cleanUid) {
        return res.status(400).json({ success: false, error: "uid requis" });
      }
      if (cleanRole !== "client" && !validInternalRole(cleanRole)) {
        return res.status(400).json({ success: false, error: "Rôle invalide" });
      }
      if (cleanRole !== "client" && cleanRole !== "superAdmin" && !(await admin.firestore().collection("roles").doc(cleanRole).get()).exists) {
        return res.status(400).json({ success: false, error: "Ce rôle n’existe pas" });
      }

      const isClient = cleanRole === "client";
      const superAdmin = cleanRole === "superAdmin";
      const userRef = admin.firestore().collection("users").doc(cleanUid);
      const userSnap = await userRef.get();
      const existingUserData = userSnap.exists ? userSnap.data() || {} : {};
      const existingClientId = String(existingUserData.clientId || "").trim();
      const updateAuth = { disabled: Boolean(disabled) };
      if (cleanDisplayName) updateAuth.displayName = cleanDisplayName;

      await admin.auth().updateUser(cleanUid, updateAuth);
      await admin.auth().setCustomUserClaims(cleanUid, isClient ? { role: "client", clientId: existingClientId } : {
        role: cleanRole,
        superAdmin,
      });

      await userRef.set(
        {
          role: cleanRole,
          superAdmin,
          disabled: Boolean(disabled),
          displayName: cleanDisplayName,
          permissions: isClient || superAdmin ? [] : cleanPermissions(permissions),
          accessType: isClient ? "client" : "internal",
          updatedBy: adminUser.uid,
          updatedByName: adminUser.displayName || "",
          updatedByEmail: adminUser.email || "",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "Erreur mise à jour accès" });
    }
  })
);

exports.listApplicationUsers = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      await requireSuperAdmin(req);
      const usersSnap = await admin.firestore().collection("users").get();
      const userDocs = new Map(usersSnap.docs.map((docSnap) => [docSnap.id, { id: docSnap.id, ...docSnap.data() }]));
      const authUsers = [];
      let pageToken;

      do {
        const page = await admin.auth().listUsers(1000, pageToken);
        page.users.forEach((authUser) => {
          const userDoc = userDocs.get(authUser.uid) || {};
          const role = userDoc.role || authUser.customClaims?.role || "admin";
          authUsers.push({
            id: authUser.uid,
            email: userDoc.email || authUser.email || "",
            displayName: userDoc.displayName || authUser.displayName || "",
            role,
            superAdmin: userDoc.superAdmin === true || authUser.customClaims?.superAdmin === true || role === "superAdmin",
            disabled: authUser.disabled === true || userDoc.disabled === true,
            permissions: Array.isArray(userDoc.permissions) ? userDoc.permissions : [],
            accessType: userDoc.accessType || (role === "client" ? "client" : "internal"),
            clientId: userDoc.clientId || authUser.customClaims?.clientId || "",
            authOnly: !userDocs.has(authUser.uid),
          });
        });
        pageToken = page.pageToken;
      } while (pageToken);

      return res.status(200).json({ success: true, users: authUsers });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "Erreur liste utilisateurs" });
    }
  })
);

exports.deleteClientAccount = onRequest(
  { cors: true },
  withCors(async (req, res) => {
    try {
      await requireSuperAdmin(req);
      const { clientId, deleteAuth = true, deleteEnlevements = false } = req.body || {};
      const cleanClientId = String(clientId || "").trim();

      if (!cleanClientId) {
        return res.status(400).json({ success: false, error: "clientId requis" });
      }

      const db = admin.firestore();
      const clientRef = db.collection("clients").doc(cleanClientId);
      const customerRef = db.collection("customers").doc(cleanClientId);
      const [clientSnap, customerSnap] = await Promise.all([clientRef.get(), customerRef.get()]);
      const clientData = clientSnap.exists ? clientSnap.data() || {} : {};
      const authUid = String(clientData.authUid || "").trim();

      const batch = db.batch();
      if (clientSnap.exists) batch.delete(clientRef);
      if (customerSnap.exists) batch.delete(customerRef);

      if (deleteEnlevements) {
        const enlevementsSnap = await db.collection("enlevements").where("customerId", "==", cleanClientId).get();
        enlevementsSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      }

      if (authUid) {
        batch.delete(db.collection("users").doc(authUid));
      }

      await batch.commit();

      if (deleteAuth && authUid) {
        await admin.auth().deleteUser(authUid).catch((error) => {
          if (error.code !== "auth/user-not-found") throw error;
        });
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "Erreur suppression client" });
    }
  })
);

exports.calculateDriverRoute = onRequest(
  { },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { start, stops, mode } = req.body || {};
      const startPoint = validateCoordinatePair("Point de départ", start);
      const selectedStops = Array.isArray(stops) ? stops.slice(0, 25) : [];
      const routeMode = mode === "pointsOnly" ? "pointsOnly" : "route";

      if (!selectedStops.length) {
        return res.status(400).json({ success: false, error: "Sélectionne au moins un point de ramassage" });
      }

      const geocodedStops = await Promise.all(
        selectedStops.map(async (stop, index) => {
          const address = String(stop?.address || "").trim();
          if (!address) {
            throw new Error(`Adresse manquante pour le point ${index + 1}`);
          }

          const coordinates = await geocodeWithOpenRouteService(address);
          return {
            id: String(stop?.id || `stop-${index}`),
            clientName: String(stop?.clientName || "Client"),
            senderName: String(stop?.senderName || ""),
            address,
            destination: String(stop?.destination || ""),
            reservationDate: String(stop?.reservationDate || ""),
            reservationTime: String(stop?.reservationTime || ""),
            colis: Number(stop?.colis || 0),
            status: String(stop?.status || ""),
            coordinates,
          };
        })
      );

      const orderedStops = sortStopsByNearest(startPoint, geocodedStops);
      const stopCoordinates = orderedStops.reduce((acc, stop) => {
        acc[stop.id] = stop.coordinates;
        return acc;
      }, {});

      if (routeMode === "pointsOnly") {
        return res.status(200).json({
          success: true,
          mode: routeMode,
          orderedStops,
          stopCoordinates,
          summary: null,
          geometry: [],
        });
      }

      const coordinates = [
        [startPoint.lon, startPoint.lat],
        ...orderedStops.map((stop) => [stop.coordinates.lon, stop.coordinates.lat]),
      ];

      const route = await getDirectionsWithOpenRouteService(coordinates);

      return res.status(200).json({
        success: true,
        mode: routeMode,
        orderedStops,
        stopCoordinates,
        summary: route.summary,
        geometry: route.geometry,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "error" });
    }
  })
);

exports.searchMscTracking = onRequest(
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const payload = req.body || {};
      const result = await callJsonCargoTracking({
        shippingLine: payload.shippingLine,
        carrierBookingReference: payload.carrierBookingReference,
        transportDocumentReference: payload.transportDocumentReference,
        equipmentReference: payload.equipmentReference,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        success: false,
        error: e.message || "Recherche conteneur impossible",
      });
    }
  })
);

exports.sendInvoiceBySMS = onRequest(
  { },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { invoiceId } = req.body || {};
      const iid = String(invoiceId || "").trim();

      if (!iid) {
        return res.status(400).json({ success: false, error: "invoiceId required" });
      }

      const db = admin.firestore();
      const invoiceRef = db.collection("invoices").doc(iid);
      const invoiceSnap = await invoiceRef.get();

      if (!invoiceSnap.exists) {
        return res.status(404).json({ success: false, error: "Facture introuvable" });
      }

      const inv = invoiceSnap.data() || {};
      const phone = inv?.client?.phone;

      if (!phone) {
        return res.status(400).json({ success: false, error: "Téléphone client manquant" });
      }

      const body = buildInvoiceSmsMessage(inv);
      const sms = await sendSMS(phone, body);

      await invoiceRef.update({
        smsSentAt: admin.firestore.FieldValue.serverTimestamp(),
        smsSid: sms.sid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        sid: sms.sid,
        to: cleanPhone(phone),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        success: false,
        error: e.message || "error",
      });
    }
  })
);

exports.sendInvoiceReminderSMS = onRequest(
  { },
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { invoiceId } = req.body || {};
      const iid = String(invoiceId || "").trim();

      if (!iid) {
        return res.status(400).json({ success: false, error: "invoiceId required" });
      }

      const db = admin.firestore();
      const invoiceRef = db.collection("invoices").doc(iid);
      const invoiceSnap = await invoiceRef.get();

      if (!invoiceSnap.exists) {
        return res.status(404).json({ success: false, error: "Facture introuvable" });
      }

      const inv = invoiceSnap.data() || {};
      const phone = inv?.client?.phone;
      const due = Number(inv?.totals?.due || 0);

      if (!phone) {
        return res.status(400).json({ success: false, error: "Téléphone client manquant" });
      }

      if (due <= 0) {
        return res.status(400).json({ success: false, error: "Cette facture est déjà soldée" });
      }

      const body = buildInvoiceReminderSmsMessage(inv);
      const sms = await sendSMS(phone, body);

      await invoiceRef.update({
        lastReminderAt: admin.firestore.FieldValue.serverTimestamp(),
        reminderCount: Number(inv.reminderCount || 0) + 1,
        reminderSmsSid: sms.sid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        sid: sms.sid,
        to: cleanPhone(phone),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        success: false,
        error: e.message || "error",
      });
    }
  })
);

/* =========================
   ✅ CLOSE CONTRACT
========================= */
exports.closeContract = onRequest(
  withCors(async (req, res) => {
    try {
      const user = await requireAuth(req);

      const { contractId, reason } = req.body || {};
      const cid = String(contractId || "").trim();
      if (!cid) return res.status(400).json({ success: false, error: "contractId required" });

      const db = admin.firestore();
      const contractRef = db.collection("contracts").doc(cid);

      const out = await db.runTransaction(async (tx) => {
        const contractSnap = await tx.get(contractRef);
        if (!contractSnap.exists) throw new Error("Contrat introuvable");

        const contract = contractSnap.data() || {};
        const boxId = contract.boxId ? String(contract.boxId) : null;

        let boxSnap = null;
        if (boxId) {
          boxSnap = await tx.get(db.collection("boxes").doc(boxId));
        }

        tx.update(contractRef, {
          status: "terminated",
          endedAt: admin.firestore.FieldValue.serverTimestamp(),
          endedReason: String(reason || "manual"),
          endedBy: user.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (boxSnap && boxSnap.exists) {
          const box = boxSnap.data() || {};
          if (String(box.currentContractId || "") === cid) {
            tx.update(boxSnap.ref, {
              status: "available",
              currentContractId: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        return { contractId: cid, boxId };
      });

      return res.status(200).json({ success: true, result: out });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "error" });
    }
  })
);

/* =========================
   ✅ DELETE BOX SAFE
========================= */
exports.deleteBoxSafe = onRequest(
  withCors(async (req, res) => {
    try {
      await requireAuth(req);

      const { boxId } = req.body || {};
      const bid = String(boxId || "").trim();
      if (!bid) return res.status(400).json({ success: false, error: "boxId required" });

      const db = admin.firestore();
      const boxRef = db.collection("boxes").doc(bid);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(boxRef);
        if (!snap.exists) throw new Error("Box introuvable");

        const box = snap.data() || {};
        const status = String(box.status || "").toLowerCase();
        const currentContractId = box.currentContractId ? String(box.currentContractId) : "";

        if (status === "rented" || currentContractId) {
          throw new Error("Impossible: box loué / contrat actif. Clôture le contrat d’abord.");
        }

        tx.delete(boxRef);
      });

      return res.status(200).json({ success: true, result: { boxId: bid } });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: e.message || "error" });
    }
  })
);
