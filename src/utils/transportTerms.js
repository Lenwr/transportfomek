export const TRANSPORT_TERMS_VERSION = '2026-09-21'
export const TRANSPORT_TERMS = [
  "Aucun produit volé ou illicite, armes, ainsi que les produits interdits par la Douane camerounaise tels que médicaments, alcool, pâtes alimentaires, huile végétale, tenues et chaussures militaires ne doivent être contenus dans vos colis, auquel cas un redressement ou une pénalité pourront vous être appliqués, voire la saisie de vos marchandises.",
  "À l'arrivée du chauffeur, vos colis doivent être prêts, avec le nom, le numéro de téléphone et la ville du destinataire. Il peut vous aider à emballer vos colis contre rémunération non comprise dans ce tarif.",
  "Lors de l'enlèvement de vos colis, un contrôle des dimensions peut être effectué et la facture pourra être réévaluée en cas de différence notoire.",
  "Les objets fragiles (vaisselle, TV, miroir… liste non exhaustive) doivent être emballés avec précaution par vos soins. L'entreprise ne peut être tenue responsable en cas de casse liée aux multiples manutentions et au transport maritime.",
  "Ce tarif n'inclut pas de livraison. Vos colis seront mis à disposition dans nos entrepôts de Douala (Bonamoussadi) ou de Yaoundé (Total Biteng), selon votre souhait.",
  "Au-delà d'une semaine de mise à disposition, des frais de stockage vous seront facturés."
]

export function transportTermsAcceptance(accepted, acceptedAt) {
  if (accepted !== true) throw new Error("Veuillez lire et accepter les conditions d'enlèvement et de transport.")
  return { accepted: true, version: TRANSPORT_TERMS_VERSION, clauses: [...TRANSPORT_TERMS], acceptedAt }
}

export function appendTransportTerms(pdf, { reference = '', acceptance } = {}) {
  const hasAcceptance = acceptance?.accepted === true && Array.isArray(acceptance.clauses) && acceptance.clauses.length > 0
  const clauses = hasAcceptance ? acceptance.clauses : TRANSPORT_TERMS
  const version = hasAcceptance ? acceptance.version : TRANSPORT_TERMS_VERSION
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()
  let y
  const newPage = () => {
    pdf.addPage()
    pdf.setTextColor(23, 32, 51)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('TRANSPORT FOMEK', 16, 20)
    pdf.setFontSize(12)
    pdf.text("Conditions d'enlèvement et de transport", 16, 29)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Version ${version}${reference ? ` | Bordereau ${reference}` : ''}`, 16, 37, { maxWidth: width - 32 })
    pdf.setFontSize(11)
    y = 50
  }
  newPage()
  clauses.forEach((clause, index) => {
    const lines = pdf.splitTextToSize(`${index + 1}. ${clause}`, width - 32)
    for (const line of lines) {
      if (y > height - 22) newPage()
      pdf.text(line, 16, y)
      y += 5.5
    }
    y += 7
  })
  if (hasAcceptance && acceptance.acceptedAt) {
    const raw = acceptance.acceptedAt
    const date = raw.toDate ? raw.toDate() : raw.seconds ? new Date(raw.seconds * 1000) : new Date(raw)
    if (Number.isFinite(date.getTime())) {
      if (y > height - 28) newPage()
      pdf.setFontSize(9)
      pdf.text(`Acceptation enregistrée le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date)}.`, 16, y, { maxWidth: width - 32 })
    }
  }
}
