<script setup>
import { toast } from "vue3-toastify";
import "vue3-toastify/dist/index.css";

import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
  runTransaction
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import { ref, watch, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/useAuthStore";
import { logActivity } from "../utils/activityLog";
import DestinationSelect from "../components/DestinationSelect.vue";

const props = defineProps({
  myId: String,
  expediteurData: Object,
  mode: { type: String, default: "create" },
  docId: { type: String, default: "" },
  initialData: { type: Object, default: () => ({}) },
  embedded: { type: Boolean, default: false },
  publicClientMode: { type: Boolean, default: false },
  disableDictation: { type: Boolean, default: false },
  pickupInviteId: { type: String, default: "" }
});

const emit = defineEmits(["saved"]);
const isEdit = computed(() => props.mode === "edit");
const router = useRouter();
const authStore = useAuthStore();
const isPublicClientMode = computed(() => props.publicClientMode);
const canUseDictation = computed(() => authStore.isSuperAdmin && !isPublicClientMode.value && !props.disableDictation);
const formGridClass = computed(() =>
  props.embedded || isPublicClientMode.value
    ? "grid min-w-0 gap-6"
    : "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
);

const db = getFirestore();
const enlevementsCollection = collection(db, "enlevements");
const pickupRequestsCollection = collection(db, "pickupRequests");
const storage = getStorage();

const catalogLoading = ref(false);
const catalogItems = ref([]);
const customerDirectory = ref([]);
const activeCustomerSearch = ref("");
const isSubmitting = ref(false);
const PUBLIC_FORM_COOLDOWN_MS = 30 * 60 * 1000;

const loadCatalogItems = async () => {
  try {
    catalogLoading.value = true;
    const col = collection(db, "pricingCatalog", "active", "items");
    const snap = await getDocs(col);
    catalogItems.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => item.isActive !== false)
      .sort((a, b) =>
        (Number(a.sort) || 100) - (Number(b.sort) || 100) ||
        String(a.label || "").localeCompare(String(b.label || ""), "fr")
      );
  } catch (e) {
    console.error("Catalogue indisponible", e);
    toast("Impossible de charger le catalogue. Vérifie les droits Firebase.", {
      type: "error",
      autoClose: 2500
    });
    catalogItems.value = [];
  } finally {
    catalogLoading.value = false;
  }
};

const articleOptions = computed(() =>
  (catalogItems.value || []).map((it) => it.label).filter(Boolean)
);

const normalize = (s = "") =>
  s.toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const toTypeKey = (label = "") =>
  normalize(label).replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");

const isPublicGenericForm = computed(() =>
  !authStore.isLoggedIn && !isPublicClientMode.value && !isEdit.value
);

const publicSubmissionLockId = (phone = "") =>
  String(phone || "").replace(/\D/g, "");

const assertPublicGenericFormAllowed = async () => {
  if (!isPublicGenericForm.value) return;

  const phoneKey = publicSubmissionLockId(customer.value.telephoneExpediteur);
  if (!phoneKey) {
    throw new Error("Téléphone expéditeur obligatoire pour envoyer le formulaire.");
  }

  await runTransaction(db, async (transaction) => {
    const lockRef = doc(db, "publicSubmissionLocks", phoneKey);
    const lockSnap = await transaction.get(lockRef);
    const nowMs = Date.now();
    const lastSubmittedAtMs = Number(lockSnap.data()?.lastSubmittedAtMs || 0);
    const remainingMs = PUBLIC_FORM_COOLDOWN_MS - (nowMs - lastSubmittedAtMs);

    if (remainingMs > 0) {
      const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
      throw new Error(`Ce numéro a déjà envoyé un formulaire récemment. Réessaie dans ${minutes} min.`);
    }

    transaction.set(lockRef, {
      phoneKey,
      lastSubmittedAtMs: nowMs,
      lastSubmittedAt: serverTimestamp()
    }, { merge: true });
  });
};

const matchOption = (input = "") => {
  const n = normalize(input);
  const found = (catalogItems.value || []).find((it) => normalize(it.label) === n);
  return found?.label || input;
};

const genererNumeroSuivi = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  const yy = String(now.getFullYear()).slice(-2);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");

  return `COLIS-${yy}${mm}${dd}-${hh}${mi}${ss}-${rand}`;
};

