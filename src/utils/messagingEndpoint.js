export function messagingEndpoint(name) {
  const base = String(import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('URL des fonctions Firebase non configurée.')
  return `${base}/${name}`
}
