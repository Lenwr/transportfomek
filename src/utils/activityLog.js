import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { auth, db } from "../components/firebaseConfig"

export async function logActivity({ action = "", targetType = "", targetId = "", label = "", details = {} } = {}) {
  const user = auth.currentUser

  try {
    await addDoc(collection(db, "activityLogs"), {
      action,
      targetType,
      targetId,
      label,
      details,
      userId: user?.uid || "",
      userEmail: user?.email || "",
      userName: user?.displayName || "",
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    console.warn("Activity log skipped", error)
  }
}
