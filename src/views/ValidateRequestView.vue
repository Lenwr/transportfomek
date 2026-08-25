<template>
    <div class="min-h-screen bg-slate-100 flex items-center justify-center px-4 pt-6 pb-[10%]">
      <div class="w-full max-w-3xl bg-white rounded-2xl shadow-md p-6 md:p-8">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-xl font-semibold text-slate-900">
            Validation d’une demande
          </h1>
          <button
            class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            @click="goBack"
          >
            ← Retour
          </button>
        </div>
  
        <!-- Loading / error / content -->
        <div v-if="loading" class="py-10 flex justify-center">
          <span class="text-sm text-slate-500">Chargement…</span>
        </div>
  
        <div v-else-if="!demande">
          <p class="text-sm text-red-500">
            Demande introuvable ou déjà traitée.
          </p>
        </div>
  
        <div v-else class="space-y-4 text-sm text-slate-700">
          <!-- Infos client (lecture seule) -->
          <section class="bg-slate-50 rounded-xl p-4">
            <h2 class="font-semibold text-slate-900 mb-2">Client</h2>
            <p>{{ demande.clientPrenom }} {{ demande.clientNom }}</p>
            <p v-if="demande.clientAdresse">{{ demande.clientAdresse }}</p>
            <p v-if="demande.clientPhone">📞 {{ demande.clientPhone }}</p>
          </section>
  
          <!-- Destinataire (éditable) -->
          <section class="bg-slate-50 rounded-xl p-4 space-y-3">
            <h2 class="font-semibold text-slate-900 mb-2">Destinataire</h2>
  
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                Nom du destinataire
              </label>
              <input
                v-model="form.destinataire"
                class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
  
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                Téléphone du destinataire
              </label>
              <input
                v-model="form.telephoneDestinataire"
                class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
  
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Type de fret
                </label>
                <select
                  v-model="form.typeDeFret"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="Maritime">Maritime</option>
                  <option value="Aérien">Aérien</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Destination
                </label>
                <DestinationSelect v-model="form.destination" />
              </div>
            </div>
          </section>
  
          <!-- Colis (éditable) -->
          <section class="bg-slate-50 rounded-xl p-4">
            <div class="flex items-center justify-between mb-2">
              <h2 class="font-semibold text-slate-900">
                Colis ({{ totalColis }})
              </h2>
              <button
                class="text-xs text-indigo-600 hover:underline"
                type="button"
                @click="addColis"
              >
                + Ajouter un colis
              </button>
            </div>
  
            <div class="space-y-2">
              <div
                v-for="(c, index) in form.colis"
                :key="index"
                class="flex items-center gap-2"
              >
                <input
                  type="number"
                  min="1"
                  v-model.number="c.quantite"
                  class="w-20 border rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <input
                  type="text"
                  v-model="c.nom"
                  class="flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Carton, Télévision, Frigo…"
                />
                <button
                  type="button"
                  class="text-[11px] text-red-500 hover:underline"
                  @click="removeColis(index)"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </section>
  
          <!-- Photos (lecture seule) -->
          <section
            v-if="demande.imageUrls && demande.imageUrls.length"
            class="bg-slate-50 rounded-xl p-4"
          >
            <h2 class="font-semibold text-slate-900 mb-2">Photos client</h2>
            <div class="grid grid-cols-3 gap-2">
              <a
                v-for="(url, idx) in demande.imageUrls"
                :key="idx"
                :href="url"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  :src="url"
                  alt="photo colis"
                  class="h-24 w-full object-cover rounded-lg border border-slate-200"
                />
              </a>
            </div>
          </section>
  
          <!-- 💶 Paiement (éditable avant validation) -->
          <section class="bg-slate-50 rounded-xl p-4 space-y-3">
            <h2 class="font-semibold text-slate-900 mb-2">Paiement</h2>
  
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Statut paiement
                </label>
                <select
                  v-model="form.statut"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option>Non Payé</option>
                  <option>Reste à payer</option>
                  <option>Payé</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Mode de paiement
                </label>
                <select
                  v-model="form.modeDePaiement"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">—</option>
                  <option>Espèces</option>
                  <option>CB</option>
                  <option>Chèque</option>
                  <option>Virement</option>
                </select>
              </div>
            </div>
  
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Prix total (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="form.prix"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
  
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Reste à payer (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="form.resteAPayer"
                  class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p class="text-[11px] text-slate-500 mt-1">
                  Tu peux mettre 0 si c’est payé en totalité.
                </p>
              </div>
            </div>
          </section>

          <section class="bg-slate-50 rounded-xl p-4 space-y-3">
            <h2 class="font-semibold text-slate-900 mb-2">Réponse au client</h2>
            <textarea
              v-model="responseMessage"
              rows="3"
              class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Ex : Votre demande est validée. Nous passerons demain entre 10h et 12h."
            ></textarea>
            <p class="text-[11px] text-slate-500">
              Ce message sera envoyé par SMS au client quand tu valides ou refuses la demande.
            </p>
          </section>
  
          <!-- Actions -->
          <div class="pt-4 border-t flex items-center justify-end gap-3">
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
              @click="goBack"
            >
              Annuler
            </button>
            <button
              type="button"
              class="text-xs px-4 py-2 rounded-lg border border-red-200 text-red-600 font-medium hover:bg-red-50 disabled:opacity-60"
              :disabled="submitting"
              @click="refuserDemande"
            >
              {{ submitting ? 'Traitement…' : 'Refuser et prévenir' }}
            </button>
            <button
              type="button"
              class="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-60"
              :disabled="submitting"
              @click="validerDemande"
            >
              {{ submitting ? 'Validation…' : 'Valider et créer l’enlèvement' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    getFirestore,
    doc,
    getDoc,
    collection,
    addDoc,
    serverTimestamp,
    updateDoc,
  } from 'firebase/firestore'
  import { toast } from 'vue3-toastify'
  import DestinationSelect from '../components/DestinationSelect.vue'
  
  const route = useRoute()
  const router = useRouter()
  const db = getFirestore()
  
  const demandeId = route.params.id
  const demande = ref(null)
  
  const form = ref({
    destinataire: '',
    telephoneDestinataire: '',
    typeDeFret: 'Maritime',
    destination: 'TOGO',
    colis: [],
    statut: 'Non Payé',
    prix: 0,
    modeDePaiement: '',
    resteAPayer: 0,
  })
  
  const loading = ref(true)
  const submitting = ref(false)
  const responseMessage = ref("")
  
  const goBack = () => {
    router.push('/liste') // adapte à ta route interne principale
  }
  
  const totalColis = computed(() =>
    (form.value.colis || []).reduce(
      (acc, c) => acc + (Number(c.quantite) || 0),
      0,
    ),
  )
  
  const addColis = () => {
    form.value.colis.push({ nom: '', quantite: 1, type: '', details: [] })
  }
  
  const removeColis = (idx) => {
    if (form.value.colis.length === 1) {
      form.value.colis[0] = { nom: '', quantite: 1, type: '', details: [] }
      return
    }
    form.value.colis.splice(idx, 1)
  }
  
  const rebuildColisWithDetails = (colisList) => {
    return colisList
      .filter((c) => c.nom && c.quantite)
      .map((c) => {
        const label = c.nom
        const q = Number(c.quantite) || 1
        const typeKey = label
          .toString()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
  
        const details = Array.from({ length: q }, (_, i) => ({
          coli: `${label} ${i + 1}/${q}`,
          statutColis: 'réceptionné',
          type: typeKey,
          article: label,
        }))
  
        return {
          nom: label,
          quantite: q,
          type: typeKey,
          details,
        }
      })
  }
  
  const loadDemande = async () => {
    try {
      const refDemande = doc(db, 'pickupRequests', demandeId)
      const snap = await getDoc(refDemande)
      if (!snap.exists()) {
        demande.value = null
        return
      }
      const data = snap.data()
  
      if (data.status && data.status !== 'PENDING') {
        toast.info('Cette demande a déjà été traitée.')
      }
  
      demande.value = { id: snap.id, ...data }
      responseMessage.value = data.responseMessage || ""
  
      form.value = {
        destinataire: data.destinataire || '',
        telephoneDestinataire: data.telephoneDestinataire || '',
        typeDeFret: data.typeDeFret || 'Maritime',
        destination: data.destination || 'TOGO',
        colis: Array.isArray(data.colis)
          ? data.colis.map((c) => ({
              nom: c.nom || c.article || '',
              quantite: c.quantite || (c.details?.length || 1),
              type: c.type || '',
              details: c.details || [],
            }))
          : [{ nom: '', quantite: 1, type: '', details: [] }],
        statut: data.statut || 'Non Payé',
        prix: Number(data.prix) || 0,
        modeDePaiement: data.modeDePaiement || '',
        resteAPayer: Number(data.resteAPayer) || 0,
      }
    } catch (e) {
      console.error(e)
      toast.error('Erreur lors du chargement de la demande')
    } finally {
      loading.value = false
    }
  }
  
  const genererNumeroUnique = () => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate(),
    )}`
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(
      now.getSeconds(),
    )}`
    const random = Math.floor(Math.random() * 1000)
    return `COLIS-${date}-${time}-${random}`
  }
  
  const validerDemande = async () => {
    try {
      if (!demande.value) return
      submitting.value = true
  
      const d = demande.value
      const f = form.value
  
      // reconstruit colis final
      const colisFinal = rebuildColisWithDetails(f.colis)
      const nbColis = colisFinal.reduce(
        (acc, c) => acc + (c.quantite || 0),
        0,
      )
  
      const enlevementsCollection = collection(db, 'enlevements')
  
      const payload = {
        expediteur: `${d.clientPrenom || ''} ${d.clientNom || ''}`.trim(),
        telephoneExpediteur: d.clientPhone || '',
        adresseExpediteur: d.clientAdresse || d.pickupAddress || '',
  
        destinataire: f.destinataire || '',
        telephoneDestinataire: f.telephoneDestinataire || '',
        typeDeFret: f.typeDeFret || '',
        destination: f.destination || '',
  
        colis: colisFinal,
        nombreDeColis: nbColis,
  
        imageUrl: d.imageUrls || [],
  
        // 💶 paiement venant du form
        statut: f.statut || 'Non Payé',
        prix: f.prix || 0,
        modeDePaiement: f.modeDePaiement || '',
        resteAPayer: f.resteAPayer || 0,
  
        date: new Date().toISOString(),
  
        numero: genererNumeroUnique(),
        deliveryStatus: 'En attente',
        customerId: d.clientId || '',
        requestId: d.id,
  
        createdAt: serverTimestamp(),
      }
  
      const enlevementRef = await addDoc(enlevementsCollection, payload)
  
      const refDemande = doc(db, 'pickupRequests', d.id)
      await updateDoc(refDemande, {
        status: 'VALIDATED',
        validatedAt: serverTimestamp(),
        enlevementId: enlevementRef.id,
        responseMessage: responseMessage.value.trim(),
  
        destinataire: f.destinataire || '',
        telephoneDestinataire: f.telephoneDestinataire || '',
        typeDeFret: f.typeDeFret || '',
        destination: f.destination || '',
        colis: colisFinal,
        nombreDeColis: nbColis,
  
        statut: f.statut || 'Non Payé',
        prix: f.prix || 0,
        modeDePaiement: f.modeDePaiement || '',
        resteAPayer: f.resteAPayer || 0,
        updatedAt: serverTimestamp(),
      })
  
      toast.success('Demande validée et enlèvement créé ✅')
      router.push(`/liste/${enlevementRef.id}`)
    } catch (e) {
      console.error(e)
      toast.error("Erreur lors de la validation de la demande")
    } finally {
      submitting.value = false
    }
  }

  const refuserDemande = async () => {
    try {
      if (!demande.value) return

      const ok = window.confirm("Refuser cette demande et envoyer un SMS au client ?")
      if (!ok) return

      submitting.value = true

      const refDemande = doc(db, 'pickupRequests', demande.value.id)
      await updateDoc(refDemande, {
        status: 'CANCELLED',
        cancelledAt: serverTimestamp(),
        responseMessage: responseMessage.value.trim(),
        updatedAt: serverTimestamp(),
      })

      toast.success('Demande refusée, SMS client en cours d’envoi ✅')
      router.push('/pickup-requests')
    } catch (e) {
      console.error(e)
      toast.error("Erreur lors du refus de la demande")
    } finally {
      submitting.value = false
    }
  }
  
  onMounted(loadDemande)
  </script>
  
