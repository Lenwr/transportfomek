<script setup>
import { ref, computed } from 'vue'
import {
    format, parseISO, isSameDay,
    startOfMonth, endOfMonth, eachDayOfInterval, addMonths, parse
} from 'date-fns'
import frLocale from 'date-fns/locale/fr'
import { listeEnlevements } from '../components/firebaseConfig'
import {
    normalizeToDate, formatDateTime, formatHour,
    norm, isPaye, canonicalizeStatut, parsePrixToNumber, formatCurrency
} from '../components/useEnlevementsUtils'
import { getFirestore, doc, updateDoc } from 'firebase/firestore'

const db = getFirestore()
const COLLECTION_NAME = 'enlevements' // adapte si besoin

// Sélection du jour
const todayIso = format(new Date(), 'yyyy-MM-dd')
const selectedDateStr = ref(todayIso)

// Items du jour
const selectedDayItems = computed(() => {
    const target = parseISO(selectedDateStr.value)
    return (listeEnlevements.value || []).filter(item => {
        const d = normalizeToDate(item?.date)
        return d ? isSameDay(d, target) : false
    })
})

// Totaux (jour)
const totalMontantJourChoisi = computed(() =>
    selectedDayItems.value
        .filter(it => isPaye(it.statut))
        .reduce((sum, it) => sum + parsePrixToNumber(it.prix), 0)
)
const totalResteAPayerJourChoisi = computed(() =>
    selectedDayItems.value.reduce((sum, it) => sum + parsePrixToNumber(it.resteAPayer), 0)
)
const nbPayesJourChoisi = computed(() =>
    selectedDayItems.value.filter(it => isPaye(it.statut)).length
)
const nbTotalJourChoisi = computed(() => selectedDayItems.value.length)
const nbNonPayesJourChoisi = computed(() =>
    selectedDayItems.value.filter(it => norm(it.statut) === 'non paye' || norm(it.statut) === 'nonpaye').length
)
const nbResteAPayerJourChoisi = computed(() =>
    selectedDayItems.value.filter(it => canonicalizeStatut(it.statut) === 'Reste à payer').length
)

// Edition & sauvegarde
const savingId = ref(null)
const saveMessage = ref('')
async function saveRow(item) {
    try {
        savingId.value = item.id
        saveMessage.value = ''
        const payload = {
            statut: canonicalizeStatut(item.statut || ''),
            resteAPayer: item.resteAPayer ?? ''
        }
        await updateDoc(doc(db, COLLECTION_NAME, String(item.id)), payload)
        saveMessage.value = 'Enregistré ✓'
        setTimeout(() => (saveMessage.value = ''), 1500)
    } catch (e) {
        console.error(e)
        saveMessage.value = "Erreur d'enregistrement"
    } finally {
        savingId.value = null
    }
}
function rowStatusClass(s) {
    const canon = canonicalizeStatut(s)
    if (canon === 'Payé') return 'bg-green-50 text-green-700 border-green-200'
    if (canon === 'Reste à payer') return 'bg-amber-50 text-amber-800 border-amber-200'
    return 'bg-red-50 text-red-700 border-red-200'
}

