const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = admin.firestore();
const PERMISSION_KEYS = new Set([
  "dashboard", "planning", "driversMap", "clientFollowup", "liste", "form",
  "pickupRequests", "pickupRequestScan", "deliveryScan", "recording", "tracking",
  "boxes", "contracts", "billing", "customers",
]);

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanPermissions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter((item) => PERMISSION_KEYS.has(item));
}

function validInternalRole(value) {
  return value === "superAdmin" || (/^[a-z0-9_-]{2,50}$/.test(value) && value !== "client");
}

function temporaryPassword() {
  return `Fmk-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}!`;
}

async function requireSuperAdmin(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const decoded = await admin.auth().verifyIdToken(header.slice(7));
  if (decoded.superAdmin === true || decoded.role === "superAdmin") return decoded;
  const snap = await db.collection("users").doc(decoded.uid).get();
  const profile = snap.exists ? snap.data() || {} : {};
  if (profile.superAdmin === true || profile.role === "superAdmin") return decoded;
  throw new Error("FORBIDDEN");
}

function endpoint(handler) {
  return onRequest({ cors: true }, async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée" });
    try {
      return await handler(req, res);
    } catch (error) {
      console.error(error);
      const status = error.message === "UNAUTHORIZED" ? 401 : error.message === "FORBIDDEN" ? 403 : 500;
      const message = status === 401 ? "Session expirée." : status === 403 ? "Accès SuperAdmin requis." : error.message || "Erreur serveur";
      return res.status(status).json({ success: false, error: message });
    }
  });
}