const customer = ref({
  numeroExpediteur: "",
  expediteur: "",
  statut: "",
  telephoneExpediteur: "",
  adresseExpediteur: "",
  destinataire: "",
  telephoneDestinataire: "",
  telephoneDestinataireWhatsapp: "",
  typeDeFret: "",
  destination: "",
  prix: "",
  montantPaye: "",
  modeDePaiement: "",
  resteAPayer: "",
  date: "",
  image: []
});
const destinationCallingCodes = [
  { code: "+237", label: "Cameroun" },
  { code: "+33", label: "France" },
  { code: "+241", label: "Gabon" },
  { code: "+242", label: "Congo" },
  { code: "+243", label: "RD Congo" },
  { code: "+236", label: "Centrafrique" },
  { code: "+235", label: "Tchad" },
  { code: "+240", label: "Guinée équatoriale" },
  { code: "+225", label: "Côte d’Ivoire" },
  { code: "+221", label: "Sénégal" },
  { code: "+223", label: "Mali" },
  { code: "+234", label: "Nigeria" },
  { code: "+32", label: "Belgique" },
  { code: "+49", label: "Allemagne" },
  { code: "+44", label: "Royaume-Uni" },
  { code: "+1", label: "USA / Canada" },
];
const destinationDirectCode = ref("+237");
const destinationWhatsappCode = ref("+237");
const withCallingCode = (value, callingCode) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  if (raw.startsWith("00")) return `+${raw.slice(2).replace(/\D/g, "")}`;
  const localDigits = raw.replace(/\D/g, "").replace(/^0/, "");
  return localDigits ? `${callingCode}${localDigits}` : "";
};
const selectedCustomerId = ref("");
const selectedClientNumber = ref("");

const fillFromCustomer = (client) => {
  selectedCustomerId.value = client.id || "";
  selectedClientNumber.value = client.numeroClient || "";
  customer.value.numeroExpediteur = client.numeroClient || "";
  customer.value.expediteur = `${client.nom || ""} ${client.prenom || ""}`.trim();
  customer.value.telephoneExpediteur = client.telephone || client.phone || "";
  customer.value.adresseExpediteur = [
    client.adresse || client.adresseComplete || "",
    client.codePostal || "",
    client.ville || ""
  ].filter(Boolean).join(", ");
  toast(`Client ${client.numeroClient || ""} sélectionné`, { type: "success", autoClose: 1000 });
  activeCustomerSearch.value = "";
};

const customerSuggestions = computed(() => {
  const raw = activeCustomerSearch.value === "number"
    ? customer.value.numeroExpediteur
    : customer.value.expediteur;
  const terms = normalize(raw).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return customerDirectory.value.filter((client) => {
    const searchable = normalize(`${client.numeroClient || ""} ${client.nom || ""} ${client.prenom || ""} ${client.telephone || ""}`);
    return terms.every((term) => searchable.includes(term));
  }).slice(0, 8);
});

const startCustomerSearch = (field) => {
  activeCustomerSearch.value = field;
  selectedCustomerId.value = "";
  selectedClientNumber.value = "";
};

const loadCustomerDirectory = async () => {
  try {
    const snap = await getDocs(collection(db, "customers"));
    customerDirectory.value = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    console.warn("Répertoire clients indisponible", error);
  }
};

const emptyPackage = () => ({ nom: "", quantite: 1, statutColis: "réceptionné", customArticle: false });
const colisList = ref([emptyPackage()]);

const selectCatalogArticle = (colis, value) => {
  if (value === "__custom__") {
    colis.nom = "";
    colis.customArticle = true;
  } else {
    colis.nom = value;
    colis.customArticle = false;
  }
};
const existingImageUrls = ref([]);

const totalPackages = computed(() =>
  colisList.value.reduce((sum, colis) => sum + (Number(colis.quantite) || 0), 0)
);

const priceManuallyEdited = ref(false);
const destinationKey = (value = "") =>
  normalize(value).replace(/[^a-z0-9]/g, "").toUpperCase();

const suggestedPricing = computed(() => {
  const destination = destinationKey(customer.value.destination);
  let total = 0;
  let pricedLines = 0;
  let unpricedLines = 0;

  for (const colis of colisList.value) {
    if (!colis.nom) continue;
    const article = catalogItems.value.find((item) => normalize(item.label) === normalize(colis.nom));
    if (!article) {
      unpricedLines += 1;
      continue;
    }
    if (article.pricingType === "PER_INCH_BY_DESTINATION") {
      unpricedLines += 1;
      continue;
    }

    const prices = article.pricesByDestination || {};
    const priceEntry = Object.entries(prices).find(([key]) => destinationKey(key) === destination);
    const unitPrice = Number(priceEntry?.[1]);
    if (!destination || !priceEntry || !Number.isFinite(unitPrice)) {
      unpricedLines += 1;
      continue;
    }

    total += unitPrice * (Number(colis.quantite) || 1);
    pricedLines += 1;
  }

  return { total, pricedLines, unpricedLines };
});