// Export CSV (jour)
function exportCSV(rows, filename = 'tournee_jour.csv') {
    const headers = ['Heure', 'Expéditeur', 'Destinataire', 'Destination', 'Statut', 'Reste à payer', 'Prix', 'Mode de paiement', 'Personne en charge']
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [headers.join(',')].concat(
        rows.map(r => [
            formatHour(r.date), r.expediteur, r.destinataire, r.destination,
            canonicalizeStatut(r.statut), r.resteAPayer, r.prix, r.modeDePaiement, r.personneEnCharge
        ].map(escape).join(','))
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
}

// Clients par statut (jour)
const regrouperPar = ref('expediteur') // 'expediteur' | 'destinataire'
const digits = s => String(s ?? '').replace(/\D+/g, '')
const clientsAgg = computed(() => {
    const map = new Map()
    for (const it of selectedDayItems.value) {
        const name = (regrouperPar.value === 'destinataire' ? it.destinataire : it.expediteur) || '(Inconnu)'
        const phone = regrouperPar.value === 'destinataire' ? (it.telephoneDestinataire || '') : (it.telephoneExpediteur || '')
        const key = norm(name) + '|' + digits(phone)

        const paid = isPaye(it.statut) ? parsePrixToNumber(it.prix) : 0
        const reste = parsePrixToNumber(it.resteAPayer)
        const canon = canonicalizeStatut(it.statut)

        if (!map.has(key)) {
            map.set(key, {
                key,
                nom: name,
                telephone: phone || '—',
                totalPaye: 0,
                totalReste: 0,
                totalPrix: 0,
                statuses: new Set(),
                lastDate: normalizeToDate(it.date)
            })
        }
        const row = map.get(key)
        row.totalPaye += paid
        row.totalReste += reste
        row.totalPrix += parsePrixToNumber(it.prix)
        row.statuses.add(canon)
        const d = normalizeToDate(it.date); if (d && (!row.lastDate || d > row.lastDate)) row.lastDate = d
    }
    const payes = [], reste = [], nonPayes = []
    for (const r of map.values()) {
        const hasReste = r.totalReste > 0 || r.statuses.has('Reste à payer')
        const allPayes = r.statuses.size > 0 && [...r.statuses].every(s => s === 'Payé')
        if (hasReste) reste.push(r)
        else if (allPayes) payes.push(r)
        else nonPayes.push(r)
    }
    const byPayeDesc = (a, b) => (b.totalPaye - a.totalPaye) || a.nom.localeCompare(b.nom)
    const byResteDesc = (a, b) => (b.totalReste - a.totalReste) || a.nom.localeCompare(b.nom)
    const byNom = (a, b) => a.nom.localeCompare(b.nom)
    payes.sort(byPayeDesc); reste.sort(byResteDesc); nonPayes.sort(byNom)
    return { payes, reste, nonPayes }
})
const nbClientsPayes = computed(() => clientsAgg.value.payes.length)
const nbClientsReste = computed(() => clientsAgg.value.reste.length)
const nbClientsNonPayes = computed(() => clientsAgg.value.nonPayes.length)
function exportClientsCSV(list, filename = 'clients.csv') {
    const headers = ['Client', 'Téléphone', 'Total payé', 'Reste à payer', 'Dernière opération']
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [headers.join(',')].concat(
        list.map(r => [
            r.nom, r.telephone, formatCurrency(r.totalPaye), formatCurrency(r.totalReste),
            r.lastDate ? format(r.lastDate, "dd/MM/yyyy HH:mm") : ''
        ].map(escape).join(','))
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
}

// Stats mensuelles (chart)
const selectedMonthStr = ref(format(new Date(), 'yyyy-MM'))
const monthStart = computed(() => startOfMonth(parse(selectedMonthStr.value + '-01', 'yyyy-MM-dd', new Date())))
const monthEnd = computed(() => endOfMonth(monthStart.value))
const daysInMonth = computed(() => eachDayOfInterval({ start: monthStart.value, end: monthEnd.value }))

const itemsInMonth = computed(() =>
    (listeEnlevements.value || []).filter(it => {
        const d = normalizeToDate(it?.date)
        return d && d >= monthStart.value && d <= monthEnd.value
    })
)
const dailyTotals = computed(() =>
    daysInMonth.value.map(day =>
        itemsInMonth.value
            .filter(it => isSameDay(normalizeToDate(it.date), day) && isPaye(it.statut))
            .reduce((sum, it) => sum + parsePrixToNumber(it.prix), 0)
    )
)
const totalMonth = computed(() => dailyTotals.value.reduce((a, b) => a + b, 0))
const prevMonthStart = computed(() => startOfMonth(addMonths(monthStart.value, -1)))
const prevMonthEnd = computed(() => endOfMonth(prevMonthStart.value))
const totalPrevMonth = computed(() => {
    const rows = (listeEnlevements.value || []).filter(it => {
        const d = normalizeToDate(it?.date)
        return d && d >= prevMonthStart.value && d <= prevMonthEnd.value && isPaye(it.statut)
    })
    return rows.reduce((s, it) => s + parsePrixToNumber(it.prix), 0)
})
const pctChangeMonth = computed(() => {
    const prev = totalPrevMonth.value
    const curr = totalMonth.value
    if (prev === 0) return null
    return ((curr - prev) / prev) * 100
})

// Chart (SVG)
const chartW = 700, chartH = 220, padL = 40, padR = 10, padT = 10, padB = 30
const maxY = computed(() => {
    const m = Math.max(0, ...dailyTotals.value)
    return m <= 0 ? 1 : Math.ceil(m * 1.1)
})
function xFor(i) {
    const n = Math.max(daysInMonth.value.length - 1, 1)
    return padL + (chartW - padL - padR) * (i / n)
}
function yFor(v) {
    return padT + (chartH - padT - padB) * (1 - (v / maxY.value))
}
const linePath = computed(() => {
    if (!dailyTotals.value.length) return ''
    return dailyTotals.value.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ')
})
const areaPath = computed(() => {
    const n = dailyTotals.value.length
    if (!n) return ''
    const top = dailyTotals.value.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ')
    const lastX = xFor(n - 1)
    const firstX = xFor(0)
    const baseY = yFor(0)
    return `${top} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`
})
const ticks = computed(() => {
    const arr = []; const steps = 4
    for (let i = 0; i <= steps; i++) arr.push((maxY.value / steps) * i)
    return arr
})
const formatShort = (d) => format(d, 'd MMM', { locale: frLocale })
</script>

<template>
    <div class="bg-green-50 min-h-screen flex pb-14 pt-4 flex-col items-center">
        <!-- Sélecteur de jour & totaux -->
        <div class="w-[95%] mt-4 mb-4 no-print">
            <div
                class="bg-white shadow-2xl rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Jour</label>
                    <input type="date" v-model="selectedDateStr"
                        class="border text-black border-gray-300 rounded-lg p-2 text-sm" />
                    <p class="mt-1 text-xs text-gray-500">
                        Montant = somme des <span class="font-medium">Payé</span> uniquement.
                    </p>
                </div>
                <div class="text-right space-y-1">
                    <div class="text-sm text-gray-600">
                        Enlèvements : <span class="font-semibold">{{ nbTotalJourChoisi }}</span> —
                        <span class="text-green-700">{{ nbPayesJourChoisi }} payés</span> /
                        <span class="text-red-700">{{ nbNonPayesJourChoisi }} non payés</span> /
                        <span class="text-amber-700">{{ nbResteAPayerJourChoisi }} reste à payer</span>
                    </div>
                    <div class="text-sm text-gray-500">Montant fait (Payé) • Reste à payer</div>
                    <div class="text-2xl text-black font-bold">
                        {{ formatCurrency(totalMontantJourChoisi) }}
                        <span class="text-lg text-gray-400"> • </span>
                        <span class="text-xl text-amber-700">{{ formatCurrency(totalResteAPayerJourChoisi) }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Feuille de tournée (éditable & imprimable) -->
        <div class="w-[95%] mb-6 print-area bg-white shadow-2xl rounded-lg">
            <div class="p-4 flex items-start justify-between">
                <div>
                    <h2 class="text-lg text-black font-semibold">Feuille de tournée — {{
                        format(parseISO(selectedDateStr), "EEEE d MMMM yyyy", { locale: frLocale }) }}</h2>
                    <p class="text-xs text-gray-500">Champs Statut et Reste à payer éditables, puis Enregistrer.</p>
                </div>
            </div>
            <div class=" flex flex-row mb-4 justify-around">
                    <button @click="exportCSV(selectedDayItems)"
                        class="py-2 px-3 text-sm bg-cyan-700 text-white rounded-lg">Exporter CSV</button>
                </div>

            <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50 border-y">
                        <tr class="text-black">
                            <th class="text-left text-black p-3">Heure</th>
                            <th class="text-left text-black p-3">Expéditeur</th>
                            <th class="text-left text-black p-3">Destinataire</th>
                            <th class="text-left p-3">Destination</th>
                            <th class="text-left p-3">Statut</th>
                            <th class="text-left p-3">Reste à payer</th>
                            <th class="text-left p-3">Prix</th>
                            <th class="text-left p-3">Mode</th>
                            <th class="text-left p-3">Agent</th>
                            <th class="text-left p-3 no-print">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="it in selectedDayItems" :key="it.id" class="border-b text-black">
                            <td class="p-3">{{ formatHour(it.date) }}</td>
                            <td class="p-3">{{ it.expediteur || '—' }}</td>
                            <td class="p-3">{{ it.destinataire || '—' }}</td>
                            <td class="p-3">{{ it.destination || '—' }}</td>
                            <td class="p-3">
                                <span class="only-print">{{ canonicalizeStatut(it.statut) }}</span>
                                <select v-model="it.statut" class="no-print border rounded p-1"
                                    :class="rowStatusClass(it.statut)">
                                    <option value="Payé" class="text-green-700">Payé</option>
                                    <option value="Non Payé" class="text-red-700">Non Payé</option>
                                    <option value="Reste à payer" class="text-amber-700">Reste à payer</option>
                                </select>
                            </td>
                            <td class="p-3">
                                <span class="only-print">{{ it.resteAPayer || '—' }}</span>
                                <input v-model="it.resteAPayer" class="no-print border rounded p-1 w-28"
                                    placeholder="ex: 50€" />
                            </td>
                            <td class="p-3">{{ it.prix ? formatCurrency(parsePrixToNumber(it.prix)) : '—' }}</td>
                            <td class="p-3">{{ it.modeDePaiement || '—' }}</td>
                            <td class="p-3">{{ it.personneEnCharge || '—' }}</td>
                            <td class="p-3 no-print">
                                <button @click="saveRow(it)"
                                    class="py-1 px-2 text-xs rounded bg-green-600 text-white disabled:opacity-60"
                                    :disabled="savingId === it.id">
                                    {{ savingId === it.id ? 'Enregistrement…' : 'Enregistrer' }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                    <tfoot class="bg-gray-50 border-t">
                        <tr>
                            <td class="p-3 font-medium text-black" colspan="4">Totaux (jour)</td>
                            <td class="p-3">
                                <span class="inline-block rounded px-2 py-1 text-xs" :class="rowStatusClass('Payé')">
                                    {{ nbPayesJourChoisi }} Payé(s)
                                </span>
                                <span class="inline-block rounded px-2 py-1 text-xs ml-1"
                                    :class="rowStatusClass('Reste à payer')">
                                    {{ nbResteAPayerJourChoisi }} Reste à payer
                                </span>
                                <span class="inline-block rounded px-2 py-1 text-xs ml-1"
                                    :class="rowStatusClass('Non Payé')">
                                    {{ nbNonPayesJourChoisi }} Non Payé(s)
                                </span>
                            </td>
                            <td class="p-3 font-semibold text-amber-700">{{ formatCurrency(totalResteAPayerJourChoisi)
                                }}</td>
                            <td class="p-3 font-semibold text-green-700">{{ formatCurrency(totalMontantJourChoisi) }}
                            </td>
                            <td class="p-3" colspan="3">
                                <span class="text-xs text-gray-500">{{ saveMessage }}</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <!-- Clients par statut -->
        <div class="w-[95%] mb-6 text-black print-area bg-white shadow-2xl rounded-lg">
            <div class="p-4 flex items-start justify-between">
                <div>
                    <h2 class="text-lg font-semibold">Clients par statut — {{ format(parseISO(selectedDateStr), "EEEE dMMMM yyyy", { locale: frLocale }) }}</h2>

                    <div class="mt-2 flex items-center gap-2 no-print">
                        <label class="text-sm text-gray-600">Regrouper par</label>
                        <select v-model="regrouperPar" class="border rounded p-1 text-sm">
                            <option value="expediteur">Expéditeur</option>
                            <option value="destinataire">Destinataire</option>
                        </select>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Totaux Payé et Reste à payer par client.</p>
                </div>
            </div>
            <div class="no-print grid grid-cols-1 xs:grid-cols-2 sm:flex sm:justify-around sm:flex-row gap-2 mx-4">
                <button @click="exportClientsCSV(clientsAgg.payes, 'clients_payes.csv')"
                    class="w-full sm:w-auto inline-flex items-center justify-center px-3 py-2 text-sm bg-green-600 text-white rounded-lg whitespace-nowrap">
                    Export Payés
                </button>

                <button @click="exportClientsCSV(clientsAgg.reste, 'clients_reste_a_payer.csv')"
                    class="w-full sm:w-auto inline-flex items-center justify-center px-3 py-2 text-sm bg-amber-600 text-white rounded-lg whitespace-nowrap">
                    Export Reste à payer
                </button>

                <button @click="exportClientsCSV(clientsAgg.nonPayes, 'clients_non_payes.csv')"
                    class="w-full sm:w-auto inline-flex items-center justify-center px-3 py-2 text-sm bg-red-600 text-white rounded-lg whitespace-nowrap">
                    Export Non Payés
                </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
                <div class="border rounded-lg">
                    <div class="px-3 py-2 border-b bg-green-50 text-green-800 font-medium">
                        Payés — {{ nbClientsPayes }}
                    </div>
                    <ul class="divide-y">
                        <li v-for="c in clientsAgg.payes" :key="c.key" class="p-3">
                            <div class="font-semibold">{{ c.nom }}</div>
                            <div class="text-xs text-gray-500">Tel: {{ c.telephone }}</div>
                            <div class="text-sm mt-1">Payé: <span class="font-semibold text-green-700">{{
                                    formatCurrency(c.totalPaye) }}</span></div>
                        </li>
                    </ul>
                </div>

                <div class="border rounded-lg">
                    <div class="px-3 py-2 border-b bg-amber-50 text-amber-800 font-medium">
                        Reste à payer — {{ nbClientsReste }}
                    </div>
                    <ul class="divide-y">
                        <li v-for="c in clientsAgg.reste" :key="c.key" class="p-3">
                            <div class="font-semibold">{{ c.nom }}</div>
                            <div class="text-xs text-gray-500">Tel: {{ c.telephone }}</div>
                            <div class="text-sm mt-1">
                                Reste: <span class="font-semibold text-amber-700">{{ formatCurrency(c.totalReste)
                                    }}</span>
                                <span v-if="c.totalPaye" class="text-xs text-gray-500 ml-2">déjà encaissé: {{
                                    formatCurrency(c.totalPaye) }}</span>
                            </div>
                        </li>
                    </ul>
                </div>

                <div class="border rounded-lg">
                    <div class="px-3 py-2 border-b bg-red-50 text-red-800 font-medium">
                        Non Payés — {{ nbClientsNonPayes }}
                    </div>
                    <ul class="divide-y">
                        <li v-for="c in clientsAgg.nonPayes" :key="c.key" class="p-3">
                            <div class="font-semibold">{{ c.nom }}</div>
                            <div class="text-xs text-gray-500">Tel: {{ c.telephone }}</div>
                            <div class="text-sm mt-1">Payé: <span class="font-semibold">{{ formatCurrency(c.totalPaye)
                                    }}</span></div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Diagramme mensuel -->
        <div class="w-[95%] mb-8 no-print">
            <div class="bg-white shadow-2xl rounded-lg p-4">
                <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                        <h2 class="text-lg text-black font-semibold mb-1">Statistiques mensuelles</h2>
                        <div class="flex items-center gap-2">
                            <label class="text-sm text-gray-600">Mois</label>
                            <input type="month" v-model="selectedMonthStr"
                                class="border border-gray-300 rounded-lg p-2 text-sm" />
                        </div>
                    </div>
                    <div class="text-right space-y-1">
                        <div class="text-sm text-gray-500">Total du mois (Payé)</div>
                        <div class="text-2xl text-black font-bold">{{ formatCurrency(totalMonth) }}</div>
                        <div class="text-xs text-gray-500">
                            vs mois précédent :
                            <span v-if="pctChangeMonth !== null"
                                :class="pctChangeMonth >= 0 ? 'text-green-600' : 'text-red-600'">
                                {{ pctChangeMonth >= 0 ? '▲' : '▼' }} {{ Math.abs(pctChangeMonth).toFixed(1) }}%
                            </span>
                            <span v-else class="text-gray-500">n/a</span>
                            ({{ formatCurrency(totalPrevMonth) }})
                        </div>
                    </div>
                </div>

                <div class="mt-4">
                    <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="w-full h-56">
                        <g v-for="t in ticks" :key="t">
                            <line :x1="padL" :x2="chartW - padR" :y1="yFor(t)" :y2="yFor(t)" stroke="#e5e7eb"
                                stroke-dasharray="4 4" />
                            <text :x="padL - 6" :y="yFor(t) + 4" text-anchor="end" class="fill-gray-400 text-[10px]">
                                {{ formatCurrency(t) }}
                            </text>
                        </g>
                        <path v-if="dailyTotals.some(v => v > 0)" :d="areaPath" fill="rgba(59,130,246,0.15)" />
                        <path :d="linePath" stroke="#3b82f6" fill="none" stroke-width="2" />
                        <g v-for="(v, i) in dailyTotals" :key="i">
                            <circle :cx="xFor(i)" :cy="yFor(v)" r="3" fill="#3b82f6">
                                <title>{{ formatShort(daysInMonth[i]) }} — {{ formatCurrency(v) }}</title>
                            </circle>
                        </g>
                        <text :x="xFor(0)" :y="chartH - 8" text-anchor="start" class="fill-gray-400 text-[10px]">
                            {{ formatShort(daysInMonth[0]) }}
                        </text>
                        <text :x="xFor(Math.floor((daysInMonth.length - 1) / 2))" :y="chartH - 8" text-anchor="middle"
                            class="fill-gray-400 text-[10px]">
                            {{ formatShort(daysInMonth[Math.floor((daysInMonth.length - 1) / 2)]) }}
                        </text>
                        <text :x="xFor(daysInMonth.length - 1)" :y="chartH - 8" text-anchor="end"
                            class="fill-gray-400 text-[10px]">
                            {{ formatShort(daysInMonth[daysInMonth.length - 1]) }}
                        </text>
                    </svg>
                    <p v-if="!dailyTotals.some(v => v > 0)" class="text-sm text-gray-500 mt-2">Aucune donnée payée pour
                        ce mois.</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
@media print {
    :global(body) {
        background: #ffffff !important;
    }

    .no-print {
        display: none !important;
    }

    .print-area {
        box-shadow: none !important;
        border: none !important;
    }

    .only-print {
        display: inline !important;
    }
}

.only-print {
    display: none;
}
</style>