exports.createInternalAccess = endpoint(async (req, res) => {
  const actor = await requireSuperAdmin(req);
  const { email, password, role = "admin", displayName = "", permissions = [], disabled = false } = req.body || {};
  const userEmail = cleanEmail(email);
  const userRole = String(role || "admin").trim();
  const userName = String(displayName || "").trim();
  const generatedPassword = String(password || "").trim() || temporaryPassword();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) return res.status(400).json({ success: false, error: "Email invalide" });
  if (!validInternalRole(userRole)) return res.status(400).json({ success: false, error: "Rôle interne invalide" });
  if (userRole !== "superAdmin" && !(await db.collection("roles").doc(userRole).get()).exists) return res.status(400).json({ success: false, error: "Ce rôle n’existe pas" });
  if (generatedPassword.length < 8) return res.status(400).json({ success: false, error: "Mot de passe trop court" });

  let authUser;
  try {
    authUser = await admin.auth().getUserByEmail(userEmail);
    authUser = await admin.auth().updateUser(authUser.uid, { password: generatedPassword, displayName: userName || authUser.displayName || userEmail, disabled: Boolean(disabled) });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    authUser = await admin.auth().createUser({ email: userEmail, password: generatedPassword, displayName: userName || userEmail, disabled: Boolean(disabled) });
  }

  const superAdmin = userRole === "superAdmin";
  await admin.auth().setCustomUserClaims(authUser.uid, { role: userRole, superAdmin });
  await db.collection("users").doc(authUser.uid).set({
    email: userEmail,
    displayName: userName || authUser.displayName || userEmail,
    role: userRole,
    superAdmin,
    disabled: Boolean(disabled),
    permissions: superAdmin ? [] : cleanPermissions(permissions),
    accessType: "internal",
    createdBy: actor.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return res.json({ success: true, uid: authUser.uid, email: userEmail, temporaryPassword: generatedPassword });
});

exports.updateUserAccess = endpoint(async (req, res) => {
  const actor = await requireSuperAdmin(req);
  const { uid, role = "admin", permissions = [], disabled = false, displayName = "" } = req.body || {};
  const userId = String(uid || "").trim();
  const userRole = String(role || "admin").trim();
  if (!userId) return res.status(400).json({ success: false, error: "uid requis" });
  if (userRole !== "client" && !validInternalRole(userRole)) return res.status(400).json({ success: false, error: "Rôle invalide" });
  if (userRole !== "client" && userRole !== "superAdmin" && !(await db.collection("roles").doc(userRole).get()).exists) return res.status(400).json({ success: false, error: "Ce rôle n’existe pas" });

  const superAdmin = userRole === "superAdmin";
  const authUpdate = { disabled: Boolean(disabled) };
  if (String(displayName || "").trim()) authUpdate.displayName = String(displayName).trim();
  await admin.auth().updateUser(userId, authUpdate);
  await admin.auth().setCustomUserClaims(userId, { role: userRole, superAdmin });
  await db.collection("users").doc(userId).set({
    role: userRole, superAdmin, disabled: Boolean(disabled),
    displayName: String(displayName || "").trim(),
    permissions: superAdmin || userRole === "client" ? [] : cleanPermissions(permissions),
    accessType: userRole === "client" ? "client" : "internal",
    updatedBy: actor.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return res.json({ success: true });
});

exports.listApplicationUsers = endpoint(async (req, res) => {
  await requireSuperAdmin(req);
  const profiles = await db.collection("users").get();
  const byId = new Map(profiles.docs.map((doc) => [doc.id, doc.data() || {}]));
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach((authUser) => {
      const profile = byId.get(authUser.uid) || {};
      const role = profile.role || authUser.customClaims?.role || "admin";
      users.push({
        id: authUser.uid, email: profile.email || authUser.email || "",
        displayName: profile.displayName || authUser.displayName || "", role,
        superAdmin: profile.superAdmin === true || authUser.customClaims?.superAdmin === true || role === "superAdmin",
        disabled: authUser.disabled === true || profile.disabled === true,
        permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
        accessType: profile.accessType || (role === "client" ? "client" : "internal"),
        clientId: profile.clientId || authUser.customClaims?.clientId || "",
      });
    });
    pageToken = page.pageToken;
  } while (pageToken);
  return res.json({ success: true, users });
});

exports.createClientPortalAccess = endpoint(async (req, res) => {
  const actor = await requireSuperAdmin(req);
  const { clientId, email, password } = req.body || {};
  const id = String(clientId || "").trim();
  const userEmail = cleanEmail(email);
  if (!id) return res.status(400).json({ success: false, error: "clientId requis" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) return res.status(400).json({ success: false, error: "Email client invalide" });
  const clientRef = db.collection("clients").doc(id);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) return res.status(404).json({ success: false, error: "Client introuvable" });
  const client = clientSnap.data() || {};
  const generatedPassword = String(password || "").trim() || temporaryPassword();
  let authUser;
  try {
    authUser = await admin.auth().getUserByEmail(userEmail);
    authUser = await admin.auth().updateUser(authUser.uid, { password: generatedPassword, disabled: false });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    authUser = await admin.auth().createUser({ email: userEmail, password: generatedPassword, displayName: client.displayName || userEmail });
  }
  await admin.auth().setCustomUserClaims(authUser.uid, { role: "client", clientId: id });
  const now = admin.firestore.FieldValue.serverTimestamp();
  await Promise.all([
    clientRef.set({ authUid: authUser.uid, email: userEmail, hasPortalAccess: true, portalAccessUpdatedAt: now, portalAccessCreatedBy: actor.uid }, { merge: true }),
    db.collection("users").doc(authUser.uid).set({ email: userEmail, role: "client", clientId: id, accessType: "client", updatedAt: now }, { merge: true }),
  ]);
  return res.json({ success: true, uid: authUser.uid, email: userEmail, temporaryPassword: generatedPassword });
});

exports.deleteClientAccount = endpoint(async (req, res) => {
  await requireSuperAdmin(req);
  const { clientId, deleteAuth = true, deleteEnlevements = false } = req.body || {};
  const id = String(clientId || "").trim();
  if (!id) return res.status(400).json({ success: false, error: "clientId requis" });
  const clientRef = db.collection("clients").doc(id);
  const customerRef = db.collection("customers").doc(id);
  const [clientSnap, customerSnap] = await Promise.all([clientRef.get(), customerRef.get()]);
  const authUid = clientSnap.exists ? String(clientSnap.data()?.authUid || "").trim() : "";
  const batch = db.batch();
  if (clientSnap.exists) batch.delete(clientRef);
  if (customerSnap.exists) batch.delete(customerRef);
  if (deleteEnlevements) {
    const shipments = await db.collection("enlevements").where("customerId", "==", id).get();
    shipments.docs.forEach((doc) => batch.delete(doc.ref));
  }
  if (authUid) batch.delete(db.collection("users").doc(authUid));
  await batch.commit();
  if (deleteAuth && authUid) await admin.auth().deleteUser(authUid).catch((error) => { if (error.code !== "auth/user-not-found") throw error; });
  return res.json({ success: true });
});