watch(
  () => suggestedPricing.value.total,
  (total) => {
    if (!isEdit.value && !priceManuallyEdited.value && suggestedPricing.value.pricedLines > 0) {
      customer.value.prix = String(total);
    }
  }
);

const markPriceAsEdited = () => {
  priceManuallyEdited.value = true;
};

const applyCatalogPrice = () => {
  customer.value.prix = String(suggestedPricing.value.total);
  priceManuallyEdited.value = false;
};

const amountNumber = (value) => {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

watch(
  () => [customer.value.prix, customer.value.montantPaye],
  ([totalValue, paidValue]) => {
    if (totalValue === "" || totalValue === null || totalValue === undefined) {
      customer.value.resteAPayer = "";
      return;
    }
    const total = amountNumber(totalValue);
    const paid = Math.min(amountNumber(paidValue), total);
    const due = Math.max(0, total - paid);
    customer.value.resteAPayer = String(Number(due.toFixed(2)));
    customer.value.statut = paid <= 0 ? "Non Payé" : due > 0 ? "Acompte" : "Payé";
  }
);

watch(
  () => customer.value.statut,
  (status) => {
    if (status !== "Payé") return;
    const total = amountNumber(customer.value.prix);
    customer.value.montantPaye = String(Number(total.toFixed(2)));
    customer.value.resteAPayer = "0";
  }
);

const requiredFields = computed(() => [
  { key: "date", label: "Date", value: customer.value.date },
  { key: "expediteur", label: "Expéditeur", value: customer.value.expediteur },
  { key: "destinataire", label: "Destinataire", value: customer.value.destinataire },
  { key: "destination", label: "Destination", value: customer.value.destination },
]);

const missingFields = computed(() =>
  requiredFields.value.filter((field) => !String(field.value || "").trim())
);

const formProgress = computed(() => {
  const completed = requiredFields.value.length - missingFields.value.length;
  return Math.round((completed / requiredFields.value.length) * 100);
});

const countsPreview = computed(() => {
  const map = new Map();

  for (const c of colisList.value) {
    if (!c.nom || !c.quantite) continue;
    const label = matchOption(c.nom);
    const key = toTypeKey(label);
    const item = map.get(key) || { label, key, qty: 0 };
    item.qty += Number(c.quantite) || 0;
    map.set(key, item);
  }

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
});

const splitFullName = (value = "") => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { prenom: "", nom: "" };
  if (parts.length === 1) return { prenom: parts[0], nom: "" };
  return {
    prenom: parts[0],
    nom: parts.slice(1).join(" "),
  };
};

watch(
  () => props.expediteurData,
  (v) => {
    if (isEdit.value) return;
    if (!v) return;

    const nom = v.nom || "";
    const prenom = v.prenom || "";
    const phone = v.telephone || v.phone || "";
    const address = v.adresse || v.adresseComplete || v.address || "";

    customer.value.expediteur = v.displayName || `${prenom} ${nom}`.trim() || `${nom} ${prenom}`.trim();
    customer.value.telephoneExpediteur = phone;
    customer.value.adresseExpediteur = address;

    if (isPublicClientMode.value && !customer.value.date) {
      const now = new Date();
      const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      customer.value.date = offsetDate.toISOString().slice(0, 16);
    }
  },
  { immediate: true }
);

watch(
  () => props.initialData,
  (d) => {
    if (!isEdit.value || !d) return;

    customer.value = {
      numeroExpediteur: d.numeroClient || "",
      expediteur: d.expediteur || "",
      statut: d.statut || "",
      telephoneExpediteur: d.telephoneExpediteur || "",
      adresseExpediteur: d.adresseExpediteur || "",
      destinataire: d.destinataire || "",
      telephoneDestinataire: d.telephoneDestinataire || "",
      telephoneDestinataireWhatsapp: d.telephoneDestinataireWhatsapp || d.whatsappDestinataire || "",
      typeDeFret: d.typeDeFret || "",
      destination: d.destination || "",
      prix: d.prix || "",
      montantPaye: d.montantPaye ?? d.montantPayé ?? Math.max(0, amountNumber(d.prix) - amountNumber(d.resteAPayer)),
      modeDePaiement: d.modeDePaiement || "",
      resteAPayer: d.resteAPayer || "",
      date: d.date || "",
      image: []
    };

    existingImageUrls.value = Array.isArray(d.imageUrl) ? [...d.imageUrl] : [];

    if (Array.isArray(d.colis) && d.colis.length) {
      colisList.value = d.colis.map((g) => {
        const qty = g.quantite || (Array.isArray(g.details) ? g.details.length : 1);
        const stat =
          (Array.isArray(g.details) && g.details[0]?.statutColis) ||
          g.statutColis ||
          "réceptionné";

        return {
          nom: g.nom || g.article || "",
          quantite: Number(qty) || 1,
          statutColis: stat,
          customArticle: false
        };
      });
    } else {
      colisList.value = [emptyPackage()];
    }
  },
  { immediate: true, deep: true }
);

