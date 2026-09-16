import { format, parseISO } from 'date-fns'
import frLocale from 'date-fns/locale/fr'

export function normalizeToDate(raw) {
  if (!raw) return null
  if (typeof raw === 'object' && typeof raw.toDate === 'function') return raw.toDate() // Firestore Timestamp
  if (typeof raw === 'object' && typeof raw.seconds === 'number') return new Date(raw.seconds * 1000)
  if (typeof raw === 'number') return new Date(raw < 1e12 ? raw * 1000 : raw)
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
    if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0, 0) // local
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return parseISO(raw)
    const d = new Date(raw); if (!isNaN(d)) return d
  }
  return null
}

export const formatDateTime = (raw) => {
  const d = normalizeToDate(raw)
  return d ? format(d, "EEEE d MMMM yyyy à HH'h'mm", { locale: frLocale }) : 'Non dispo'
}
export const formatHour = (raw) => {
  const d = normalizeToDate(raw)
  return d ? format(d, "HH'h'mm", { locale: frLocale }) : '—'
}

export const norm = s => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu,'')
  .toLowerCase().trim()

export const isPaye = (statut) => {
  const n = norm(statut)
  return n === 'paye' || n === 'payee' || n === 'paye(e)'
}
export const canonicalizeStatut = (s) => {
  const n = norm(s)
  if (n === 'paye' || n === 'payee' || n === 'paye(e)') return 'Payé'
  if (n === 'nonpaye' || n === 'non paye' || n === 'non-payé' || n === 'non-paye') return 'Non Payé'
  if (n === 'acompte' || n === 'accompte' || n === 'resteapayer' || n === 'reste a payer' || n === 'reste-à-payer') return 'Acompte'
  return s || ''
}

export const parsePrixToNumber = (raw) => {
  if (raw == null) return 0
  if (typeof raw === 'number' && isFinite(raw)) return raw
  if (typeof raw !== 'string') return 0
  let s = raw.replace(/[€\s\u00A0\u202F]/g, '')
  s = s.replace(/[^0-9.,']/g, '')
  if (s.includes(',') && s.includes('.')) { s = s.replace(/\./g, ''); s = s.replace(',', '.') }
  else if (s.includes(',')) { const m = s.match(/,(\d{1,2})$/); s = m ? s.replace(',', '.') : s.replace(/,/g, '') }
  else { const parts = s.split('.'); if (parts.length > 2) s = parts.join('') }
  s = s.replace(/'/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export const formatCurrency = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0)
