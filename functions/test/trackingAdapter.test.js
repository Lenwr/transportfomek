"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapAaronStatus, normalizeAaronEnlevement } = require("../trackingAdapter");

test("convertit les statuts Aaron vers les codes universels", () => {
  assert.equal(mapAaronStatus("En attente"), "PENDING");
  assert.equal(mapAaronStatus("réceptionné"), "RECEIVED");
  assert.equal(mapAaronStatus("Attribué au vol"), "IN_TRANSIT");
  assert.equal(mapAaronStatus("Disponible pour retrait"), "READY_FOR_PICKUP");
  assert.equal(mapAaronStatus("Livré"), "DELIVERED");
});

test("normalise un enlèvement sans publier prix, paiement, téléphone, adresse ou image", () => {
  const payload = normalizeAaronEnlevement({
    numero: "COLIS-260730-142530-123",
    expediteur: "Alice",
    telephoneExpediteur: "secret",
    adresseExpediteur: "secret",
    destinataire: "Bob",
    telephoneDestinataire: "secret",
    prix: 120,
    resteAPayer: 20,
    image: ["secret"],
    destination: "Lomé",
    typeDeFret: "Maritime",
    deliveryStatus: "En transit",
    colis: [{ nom: "Carton", quantite: 2, poids: 10, statutColis: "Chargé" }],
    createdAt: "2026-07-30T10:00:00Z",
  }, "source-id");

  assert.equal(payload.shipment.status, "IN_TRANSIT");
  assert.equal(payload.packages[0].quantity, 2);
  assert.equal(payload.sender.name, "Alice");
  assert.equal(payload.prix, undefined);
  assert.equal(payload.telephoneDestinataire, undefined);
  assert.equal(payload.image, undefined);
});

test("archive automatiquement une source désactivée", () => {
  const payload = normalizeAaronEnlevement({
    numero: "COLIS-260730-142530-123",
    active: false,
  }, "source-id");
  assert.equal(payload.archived, true);
});

test("considère le dossier réceptionné quand ses colis le sont déjà", () => {
  const payload = normalizeAaronEnlevement({
    numero: "COLIS-260730-142530-123",
    deliveryStatus: "En attente",
    colis: [{ nom: "Carton", statutColis: "réceptionné" }],
  }, "source-id");

  assert.equal(payload.shipment.status, "RECEIVED");
  assert.equal(payload.packages[0].status, "RECEIVED");
});
