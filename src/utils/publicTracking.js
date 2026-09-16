export function transportFomekTrackingUrl(numero) {
    const code = String(numero || "").trim()
  
    if (!code) return ""
  
    return `https://tracksend.vercel.app/suivi/transport-fomek?code=${encodeURIComponent(code)}`
  }