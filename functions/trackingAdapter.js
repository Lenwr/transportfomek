"use strict";

const STATUS_MAP = [
  [/annul|cancel|supprim|archive/, "CANCELLED"],
  [/livr/, "DELIVERED"],
  [/retrait|disponible|arriv/, "READY_FOR_PICKUP"],
  [/transit|expedi|envoye|route|vol/, "IN_TRANSIT"],
  [/charg|conteneur|attribue/, "LOADED"],
  [/reception|recu|depose/, "RECEIVED"],
  [/attente|pending|nouveau/, "PENDING"],
];

function clean(value, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function toIso(value) {
  if (!value) return null;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapAaronStatus(value) {
  if (value === true) return "DELIVERED";
  if (value === false || value === null || value === undefined || value === "") return "PENDING";
  const normalized = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return STATUS_MAP.find(([pattern]) => pattern.test(normalized))?.[1] || "PENDING";
}

function packageStatus(item, fallback) {
  const details = Array.isArray(item?.details) ? item.details : [];
  const statuses = details.map((detail) => mapAaronStatus(detail?.statutColis));
  if (!statuses.length) return mapAaronStatus(item?.statutColis || fallback);

  const rank = ["CANCELLED", "PENDING", "RECEIVED", "LOADED", "IN_TRANSIT", "READY_FOR_PICKUP", "DELIVERED"];
  return statuses.sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0];
}

function event(status, occurredAt, label, location = "") {
  const date = toIso(occurredAt);
  return date ? { status, occurredAt: date, label, location: clean(location) } : null;
}

function normalizeAaronEnlevement(source, sourceId) {
  const trackingNumber = clean(source?.numero || source?.numeroSuivi || source?.trackingNumber, 80);
  if (!trackingNumber) throw new Error(`Numéro de suivi manquant pour enlevements/${sourceId}`);

  const sourceStatus = mapAaronStatus(source?.deliveryStatus || source?.statutColis);
  const packages = (Array.isArray(source?.colis) ? source.colis : []).map((item, index) => ({
    id: clean(item?.id || `${sourceId}-${index + 1}`, 80),
    label: clean(item?.nom || item?.description || `Colis ${index + 1}`),
    quantity: Math.max(1, Number(item?.quantite) || 1),
    weightKg: Math.max(0, Number(item?.poids || item?.weight || 0)) || null,
    status: packageStatus(item, sourceStatus),
  }));
  const progressRank = ["CANCELLED", "PENDING", "RECEIVED", "LOADED", "IN_TRANSIT", "READY_FOR_PICKUP", "DELIVERED"];
  const leastAdvancedPackageStatus = packages
    .map((item) => item.status)
    .filter((value) => value !== "CANCELLED")
    .sort((a, b) => progressRank.indexOf(a) - progressRank.indexOf(b))[0];
  const overallStatus = leastAdvancedPackageStatus
    && progressRank.indexOf(leastAdvancedPackageStatus) > progressRank.indexOf(sourceStatus)
    ? leastAdvancedPackageStatus
    : sourceStatus;

  const events = [
    event("RECEIVED", source?.date || source?.createdAt, "Colis réceptionné"),
    event("LOADED", source?.preparationDate, "Colis chargé"),
    event("IN_TRANSIT", source?.transitDate || source?.shippingDate, "Colis en transit", source?.destination),
    event("READY_FOR_PICKUP", source?.availableAt, "Disponible pour retrait", source?.destination),
    event("DELIVERED", source?.deliveryDate || source?.deliveredAt, "Colis livré", source?.destination),
  ].filter(Boolean);

  return {
    schemaVersion: 1,
    trackingNumber,
    company: {
      slug: process.env.TRACKING_COMPANY_SLUG || "transport-fomek",
      name: process.env.TRACKING_COMPANY_NAME || "SAS Transport Fomek",
    },
    shipment: {
      status: overallStatus,
      origin: clean(source?.origine || source?.origin || "France"),
      destination: clean(source?.destination),
      service: clean(source?.typeDeFret),
      estimatedDeliveryAt: toIso(source?.estimatedDeliveryAt),
    },
    sender: { name: clean(source?.expediteur), city: "", country: "" },
    recipient: { name: clean(source?.destinataire), city: clean(source?.destination), country: "" },
    packages,
    events,
    archived: source?.archived === true || source?.active === false || source?.isActive === false,
    revoked: source?.revoked === true,
    createdAt: toIso(source?.createdAt || source?.date),
  };
}

module.exports = { mapAaronStatus, normalizeAaronEnlevement };
