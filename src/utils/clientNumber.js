import { doc, runTransaction } from "firebase/firestore"

const CLIENT_COUNTER_REF = "clients"

export async function generateClientNumber(db) {
  const counterRef = doc(db, "referenceCounters", CLIENT_COUNTER_REF)

  const nextValue = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(counterRef)
    const currentValue = Number(snapshot.data()?.value || 0)
    const next = currentValue + 1

    transaction.set(counterRef, {
      value: next,
      prefix: "CL",
      updatedAt: new Date().toISOString(),
    }, { merge: true })

    return next
  })

  return `CL${nextValue}`
}
