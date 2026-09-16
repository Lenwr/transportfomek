import { getAuth } from "firebase/auth"
import { messagingEndpoint } from "./messagingEndpoint"



export async function sendDocumentBySMS({ phoneNumber, message }) {
  const phone = String(phoneNumber || "").trim()
  if (!phone) throw new Error("Téléphone client manquant.")
  const token = await getAuth().currentUser?.getIdToken()
  if (!token) throw new Error("Session expirée.")
  const response = await fetch(messagingEndpoint("sendInvoiceSMS"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phoneNumber: phone, message }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) throw new Error(data.error || "Envoi Twilio impossible.")
  return data
}
