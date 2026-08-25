<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { addDoc, arrayUnion, collection, doc, getDoc, serverTimestamp, updateDoc, getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage'
import router from '../router/index'
import { toast } from "vue3-toastify"
import "vue3-toastify/dist/index.css"

const receiverName = ref("")
const identityFile = ref(null)
const identityPreview = ref("")
const saving = ref(false)
const props = defineProps({
  detailId: String,
  colisIndex: Number,
  detailIndex: {
    type: Number,
    default: null
  }
})

const db = getFirestore()
const auth = getAuth()
const storage = getStorage()

onBeforeUnmount(() => {
  if (identityPreview.value) URL.revokeObjectURL(identityPreview.value)
})

const selectIdentityFile = (event) => {
  const file = event.target.files?.[0] || null

  if (file && !file.type.startsWith("image/")) {
    toast("La pièce d’identité doit être une image.", { type: "warning" })
    event.target.value = ""
    return
  }

  if (file && file.size > 10 * 1024 * 1024) {
    toast("La photo ne doit pas dépasser 10 Mo.", { type: "warning" })
    event.target.value = ""
    return
  }

  if (identityPreview.value) URL.revokeObjectURL(identityPreview.value)
  identityFile.value = file
  identityPreview.value = file ? URL.createObjectURL(file) : ""
}

const uploadIdentityDocument = async (deliveredAt) => {
  if (!identityFile.value) return { url: "", name: "" }

  const safeName = identityFile.value.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const itemKey = props.detailIndex !== null
    ? `${props.colisIndex}-${props.detailIndex}`
    : `${props.colisIndex}`
  const fileRef = storageRef(
    storage,
    `delivery-identities/${props.detailId}/${itemKey}/${Date.parse(deliveredAt)}-${safeName}`
  )

  await uploadBytes(fileRef, identityFile.value, {
    contentType: identityFile.value.type,
  })

  return {
    url: await getDownloadURL(fileRef),
    name: identityFile.value.name,
  }
}

const saveSignature = async () => {
  const signedBy = receiverName.value.trim()
  if (!signedBy) {
    toast("Merci d’indiquer le nom de la personne qui reçoit.", { type: "warning" })
    return
  }

  saving.value = true

  try {
    const deliveredAt = new Date().toISOString()
    const docRef = doc(db, "enlevements", props.detailId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      toast("Document introuvable.", { type: "error" })
      return
    }

    const docData = docSnap.data()
    const colis = docData.colis || []
    const user = auth.currentUser
    const identityDocument = await uploadIdentityDocument(deliveredAt)
    const deliveryProof = {
      receivedBy: signedBy,
      identityDocumentUrl: identityDocument.url,
      identityDocumentName: identityDocument.name,
      deliveredAt,
    }
    let deliveredPackageLabel = ""

    if (
      props.detailIndex !== null &&
      colis[props.colisIndex]?.details &&
      colis[props.colisIndex].details[props.detailIndex]
    ) {
      const deliveredItem = colis[props.colisIndex].details[props.detailIndex]
      deliveredPackageLabel =
        deliveredItem?.coli ||
        colis[props.colisIndex]?.nom ||
        `Colis ${props.colisIndex + 1}`
      colis[props.colisIndex].details[props.detailIndex] = {
        ...deliveredItem,
        statutColis: "livré",
        ...deliveryProof,
        historique: [
          ...(deliveredItem.historique || []),
          {
            status: "livré",
            type: "delivery_confirmation",
            receivedBy: signedBy,
            identityDocumentUrl: identityDocument.url,
            date: deliveredAt,
            userId: user?.uid || "",
            userEmail: user?.email || "",
          },
        ],
      }
    } else if (colis[props.colisIndex] && !colis[props.colisIndex].details) {
      const deliveredItem = colis[props.colisIndex]
      deliveredPackageLabel = deliveredItem?.nom || `Colis ${props.colisIndex + 1}`
      colis[props.colisIndex] = {
        ...deliveredItem,
        statutColis: "livré",
        ...deliveryProof,
        historique: [
          ...(deliveredItem.historique || []),
          {
          status: "livré",
          type: "delivery_confirmation",
          receivedBy: signedBy,
          identityDocumentUrl: identityDocument.url,
          date: deliveredAt,
          userId: user?.uid || "",
          userEmail: user?.email || "",
          },
        ],
      }
    } else {
      toast("Colis introuvable pour mise à jour.", { type: "error" })
      return
    }

    const deliveryEvent = {
      type: "delivery_confirmed",
      status: "livré",
      colis: deliveredPackageLabel,
      colisIndex: props.colisIndex,
      detailIndex: props.detailIndex,
      receivedBy: signedBy,
      identityDocumentUrl: identityDocument.url,
      date: deliveredAt,
      userId: user?.uid || "",
      userEmail: user?.email || "",
      message: `Colis reçu et signé par ${signedBy}`,
    }

    await updateDoc(docRef, {
      colis,
      deliveryHistory: arrayUnion(deliveryEvent),
    })

    const trackingNumber = String(
      docData.numeroSuivi || docData.trackingNumber || docData.numero || props.detailId
    ).trim()
    const deliveredAtLabel = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(deliveredAt))
    await addDoc(collection(db, "adminNotifications"), {
      type: "DELIVERY_CONFIRMED",
      title: "Colis livré",
      message: `${trackingNumber} a été remis à ${signedBy} le ${deliveredAtLabel}.`,
      trackingNumber,
      enlevementId: props.detailId,
      receivedBy: signedBy,
      deliveredAt,
      createdAt: serverTimestamp(),
      read: false,
      createdBy: user?.uid || "",
    })

    toast("Remise enregistrée, colis livré.", { type: "success" })
    router.push({ path: `/liste/${props.detailId}` })
  } catch (error) {
    console.error("Erreur lors de l’enregistrement de la remise :", error)
    toast("Impossible d’enregistrer la remise.", { type: "error" })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="w-full space-y-5 text-left" @submit.prevent="saveSignature">
    <div>
      <label for="receiver-name" class="text-sm font-bold text-slate-800">
        Nom de la personne qui reçoit <span class="text-red-600">*</span>
      </label>
      <input
        id="receiver-name"
        v-model="receiverName"
        type="text"
        autocomplete="name"
        class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        placeholder="Nom et prénom"
        required
      />
    </div>

    <div>
      <label for="identity-photo" class="text-sm font-bold text-slate-800">
        Photo de la pièce d’identité
        <span class="font-normal text-slate-500">(facultatif)</span>
      </label>
      <input
        id="identity-photo"
        type="file"
        accept="image/*"
        capture="environment"
        class="mt-2 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
        @change="selectIdentityFile"
      />
      <img
        v-if="identityPreview"
        :src="identityPreview"
        alt="Aperçu de la pièce d’identité"
        class="mt-3 max-h-48 rounded-lg border border-slate-200 object-contain"
      />
    </div>

    <button
      type="submit"
      :disabled="saving"
      class="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {{ saving ? "Enregistrement…" : "Valider la livraison" }}
    </button>
  </form>
</template>