const ajouterColis = () => {
  colisList.value.push(emptyPackage());
};

const supprimerColis = (index) => {
  if (colisList.value.length === 1) {
    colisList.value[0] = emptyPackage();
    return;
  }
  colisList.value.splice(index, 1);
};

const handleFileChange = (event) => {
  customer.value.image = Array.from(event.target.files || []);
};

const removeExistingImage = (idx) => {
  existingImageUrls.value.splice(idx, 1);
};

const buildColis = () =>
  colisList.value
    .filter((c) => c.nom && c.quantite)
    .map((c) => {
      const label = matchOption(c.nom);
      const q = Number(c.quantite) || 1;
      const typeKey = toTypeKey(label);

      const details = Array.from({ length: q }, (_, i) => ({
        coli: `${label} ${i + 1}/${q}`,
        statutColis: c.statutColis || "réceptionné",
        type: typeKey,
        article: label
      }));

      return { nom: label, quantite: q, type: typeKey, details };
    });

const send = async () => {
  if (isSubmitting.value) return;

  try {
    if (!customer.value.date || !customer.value.expediteur || !customer.value.destinataire) {
      toast("Remplis la date, l’expéditeur et le destinataire ⚠️", { type: "warning" });
      return;
    }

    const colisData = buildColis();
    if (!colisData.length) {
      toast("Ajoute au moins 1 colis (nom + quantité) ⚠️", { type: "warning" });
      return;
    }

    isSubmitting.value = true;
    await assertPublicGenericFormAllowed();

    const uploadedNewUrls = [];
    for (const file of customer.value.image) {
      const refPath = `enlevements_images/${Date.now()}_${file.name}`;
      const imgRef = storageRef(storage, refPath);
      await uploadBytes(imgRef, file);
      uploadedNewUrls.push(await getDownloadURL(imgRef));
    }

    const finalImageUrls = isEdit.value
      ? [...existingImageUrls.value, ...uploadedNewUrls]
      : uploadedNewUrls;

    const telephoneDestinataire = withCallingCode(customer.value.telephoneDestinataire, destinationDirectCode.value);
    const telephoneDestinataireWhatsapp = withCallingCode(customer.value.telephoneDestinataireWhatsapp, destinationWhatsappCode.value);

    const payloadBase = {
      numeroClient: selectedClientNumber.value || customer.value.numeroExpediteur || "",
      expediteur: customer.value.expediteur || "",
      statut: customer.value.statut || "",
      imageUrl: finalImageUrls,
      telephoneExpediteur: customer.value.telephoneExpediteur || "",
      adresseExpediteur: customer.value.adresseExpediteur || "",
      destinataire: customer.value.destinataire || "",
      telephoneDestinataire,
      telephoneDestinataireDirect: telephoneDestinataire,
      telephoneDestinataireWhatsapp,
      typeDeFret: customer.value.typeDeFret || "",
      destination: customer.value.destination || "",
      nombreDeColis: colisData.reduce((acc, c) => acc + c.quantite, 0),
      colis: colisData,
      prix: customer.value.prix || "",
      montantTotal: customer.value.prix || "",
      montantPaye: customer.value.montantPaye || "0",
      modeDePaiement: customer.value.modeDePaiement || "",
      resteAPayer: customer.value.resteAPayer || "",
      date: customer.value.date || ""
    };

    if (isEdit.value) {
      if (!props.docId) {
        toast("ID document manquant pour l’édition ❌", { type: "error" });
        return;
      }

      const editRef = doc(db, "enlevements", props.docId);

      const numero = props.initialData?.numero || "";
      const customerId = props.initialData?.customerId || props.myId || "";
      const deliveryStatus = props.initialData?.deliveryStatus || "En attente";

      await updateDoc(editRef, {
        ...payloadBase,
        customerId,
        deliveryStatus,
        numero,
        updatedAt: serverTimestamp()
      });

      await logActivity({
        action: "enlevement_updated",
        targetType: "enlevement",
        targetId: props.docId,
        label: payloadBase.expediteur || props.docId,
        details: { destination: payloadBase.destination }
      });
      toast("Modifié ✅", { type: "success", autoClose: 1000 });
      emit("saved");
    } else {
      if (isPublicClientMode.value) {
        const name = splitFullName(customer.value.expediteur || "");
        const pickupRequestPayload = {
          clientPrenom: name.prenom,
          clientNom: name.nom,
          clientPhone: customer.value.telephoneExpediteur || "",
          clientAdresse: customer.value.adresseExpediteur || "",
          destinataire: customer.value.destinataire || "",
          telephoneDestinataire,
          telephoneDestinataireDirect: telephoneDestinataire,
          telephoneDestinataireWhatsapp,
          typeDeFret: customer.value.typeDeFret || "",
          destination: customer.value.destination || "",
          nombreDeColis: colisData.reduce((acc, c) => acc + c.quantite, 0),
          colis: colisData,
          imageUrls: finalImageUrls,
          requestedDate: customer.value.date || "",
          pickupAddress: customer.value.adresseExpediteur || "",
          status: "PENDING",
          createdFrom: "clientPickupForm",
          createdAt: serverTimestamp()
        };

        if (props.pickupInviteId) {
          let createdRequestId = "";
          await runTransaction(db, async (transaction) => {
            const inviteRef = doc(db, "pickupFormInvites", props.pickupInviteId);
            const inviteSnap = await transaction.get(inviteRef);

            if (!inviteSnap.exists()) {
              throw new Error("Ce lien de formulaire est introuvable.");
            }

            if (String(inviteSnap.data()?.status || "").toLowerCase() === "submitted") {
              throw new Error("Ce formulaire a déjà été envoyé.");
            }

            const expireAt = inviteSnap.data()?.expireAt;
            const expireDate = expireAt?.toDate ? expireAt.toDate() : expireAt ? new Date(expireAt) : null;
            if (expireDate && Number.isFinite(expireDate.getTime()) && Date.now() > expireDate.getTime()) {
              throw new Error("Ce lien de formulaire a expiré.");
            }

            const requestRef = doc(pickupRequestsCollection);
            createdRequestId = requestRef.id;
            transaction.set(requestRef, {
              ...pickupRequestPayload,
              inviteId: props.pickupInviteId
            });
            transaction.update(inviteRef, {
              status: "submitted",
              submittedAt: serverTimestamp(),
              pickupRequestId: requestRef.id
            });
          });
          await logActivity({
            action: "pickup_request_submitted",
            targetType: "pickupRequest",
            targetId: createdRequestId,
            label: customer.value.expediteur || "Client",
            details: { inviteId: props.pickupInviteId, phone: customer.value.telephoneExpediteur || "" }
          });
        } else {
          const requestRef = await addDoc(pickupRequestsCollection, pickupRequestPayload);
          await logActivity({
            action: "pickup_request_submitted",
            targetType: "pickupRequest",
            targetId: requestRef.id,
            label: customer.value.expediteur || "Client",
            details: { phone: customer.value.telephoneExpediteur || "" }
          });
        }

        toast("Demande envoyée ✅", {
          type: "success",
          autoClose: 1800
        });

        customer.value = {
          numeroExpediteur: "",
          expediteur: "",
          statut: "",
          telephoneExpediteur: "",
          adresseExpediteur: "",
          destinataire: "",
          telephoneDestinataire: "",
          telephoneDestinataireWhatsapp: "",
          typeDeFret: "",
          destination: "",
          prix: "",
          montantPaye: "",
          modeDePaiement: "",
          resteAPayer: "",
          date: "",
          image: []
        };

        colisList.value = [emptyPackage()];
        existingImageUrls.value = [];
        await router.push({ name: "soumission" });
        return;
      }

      const numeroSuivi = genererNumeroSuivi();

      const enlevementRef = await addDoc(enlevementsCollection, {
        ...payloadBase,
        numero: numeroSuivi,
        deliveryStatus: "En attente",
        customerId: selectedCustomerId.value || props.myId || "",
        numeroClient: selectedClientNumber.value || "",
        createdAt: serverTimestamp()
      });

      await logActivity({
        action: "enlevement_created",
        targetType: "enlevement",
        targetId: enlevementRef.id,
        label: `${payloadBase.expediteur || "Client"} · ${numeroSuivi}`,
        details: { destination: payloadBase.destination, numero: numeroSuivi }
      });
      toast(isPublicClientMode.value ? "Formulaire envoyé ✅" : `Formulaire envoyé ✅ | Suivi : ${numeroSuivi}`, {
        type: "success",
        autoClose: 1800
      });

      customer.value = {
        numeroExpediteur: "",
        expediteur: "",
        statut: "",
        telephoneExpediteur: "",
        adresseExpediteur: "",
        destinataire: "",
        telephoneDestinataire: "",
        telephoneDestinataireWhatsapp: "",
        typeDeFret: "",
        destination: "",
        prix: "",
        montantPaye: "",
        modeDePaiement: "",
        resteAPayer: "",
        date: "",
        image: []
      };

      colisList.value = [emptyPackage()];
      existingImageUrls.value = [];
      selectedCustomerId.value = "";
      selectedClientNumber.value = "";
      priceManuallyEdited.value = false;
    }
  } catch (error) {
    console.error("Erreur formulaire :", error);
    toast(error?.message || "Erreur lors de l'envoi ❌", { type: "error", autoClose: 1800 });
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  loadCatalogItems();
  loadCustomerDirectory();
});
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">
            {{ isPublicClientMode ? "Formulaire client" : isEdit ? "Edition" : "Nouvel enlevement" }}
          </p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">
            {{ isPublicClientMode ? "Preparer votre enlevement" : isEdit ? "Modifier l'enlevement" : "Enregistrer un enlevement" }}
          </h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {{ isPublicClientMode ? "Completez les informations avant l'arrivee du chauffeur." : "Saisie client, colis, photos et paiement dans un seul dossier exploitable pour le bordereau, les etiquettes et le suivi." }}
          </p>
        </div>

        <div v-if="!isPublicClientMode" class="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
          <div class="rounded-md bg-white px-4 py-2">
            <p class="text-xs font-medium text-slate-500">Progression</p>
            <p class="text-lg font-bold text-slate-950">{{ formProgress }}%</p>
          </div>
          <div class="rounded-md bg-white px-4 py-2">
            <p class="text-xs font-medium text-slate-500">Colis</p>
            <p class="text-lg font-bold text-slate-950">{{ totalPackages }}</p>
          </div>
          <div class="rounded-md bg-white px-4 py-2">
            <p class="text-xs font-medium text-slate-500">Photos</p>
            <p class="text-lg font-bold text-slate-950">{{ existingImageUrls.length + customer.image.length }}</p>
          </div>
        </div>
      </div>
    </div>

    <form :class="formGridClass" @submit.prevent="send">
      <div class="space-y-6">
        <div v-if="isSubmitting" class="operation-progress">
          <div class="operation-progress__label">
            <span>{{ isEdit ? "Modification en cours..." : "Envoi du formulaire en cours..." }}</span>
            <span>Patiente...</span>
          </div>
          <div class="operation-progress__track">
            <div class="operation-progress__bar"></div>
          </div>
        </div>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-bold text-slate-950">Informations principales</h3>
              <p class="mt-1 text-sm text-slate-500">Les champs qui identifient le dossier d'enlevement.</p>
            </div>
            <span class="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">Obligatoire</span>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Date</span>
              <input id="date" v-model="customer.date" required type="datetime-local" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" />
            </label>

            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Destination</span>
              <DestinationSelect v-model="customer.destination" class="mt-2" />
            </label>

            <label class="block">
              <span class="text-sm font-semibold text-slate-700">Type de fret</span>
              <select id="typeDeFret" v-model="customer.typeDeFret" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
                <option value="">Choisir un type</option>
                <option>Maritime</option>
                <option>Aerien</option>
              </select>
            </label>

            <label v-if="!isPublicClientMode" class="block">
              <span class="text-sm font-semibold text-slate-700">Statut paiement</span>
              <select id="statut" v-model="customer.statut" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
                <option value="">Choisir un statut</option>
                <option>Non Payé</option>
                <option>Acompte</option>
                <option>Payé</option>
              </select>
            </label>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-bold text-slate-950">Expediteur et destinataire</h3>
          <div class="mt-5 grid gap-5 lg:grid-cols-2">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-bold uppercase tracking-wide text-slate-500">Expediteur</p>
              <div class="mt-4 space-y-4">
                <label class="relative block">
                  <span class="text-sm font-semibold text-slate-700">Nom complet</span>
                  <input id="expediteur" v-model="customer.expediteur" autocomplete="off" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Nom et prenoms" @focus="activeCustomerSearch = 'name'" @input="startCustomerSearch('name')" @blur="activeCustomerSearch = ''" />
                  <div v-if="!isPublicClientMode && activeCustomerSearch === 'name' && customerSuggestions.length" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                    <button v-for="client in customerSuggestions" :key="client.id" type="button" class="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-cyan-50" @mousedown.prevent="fillFromCustomer(client)">
                      <span><span class="block font-semibold text-slate-900">{{ client.nom }} {{ client.prenom }}</span><span class="block text-xs text-slate-500">{{ client.telephone || 'Sans téléphone' }}</span></span>
                      <span class="shrink-0 text-xs font-bold text-cyan-800">{{ client.numeroClient || 'Sans n°' }}</span>
                    </button>
                  </div>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold text-slate-700">Telephone</span>
                  <input id="telephoneExpediteur" v-model="customer.telephoneExpediteur" type="tel" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="+33..." />
                </label>
                <label class="block">
                  <span class="text-sm font-semibold text-slate-700">Adresse d'enlevement</span>
                  <input id="adresseExpediteur" v-model="customer.adresseExpediteur" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Adresse complete" />
                </label>
              </div>
            </div>

            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p class="text-sm font-bold uppercase tracking-wide text-slate-500">Destinataire</p>
              <div class="mt-4 space-y-4">
                <label class="block">
                  <span class="text-sm font-semibold text-slate-700">Nom complet</span>
                  <input id="destinataire" v-model="customer.destinataire" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Nom et prenoms" />
                </label>
                <label class="block">
                  <span class="text-sm font-semibold text-slate-700">Telephone direct</span>
                  <div class="mt-2 flex min-w-0 gap-2">
                    <select v-model="destinationDirectCode" aria-label="Indicatif téléphone direct" class="h-11 w-36 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
                      <option v-for="country in destinationCallingCodes" :key="country.code" :value="country.code">{{ country.code }} · {{ country.label }}</option>
                    </select>
                    <input id="telephoneDestinataire" v-model="customer.telephoneDestinataire" type="tel" class="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Numéro direct" />
                  </div>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold text-slate-700">WhatsApp</span>
                  <div class="mt-2 flex min-w-0 gap-2">
                    <select v-model="destinationWhatsappCode" aria-label="Indicatif WhatsApp" class="h-11 w-36 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
                      <option v-for="country in destinationCallingCodes" :key="country.code" :value="country.code">{{ country.code }} · {{ country.label }}</option>
                    </select>
                    <input id="telephoneDestinataireWhatsapp" v-model="customer.telephoneDestinataireWhatsapp" type="tel" class="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Numéro WhatsApp" />
                  </div>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 class="text-lg font-bold text-slate-950">Colis</h3>
              <p class="mt-1 text-sm text-slate-500">Sélectionne les articles du catalogue et leurs quantités. Les détails seront générés pour les QR codes.</p>
            </div>
            <button type="button" class="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-cyan-800" @click="ajouterColis">
              Ajouter un colis
            </button>
          </div>

          <p v-if="catalogLoading" class="mt-3 text-xs font-medium text-slate-500">Chargement des articles...</p>
          <p v-else-if="!articleOptions.length" class="mt-3 text-xs font-medium text-slate-500">Aucun article actif dans le catalogue.</p>

          <div class="mt-5 space-y-3">
            <div v-for="(colis, index) in colisList" :key="index" class="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[90px_minmax(0,1fr)_44px]">
              <label class="block">
                <span class="text-xs font-bold uppercase tracking-wide text-slate-400">Qte</span>
                <input v-model.number="colis.quantite" type="number" min="1" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-center text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" />
              </label>
              <label class="block">
                <span class="text-xs font-bold uppercase tracking-wide text-slate-400">Article du catalogue</span>
                <select v-if="articleOptions.length && !colis.customArticle" :value="colis.nom" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" @change="selectCatalogArticle(colis, $event.target.value)">
                  <option value="">Choisir un article</option>
                  <option v-for="opt in articleOptions" :key="opt" :value="opt">{{ opt }}</option>
                  <option value="__custom__">Autre article (saisie libre)</option>
                </select>
                <div v-else class="mt-2 flex gap-2">
                  <input v-model="colis.nom" type="text" class="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Saisir le nom de l’article" />
                  <button v-if="articleOptions.length" type="button" class="rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-600" @click="colis.customArticle = false; colis.nom = ''">Catalogue</button>
                </div>
              </label>
              <button type="button" class="mt-6 h-11 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100" @click="supprimerColis(index)">
                X
              </button>
            </div>
          </div>

          <div v-if="countsPreview.length" class="mt-5 rounded-lg border border-cyan-100 bg-cyan-50 p-4">
            <p class="text-sm font-bold text-cyan-950">Apercu par article</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span v-for="i in countsPreview" :key="i.key" class="rounded-full bg-white px-3 py-1 text-sm font-semibold text-cyan-900">
                {{ i.label }} : {{ i.qty }}
              </span>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-bold text-slate-950">{{ isPublicClientMode ? "Photos" : "Photos et paiement" }}</h3>

          <div v-if="isEdit && existingImageUrls.length" class="mt-5">
            <p class="mb-2 text-sm font-semibold text-slate-700">Photos existantes</p>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div v-for="(url, idx) in existingImageUrls" :key="url" class="group relative">
                <img :src="url" alt="photo" class="h-28 w-full rounded-lg border border-slate-200 object-cover" />
                <button type="button" class="absolute right-2 top-2 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100" @click="removeExistingImage(idx)">
                  Retirer
                </button>
              </div>
            </div>
          </div>

          <div class="mt-5 grid gap-4 md:grid-cols-3">
            <label class="block md:col-span-2">
              <span class="text-sm font-semibold text-slate-700">Ajouter des photos</span>
              <input id="image" type="file" multiple accept="image/*" class="mt-2 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white" @change="handleFileChange" />
              <span class="mt-1 block text-xs text-slate-500">Laisser vide si tu ne veux pas ajouter de nouvelles photos.</span>
            </label>

            <label v-if="!isPublicClientMode" class="block">
              <span class="text-sm font-semibold text-slate-700">Prix total</span>
              <input id="prix" v-model="customer.prix" type="number" min="0" step="0.01" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="0" @input="markPriceAsEdited" />
              <span v-if="suggestedPricing.pricedLines" class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                Prix catalogue : <strong class="text-cyan-800">{{ suggestedPricing.total }} €</strong>
                <button v-if="priceManuallyEdited" type="button" class="font-bold text-cyan-700 underline" @click="applyCatalogPrice">Réappliquer</button>
              </span>
              <span v-if="suggestedPricing.unpricedLines" class="mt-1 block text-xs font-medium text-amber-700">
                {{ suggestedPricing.unpricedLines }} article(s) sans prix pour cette destination.
              </span>
            </label>

            <label v-if="!isPublicClientMode" class="block">
              <span class="text-sm font-semibold text-slate-700">Montant payé</span>
              <input id="montantPaye" v-model="customer.montantPaye" type="number" min="0" :max="amountNumber(customer.prix)" step="0.01" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="0" />
            </label>

            <label v-if="!isPublicClientMode" class="block">
              <span class="text-sm font-semibold text-slate-700">Reste à payer</span>
              <input id="resteAPayer" :value="customer.resteAPayer" type="number" readonly class="mt-2 h-11 w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm font-bold text-slate-950" placeholder="0" />
              <span class="mt-1 block text-xs text-slate-500">Calculé automatiquement.</span>
            </label>

            <label v-if="!isPublicClientMode" class="block md:col-span-3">
              <span class="text-sm font-semibold text-slate-700">Mode de paiement</span>
              <select id="modeDePaiement" v-model="customer.modeDePaiement" class="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
                <option value="">Choisir un mode</option>
                <option>Cheque</option>
                <option>Especes</option>
                <option>CB</option>
                <option>Virement</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      <aside v-if="!isPublicClientMode" class="space-y-4 xl:sticky xl:top-28 xl:self-start">
        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-base font-bold text-slate-950">Controle dossier</h3>
          <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-cyan-700 transition-all" :style="{ width: `${formProgress}%` }"></div>
          </div>

          <div class="mt-4 space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Expediteur</span>
              <span class="font-bold" :class="customer.expediteur ? 'text-green-700' : 'text-red-600'">{{ customer.expediteur ? "OK" : "Manquant" }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Destinataire</span>
              <span class="font-bold" :class="customer.destinataire ? 'text-green-700' : 'text-red-600'">{{ customer.destinataire ? "OK" : "Manquant" }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Destination</span>
              <span class="font-bold" :class="customer.destination ? 'text-green-700' : 'text-red-600'">{{ customer.destination || "Manquant" }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Total colis</span>
              <span class="font-bold text-slate-950">{{ totalPackages }}</span>
            </div>
          </div>

          <div v-if="missingFields.length" class="mt-4 rounded-lg bg-amber-50 p-3">
            <p class="text-xs font-bold uppercase tracking-wide text-amber-700">A completer</p>
            <p class="mt-1 text-sm text-amber-800">
              {{ missingFields.map((field) => field.label).join(", ") }}
            </p>
          </div>
        </section>

        <button type="submit" class="w-full rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60" :disabled="isSubmitting">
          {{ isSubmitting ? "Traitement..." : isEdit ? "Enregistrer les modifications" : "Enregistrer l'enlevement" }}
        </button>
      </aside>

      <button v-if="isPublicClientMode" type="submit" class="w-full rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60" :disabled="isSubmitting">
        {{ isSubmitting ? "Envoi..." : "Envoyer le formulaire" }}
      </button>
    </form>
  </section>
</template>

<style scoped>
</style>
