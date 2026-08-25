// src/utils/contractPdf.js
import jsPDF from "jspdf"
import { normalizeBoxContractTemplate } from "./boxContractTemplate"

/**
 * Génère le PDF "modèle complet" (Contrat + Annexes)
 * - rendu stable (charSpace=0 + normalisation espaces)
 * - pages automatiques
 * - annexes dans l'ordre : Annexe 1, Annexe 2, Annexe 3
 * - signatures (client + prestataire) si dataUrl/base64 dispo
 *
 * Utilisation:
 *   import { generateContractPdf } from "@/utils/contractPdf"
 *   const pdf = generateContractPdf(contract, { contractId: contract.id, save: true })
 *   // ou: pdf.save("test.pdf")
 */
export function generateContractPdf(contract = {}, opts = {}) {
  const { contractId = contract?.id || "", save = false, filename, template = null } = opts || {}

  /* =========================================================
    HELPERS
  ========================================================= */

  const norm = (v) => String(v ?? "").trim()

  const normalizePdfText = (v) =>
    String(v ?? "")
      .replace(/\u00A0/g, " ")
      .replace(/\u202F/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  const todayISO = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  const money = (n) => {
    const v = Number(n || 0)
    return normalizePdfText(
      new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }).format(v)
    )
  }

  /* =========================================================
    SIGNATURES
  ========================================================= */

  const clientSigRaw = norm(contract.clientSignatureDataUrl || "")
  const providerSigRaw = norm(contract.providerSignatureDataUrl || "")

  const detectImageType = (dataUrlOrBase64) => {
    const s = norm(dataUrlOrBase64)
    if (!s) return null
    const m = s.match(/^data:image\/(png|jpeg|jpg|webp);base64,/i)
    if (m) {
      const t = m[1].toLowerCase()
      if (t === "jpg") return "JPEG"
      return t.toUpperCase()
    }
    return "PNG"
  }

  const normalizeDataUrl = (dataUrlOrBase64) => {
    const s = norm(dataUrlOrBase64)
    if (!s) return ""
    if (s.startsWith("data:image/")) return s
    return `data:image/png;base64,${s}`
  }

  const addSignature = (pdf, raw, x, y, w, h) => {
    if (!raw) return false
    try {
      const type = detectImageType(raw)
      if (!type) return false
      const dataUrl = normalizeDataUrl(raw)
      pdf.addImage(dataUrl, type, x, y, w, h, undefined, "FAST")
      return true
    } catch (e) {
      console.warn("Signature invalide/illisible:", e)
      return false
    }
  }

  /* =========================================================
    CONTRACT FIELDS
  ========================================================= */

  const boxCode = norm(contract.boxCode || contract.box?.code || "")
  const siteAddress = norm(contract.siteAddress || "15 Rue des Écoles, 95500 LE THILLAY")
  const startDate = norm(contract.startDate || todayISO())
  const durationChoice = Number(contract.durationChoice || contract.durationMonths || 12)
  const citySigned = norm(contract.citySigned || contract.city || "LE THILLAY")
  const signedDate = norm(
    contract.signedDate || contract.signDate || contract.createdAtDate || todayISO()
  )

  const clientNumber = norm(contract.clientNumber || "")
  const companyName = norm(contract.companyName || "")
  const representativeName = norm(contract.representativeName || "")
  const address = norm(contract.address || "")
  const email = norm(contract.email || "")
  const phone = norm(contract.phone || "")
  const legalFormAndSiren = norm(contract.legalFormAndSiren || "")

  const tvaRate = Number(contract.tvaRate ?? 20)

  const monthlyHT =
    contract.monthlyHT != null
      ? Number(contract.monthlyHT || 0)
      : 0

  const monthlyTTC =
    contract.monthlyTTC != null
      ? Number(contract.monthlyTTC || 0)
      : monthlyHT * (1 + tvaRate / 100)

  const monthlyTVA =
    contract.monthlyTVA != null
      ? Number(contract.monthlyTVA || 0)
      : monthlyTTC - monthlyHT

  const depositEnabled = !!contract.depositEnabled
  const depositMonths = depositEnabled ? Number(contract.depositMonths || 1) : 0
  const paymentMethod = norm(contract.paymentMethod || "virement")

  const depositTTC =
    contract.depositTTC != null
      ? Number(contract.depositTTC || 0)
      : monthlyTTC * depositMonths

  const totalSignatureTTC =
    contract.totalSignatureTTC != null
      ? Number(contract.totalSignatureTTC || 0)
      : monthlyTTC + depositTTC

  const boxLocation = norm(contract.boxLocation || "")
  const boxSurface = norm(contract.boxSurface || "")
  const boxHeight = norm(contract.boxHeight || "")
  const boxVolume = norm(contract.boxVolume || "")
  const accessMode = norm(contract.accessMode || "heures_du_site")
  const accessGiven = norm(contract.accessGiven || "code")
  const accessOther = norm(contract.accessOther || "")
  const padlock = norm(contract.padlock || "client")
  const insuranceCompany = norm(contract.insuranceCompany || "")
  const insurancePolicy = norm(contract.insurancePolicy || "")
  const insuranceAttestationDate = norm(contract.insuranceAttestationDate || "")
  const entryInspectionDone = !!contract.entryInspectionDone
  const photosAttached = !!contract.photosAttached

  const endDate = (() => {
    const start = norm(startDate)
    const months = Number(durationChoice || 12)
    if (!start) return ""
    const dt = new Date(start + "T00:00:00")
    const d0 = dt.getDate()
    dt.setMonth(dt.getMonth() + months)
    if (dt.getDate() !== d0) dt.setDate(0)
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, "0")
    const dd = String(dt.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })()

  const clientName = norm(companyName || representativeName || "")
  const activeTemplate = template ? normalizeBoxContractTemplate(template) : null
  const useDynamicTemplate = !!activeTemplate?.enabled && Array.isArray(activeTemplate.sections) && activeTemplate.sections.length > 0

  const templateVars = {
    contractId,
    providerName: activeTemplate?.provider?.name || "AARON TRAVEL SAS",
    providerAddress: activeTemplate?.provider?.address || siteAddress,
    providerRegistration: activeTemplate?.provider?.registration || "RCS 828 534 214 000 14",
    providerRepresentative: activeTemplate?.provider?.representative || "CAMARA Aboubakar, dûment habilité",
    siteAddress,
    boxCode: boxCode || "[à compléter]",
    boxLocation: boxLocation || "[à compléter]",
    boxSurface: boxSurface || "[à compléter]",
    boxHeight: boxHeight || "[à compléter]",
    boxVolume: boxVolume || "[à compléter]",
    startDate: startDate || "[date]",
    endDate: endDate || "[date]",
    durationChoice: String(durationChoice || ""),
    citySigned: citySigned || "[lieu]",
    signedDate: signedDate || "[date]",
    clientNumber: clientNumber || "",
    clientName: clientName || "[à compléter]",
    companyName: companyName || "",
    representativeName: representativeName || "",
    clientAddress: address || "[à compléter]",
    clientEmail: email || "[à compléter]",
    clientPhone: phone || "[à compléter]",
    legalFormAndSiren: legalFormAndSiren || "",
    monthlyHT: money(monthlyHT),
    monthlyTVA: money(monthlyTVA),
    monthlyTTC: money(monthlyTTC),
    tvaRate: String(tvaRate),
    depositMonths: String(depositMonths),
    depositTTC: money(depositTTC),
    totalSignatureTTC: money(totalSignatureTTC),
    paymentMethod,
    accessMode,
    accessGiven,
    accessOther,
    padlock,
    insuranceCompany: insuranceCompany || "[à compléter]",
    insurancePolicy: insurancePolicy || "[à compléter]",
    insuranceAttestationDate: insuranceAttestationDate || "[à compléter]",
  }

  const fillTemplate = (value) =>
    String(value ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => templateVars[key] ?? "")

  /* =========================================================
    PDF SETUP
  ========================================================= */

  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  const M = { left: 18, right: 18, top: 18, bottom: 16 }
  let y = M.top

  const base = () => {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(11)
    pdf.setTextColor(20)
    pdf.setCharSpace(0)
  }
  base()

  const ensure = (h = 10) => {
    if (y + h > pageH - M.bottom) {
      pdf.addPage()
      y = M.top
      base()
    }
  }

  const text = (s, opts2 = {}) => {
    const {
      size = 11,
      bold = false,
      italic = false,
      align = "left",
      color = 20,
      leading = 5.2,
      gapAfter = 2,
      maxWidth = pageW - M.left - M.right,
    } = opts2

    const clean = normalizePdfText(s)
    if (!clean) return

    ensure(leading + 2)
    pdf.setCharSpace(0)
    pdf.setTextColor(color)

    let style = "normal"
    if (bold && italic) style = "bolditalic"
    else if (bold) style = "bold"
    else if (italic) style = "italic"

    pdf.setFont("helvetica", style)
    pdf.setFontSize(size)

    const lines = pdf.splitTextToSize(clean, maxWidth)
    for (const line of lines) {
      ensure(leading + 2)
      if (align === "center") pdf.text(line, pageW / 2, y, { align: "center" })
      else if (align === "right") pdf.text(line, pageW - M.right, y, { align: "right" })
      else pdf.text(line, M.left, y)
      y += leading
    }
    y += gapAfter
    base()
  }

  const heading = (s, level = 1) => {
    if (level === 1) text(s, { size: 14, bold: true, align: "center", leading: 6.2, gapAfter: 5 })
    if (level === 2) text(s, { size: 12.5, bold: true, leading: 6, gapAfter: 2 })
    if (level === 3) text(s, { size: 11.5, bold: true, leading: 5.8, gapAfter: 1 })
  }

  const bullet = (s) => {
    const clean = normalizePdfText(s)
    const maxWidth = pageW - M.left - M.right - 6
    const lines = pdf.splitTextToSize(clean, maxWidth)
    ensure(6)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(11)
    pdf.setCharSpace(0)
    pdf.text("•", M.left, y)
    for (const line of lines) {
      ensure(6)
      pdf.text(line, M.left + 6, y)
      y += 5.2
    }
    y += 1.5
    base()
  }

  const smallNote = (s) => text(s, { size: 9.5, color: 60, leading: 4.6, gapAfter: 4 })

  const hr = () => {
    ensure(8)
    pdf.setDrawColor(220)
    pdf.line(M.left, y, pageW - M.right, y)
    y += 6
    base()
  }

  const addFooter = () => {
    const pages = pdf.getNumberOfPages()
    for (let p = 1; p <= pages; p++) {
      pdf.setPage(p)
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(9)
      pdf.setTextColor(120)
      pdf.setCharSpace(0)
      pdf.text(`Contrat ID: ${normalizePdfText(contractId || "—")}`, M.left, pageH - 10)
      pdf.text(`${p}`, pageW / 2, pageH - 10, { align: "center" })
    }
    base()
  }

  const dotLine = (x1, x2, yy) => {
    pdf.setDrawColor(120)
    pdf.setLineWidth(0.2)
    for (let x = x1; x < x2; x += 2.2) pdf.line(x, yy, x + 1.1, yy)
    pdf.setLineWidth(0.2)
    base()
  }

  const writeLabelValueDots = (label, value, yy) => {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(11)
    pdf.setTextColor(20)
    pdf.setCharSpace(0)

    pdf.text(label, M.left, yy)
    const xVal = M.left + 42
    const xEnd = pageW - M.right
    dotLine(xVal, xEnd, yy + 1)

    if (norm(value)) {
      const maxW = xEnd - xVal
      let v = normalizePdfText(value)
      while (v.length && pdf.getTextWidth(v) > maxW) v = v.slice(0, -1)
      pdf.text(v, xVal, yy)
    }
    base()
  }

  const checkbox = (x, yy, checked) => {
    pdf.setDrawColor(40)
    pdf.rect(x, yy - 3.3, 3.3, 3.3)
    if (checked) {
      pdf.setLineWidth(0.5)
      pdf.line(x + 0.6, yy - 1.8, x + 1.5, yy - 0.6)
      pdf.line(x + 1.5, yy - 0.6, x + 2.8, yy - 2.8)
      pdf.setLineWidth(0.2)
    }
    base()
  }

  const renderSignatures = () => {
    ensure(35)
    text("Les Parties déclarent l'avoir lu, compris et accepté.", { gapAfter: 3 })
    text(`Fait à ${citySigned || "[lieu]"}, le ${signedDate || "[date]"}.`, { gapAfter: 8 })

    ensure(60)

    const sigGap = 10
    const sigW = (pageW - M.left - M.right - sigGap) / 2
    const sigH = 32
    const sigY = y + 8

    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(11)
    pdf.setTextColor(20)
    pdf.text("Le prestataire", M.left, sigY - 3)
    pdf.text("Le client", M.left + sigW + sigGap, sigY - 3)

    pdf.setDrawColor(60)
    pdf.rect(M.left, sigY, sigW, sigH)
    pdf.rect(M.left + sigW + sigGap, sigY, sigW, sigH)

    const pad = 2
    const okProvider = addSignature(pdf, providerSigRaw, M.left + pad, sigY + pad, sigW - pad * 2, sigH - pad * 2)
    const okClient = addSignature(pdf, clientSigRaw, M.left + sigW + sigGap + pad, sigY + pad, sigW - pad * 2, sigH - pad * 2)

    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.setTextColor(120)
    if (!okProvider) pdf.text("Signature non fournie", M.left + 4, sigY + sigH / 2)
    if (!okClient) pdf.text("Signature non fournie", M.left + sigW + sigGap + 4, sigY + sigH / 2)
    pdf.setTextColor(20)

    y = sigY + sigH + 10
    base()

    hr()
  }

  const renderDynamicContract = () => {
    heading(fillTemplate(activeTemplate.title), 1)
    smallNote(fillTemplate(activeTemplate.legalNotice))

    for (const section of activeTemplate.sections) {
      heading(fillTemplate(section.title), 2)
      for (const paragraph of section.paragraphs || []) {
        text(fillTemplate(paragraph), { gapAfter: 3 })
      }
      y += 2
    }

    renderSignatures()
  }

  /* =========================================================
    CONTRAT
  ========================================================= */

  if (useDynamicTemplate) {
    renderDynamicContract()
  } else {

  heading("Contrat de mise à disposition d’un box de stockage", 1)

  smallNote(
    "Attention : Ce document est un modèle de contrat proposé à titre d’exemple. Il ne constitue pas un conseil juridique et doit être adapté à votre situation particulière. L’utilisateur est invité à consulter un professionnel du droit avant toute utilisation. Les dispositions ci-dessous tiennent compte des recommandations de la Commission des clauses abusives et de la réglementation française en vigueur."
  )

  heading("1. Parties au contrat", 2)

  text("Le prestataire :", { bold: true })
  bullet("Dénomination sociale : AARON TRAVEL SAS (ou la société exploitant le service de self-stockage).")
  bullet(`Siège social : ${siteAddress}.`)
  bullet("Numéro d’immatriculation au RCS : RCS 828 534 214 000 14")
  bullet("Représentée par : CAMARA Aboubakar, dûment habilité.")

  text("Le client :", { bold: true })
  bullet(`Nom : ${norm(representativeName) ? representativeName : "[à compléter]"}.`)
  bullet(`Adresse postale : ${norm(address) ? address : "[à compléter]"}.`)
  bullet(`Adresse électronique : ${norm(email) ? email : "[à compléter]"}.`)
  bullet(
    `(Le cas échéant) Société/forme juridique et numéro SIREN : ${
      norm(legalFormAndSiren) ? legalFormAndSiren : "[à compléter]"
    }.`
  )

  text(
    "Le prestataire et le client sont ci-après désignés collectivement les « Parties » et individuellement une « Partie ».",
    { gapAfter: 5 }
  )

  heading("2. Objet du contrat", 2)
  text(
    "Le présent contrat a pour objet de définir les conditions dans lesquelles le prestataire met à disposition du client un box de stockage privatif (ci-après le « Box ») situé dans les locaux du prestataire. Ce contrat constitue un contrat de location d’emplacement en libre-service et non un contrat de dépôt : le prestataire ne prend pas en garde les biens entreposés et n’a pas connaissance de leur contenu. Le client reste seul responsable de ses biens.",
    { gapAfter: 6 }
  )

  heading("3. Description du Box", 2)
  text("Le Box mis à disposition est décrit dans les Conditions particulières, qui précisent notamment :", { gapAfter: 2 })
  bullet("Le numéro ou l’identification du Box ;")
  bullet("Sa localisation au sein du site de stockage ;")
  bullet(
    "Ses dimensions approximatives (longueur, largeur, hauteur) et sa surface ou volume exacts, conformément aux recommandations de la Commission des clauses abusives ;"
  )
  bullet("Ses équipements (porte sécurisée, système de détection incendie, éclairage, etc.).")
  text(
    "En cas d’erreur manifeste sur la surface ou le volume indiqué, les Parties conviennent de corriger l’erreur sans que cela remette en cause la validité du contrat. Le Box est remis en bon état d’usage ; un état des lieux d’entrée contradictoire peut être établi à la demande du prestataire ou du client.",
    { gapAfter: 6 }
  )

  heading("4. Durée du contrat", 2)
  heading("4.1 Durée initiale", 3)
  text(
    "Le contrat est conclu pour une durée initiale ferme choisie parmi les options suivantes : 1 mois, 3 mois, 6 mois, 9 mois ou 12 mois. La durée choisie est indiquée dans les Conditions particulières en cochant la case correspondante. Durant cette période initiale, le contrat ne peut être résilié qu’aux conditions prévues à l’article 11.",
    { gapAfter: 4 }
  )
  heading("4.2 Tacite reconduction et notification", 3)
  text(
    "À l’expiration de la durée initiale, le contrat est tacitement reconduit pour des périodes successives d’une durée égale à la durée initiale, sauf dénonciation par l’une ou l’autre des Parties conformément à l’article 11.",
    { gapAfter: 4 }
  )
  text(
    "Conformément à l’article L.215-1 du Code de la consommation (loi Chatel), lorsque le client est un consommateur, le prestataire l’informe par écrit, au plus tôt trois mois et au plus tard un mois avant le terme de la période initiale, de la possibilité de ne pas reconduire le contrat. S’il ne reçoit pas cette information, le client peut mettre fin au contrat à tout moment sans frais à compter de la date de reconduction tacite.",
    { gapAfter: 4 }
  )
  text(
    "Lorsque le contrat a été conclu à distance ou hors établissement et que le client est consommateur, le prestataire permet la résiliation en ligne sans frais (article L.215-1-1 du Code de la consommation).",
    { gapAfter: 6 }
  )

  heading("5. Redevance et modalités de paiement", 2)
  heading("5.1 Montant", 3)
  text(
    "La redevance mensuelle HT et TTC est indiquée dans les Conditions particulières. Le montant est payable à échoir, c’est-à-dire au début de chaque période mensuelle, même pendant la période initiale de plusieurs mois.",
    { gapAfter: 4 }
  )

  heading("5.2 Indexation", 3)
  text(
    "À chaque date anniversaire du contrat (tous les douze mois), le montant de la redevance peut être révisé selon la variation de l’Indice des loyers commerciaux (ILC) publié par l’INSEE : [ = × ].",
    { gapAfter: 2 }
  )
  text(
    "L’indice de référence est celui publié pour le trimestre civil connu à la date de signature (précisé en Conditions particulières).",
    { gapAfter: 6 }
  )

  heading("5.3 Dépôt de garantie", 3)
  if (depositEnabled) {
    text(
      `Le client verse, lors de la signature, un dépôt de garantie d’un montant équivalent à ${depositMonths} mois de redevance TTC (soit ${money(
        depositTTC
      )} € TTC si on prend la redevance actuelle). Ce dépôt garantit l’exécution de toutes les obligations contractuelles. Il est restitué dans un délai de trente jours après la restitution du Box et paiement de l’intégralité des sommes dues, déduction faite des éventuelles réparations ou sommes restant à acquitter.`,
      { gapAfter: 6 }
    )
  } else {
    text("Aucun dépôt de garantie n’est exigé pour ce contrat (option désactivée dans les Conditions particulières).", {
      gapAfter: 6,
    })
  }

  heading("5.4 Modalités de règlement", 3)
  text(
    "Le paiement s’effectue par virement bancaire, prélèvement automatique, carte bancaire ou tout autre moyen convenu dans les Conditions particulières. À défaut de règlement à l’échéance :",
    { gapAfter: 2 }
  )
  bullet(
    "Intérêts de retard : des intérêts sont dus de plein droit, calculés au taux d’intérêt légal majoré de cinq points (consommateur) ou au taux d’intérêt appliqué par la Banque centrale européenne à son opération de refinancement la plus récente majoré de dix points (client professionnel), conformément aux articles L.441-10 et suivants du Code de commerce."
  )
  bullet("Indemnité forfaitaire : pour les clients professionnels, une indemnité de recouvrement de 40 € est due (article L.441-10).")
  bullet("Frais de rappel : une indemnité forfaitaire de 20 € peut être facturée pour couvrir les frais administratifs en cas de rappel.")
  bullet(
    "Mise en demeure : en cas d’impayé persistant huit jours après un rappel, le prestataire adresse au client une mise en demeure par courrier recommandé ou par e-mail avec accusé de réception. Si la situation n’est pas régularisée dans un délai de quinze jours à compter de la mise en demeure, le prestataire pourra suspendre l’accès au Box (par ajout d’un cadenas) à titre conservatoire et engager la procédure de résiliation prévue à l’article 11."
  )
  bullet("Intérêts capitalisés : les intérêts de retard sont capitalisés mensuellement.")
  y += 2

  heading("6. Assurance", 2)
  text(
    "Le client s’engage à assurer les biens entreposés pour leur valeur réelle contre tous les risques (incendie, dégât des eaux, vol, explosion…). Il fournit au prestataire, lors de la signature et à chaque renouvellement, une attestation d’assurance valable pendant toute la durée du contrat.",
    { gapAfter: 3 }
  )
  text("À défaut d’assurance ou de remise de l’attestation, le prestataire se réserve la faculté :", { gapAfter: 1 })
  bullet("D’exiger la souscription immédiate d’une assurance adéquate et de suspendre l’accès au Box jusqu’à réception de l’attestation ;")
  bullet("De souscrire une assurance pour le compte du client et de lui refacturer le coût de la prime ;")
  bullet("Ou de résilier le contrat selon les modalités de l’article 11.")
  text(
    "Le client est responsable des dommages qu’il pourrait causer aux installations, aux tiers ou aux autres locataires. Il garantit et indemnise le prestataire contre toute réclamation en raison du contenu stocké ou de l’usage du Box.",
    { gapAfter: 6 }
  )

  heading("7. Obligations du client", 2)
  text("Le client s’engage :", { gapAfter: 2 })
  bullet(
    "À n’entreposer dans le Box que des biens licites, secs, non périssables et inodores, ne nécessitant aucun permis particulier. Sont notamment interdits : denrées alimentaires et produits périssables, animaux, plantes, substances explosives ou inflammables, matières dangereuses, corrosives, toxiques ou radioactives, armes ou munitions, produits interdits par la loi, objets à valeur patrimoniale exceptionnelle ou œuvres d’art de grande valeur sans accord préalable."
  )
  bullet(
    "À respecter les règles de sécurité du site (horaires d’accès, consignes d’évacuation, interdiction de fumer) et le règlement intérieur affiché sur place. Toute utilisation des espaces communs ou du quai de déchargement en dehors des conditions fixées peut donner lieu à une redevance supplémentaire (50 € par m³ et par jour d’occupation illicite des parties communes)."
  )
  bullet("À ne pas utiliser le Box comme adresse de domiciliation, local de vente, atelier de fabrication ou lieu d’habitation.")
  bullet("À maintenir le Box en bon état de propreté et à le restituer dans le même état qu’à son entrée, sous réserve de l’usure normale.")
  bullet("À ne pas céder ou sous-louer le Box sans l’accord écrit du prestataire. Le contrat est conclu intuitu personae en considération de la personne du client.")
  bullet("À informer immédiatement le prestataire de toute modification de ses coordonnées (adresse postale, e-mail, coordonnées bancaires).")
  bullet(
    "À permettre, en cas de péril imminent ou sur réquisition des autorités, l’accès au Box par le prestataire ou par les services de secours, étant précisé que toute ouverture du Box sans la présence du client fera l’objet d’un constat."
  )
  y += 2

  heading("8. Obligations du prestataire", 2)
  text("Le prestataire s’engage :", { gapAfter: 2 })
  bullet("À mettre à disposition un Box sécurisé et en bon état d’usage, conforme à la description figurant aux Conditions particulières ;")
  bullet("À assurer l’entretien des parties communes (éclairage, vidéosurveillance, accès, parking) et la sécurité générale du site (systèmes d’alarme, prévention incendie), conformément à la réglementation en vigueur ;")
  bullet(
    "À respecter la vie privée du client et à ne pas pénétrer dans le Box sauf cas d’urgence (incendie, dégât des eaux, suspicion de présence de matières dangereuses) ou sur injonction des autorités compétentes. Dans ces cas, le client est informé dans les meilleurs délais."
  )
  y += 2

  heading("9. Responsabilité", 2)
  text(
    "En sa qualité de loueur d’espace et non de dépositaire, le prestataire ne prend pas en charge la garde des biens entreposés. La responsabilité du prestataire ne saurait être engagée en cas de perte, détérioration, vol ou destruction des biens, sauf faute prouvée de sa part. Toute clause supprimant ou limitant le droit du client à obtenir réparation en cas de manquement du prestataire est réputée abusive et non écrite.",
    { gapAfter: 3 }
  )
  text(
    "Le client demeure propriétaire exclusif des biens stockés et supporte seul les risques liés à leur entreposage. Il garantit le prestataire contre tout recours de tiers fondé sur la nature ou la propriété des biens.",
    { gapAfter: 6 }
  )

  heading("10. Accès au site et suspension", 2)
  text(
    "Le client peut accéder à son Box aux jours et heures d’ouverture indiqués dans le règlement intérieur. Un accès en dehors de ces horaires peut être autorisé à titre exceptionnel par le prestataire.",
    { gapAfter: 3 }
  )
  text(
    "En cas de non-respect des obligations contractuelles (impayé après mise en demeure, stockage de biens interdits, trouble de voisinage, danger pour les personnes ou les biens), le prestataire peut suspendre l’accès au Box par pose d’un second cadenas. Cette suspension est une mesure conservatoire ; elle n’entraîne pas la résiliation immédiate du contrat. Le prestataire informe le client des motifs de la suspension et l’invite à régulariser sa situation.",
    { gapAfter: 6 }
  )

  heading("11. Résiliation et fin de contrat", 2)
  heading("11.1 Résiliation à l’initiative du client", 3)
  text(
    "Le client peut résilier le contrat à l’issue de la durée initiale ou d’une période reconduite en respectant un préavis d’un mois notifié par lettre recommandée avec accusé de réception ou par e-mail avec accusé de réception. La résiliation prend effet à l’expiration de la période en cours, le client demeurant redevable de la redevance jusqu’au terme convenu.",
    { gapAfter: 4 }
  )
  heading("11.2 Résiliation à l’initiative du prestataire", 3)
  text(
    "Le prestataire peut résilier le contrat à l’expiration de toute période en respectant un préavis d’un mois notifié au client. Il peut également résilier le contrat de plein droit et sans indemnité :",
    { gapAfter: 2 }
  )
  bullet("En cas d’impayé persistant trente jours après mise en demeure restée infructueuse ;")
  bullet("En cas de violation grave ou répétée des obligations du client (stockage de biens prohibés, non-respect des règles de sécurité, sous-location non autorisée, comportement dangereux) après rappel ;")
  bullet("En cas de force majeure rendant l’utilisation du Box impossible (incendie, sinistre majeur, décision administrative de fermeture).")
  text(
    "La résiliation pour faute prend effet huit jours après notification au client. Le prestataire se réserve le droit de demander réparation de son préjudice. Le client doit alors libérer le Box et retirer ses biens dans un délai de quinze jours ; à défaut, il sera réputé avoir abandonné les biens. Le prestataire saisira le tribunal compétent pour être autorisé à en disposer conformément à la loi (procédure d’enlèvement ou de vente judiciaire), les frais étant à la charge du client.",
    { gapAfter: 4 }
  )
  heading("11.3 Restitution du Box", 3)
  text(
    "À l’issue du contrat, le client restitue le Box dans l’état où il l’a reçu, vide et propre. Un état des lieux contradictoire est établi à la restitution pour déterminer d’éventuelles dégradations. La restitution des clés et de l’éventuel badge d’accès marque la fin effective de la mise à disposition. Les frais de nettoyage ou de réparation nécessaires seront retenus sur le dépôt de garantie.",
    { gapAfter: 6 }
  )

  heading("12. Protection des données", 2)
  text(
    "Les données personnelles du client recueillies pour les besoins du présent contrat (identité, coordonnées, numéro de pièce d’identité, moyens de paiement) sont traitées par le prestataire conformément au Règlement général sur la protection des données (RGPD). Elles sont conservées pendant la durée du contrat et cinq ans après sa fin pour des raisons légales (prescription). Le client dispose d’un droit d’accès, de rectification, d’effacement, d’opposition, de limitation et de portabilité des données en s’adressant au prestataire à l’adresse indiquée au début du contrat. Le client peut également introduire une réclamation auprès de la CNIL.",
    { gapAfter: 6 }
  )

  heading("13. Médiation de la consommation", 2)
  text(
    "Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, le prestataire a adhéré à un dispositif de médiation de la consommation. En cas de litige non résolu à l’amiable, le client consommateur peut saisir le médiateur compétent dont les coordonnées sont :",
    { gapAfter: 2 }
  )
  text("Nom du médiateur : [à compléter (par exemple, CM2C – Centre de la Médiation de la Consommation de Conciliateurs de Justice)].", { gapAfter: 1 })
  text("Adresse : [adresse du médiateur].", { gapAfter: 1 })
  text("Site web : [URL du médiateur].", { gapAfter: 2 })
  text("Les modalités de saisine du médiateur (dépôt de dossier en ligne ou par courrier, délais, coûts) sont détaillées sur son site. Cette médiation est gratuite pour le consommateur.", {
    gapAfter: 6,
  })

  heading("14. Droit applicable et juridiction compétente", 2)
  text(
    "Le présent contrat est régi par le droit français. Tout litige relatif à son interprétation ou à son exécution sera soumis aux tribunaux compétents du ressort du siège social du prestataire si le client est un professionnel. Si le client est un consommateur, il pourra saisir, à son choix, la juridiction du lieu de domicile du prestataire ou du sien.",
    { gapAfter: 6 }
  )

  heading("15. Dispositions finales", 2)
  text(
    "1. Nullité partielle : Si l’une quelconque des clauses du contrat est déclarée nulle ou réputée non écrite par une autorité judiciaire, les autres clauses conserveront leur plein effet.",
    { gapAfter: 2 }
  )
  text(
    "2. Modification du contrat : Aucune modification ne sera valable sans un écrit signé des deux Parties. Toute modification unilatérale par simple affichage ou publication est prohibée, conformément au Code de la consommation.",
    { gapAfter: 2 }
  )
  text(
    "3. Documents contractuels : Font partie intégrante du présent contrat : les Conditions particulières signées, le règlement intérieur du site, les Conditions générales de vente (CGV) remises au client, l’état des lieux, les éventuels avenants (assurance, mandat SEPA, etc.). L’ensemble de ces documents doit être remis au client lors de la signature ; à défaut, les clauses correspondantes peuvent être déclarées inopposables.",
    { gapAfter: 2 }
  )
  text("4. Communication des documents : Le client reconnaît avoir reçu copie du présent contrat, des CGV et du règlement intérieur.", { gapAfter: 2 })
  text("5. Signature : Le contrat est établi en deux exemplaires originaux, un pour chaque Partie.", { gapAfter: 6 })

  ensure(35)
  text("Les Parties déclarent l’avoir lu, compris et accepté.", { gapAfter: 3 })
  text(`Fait à ${citySigned || "[lieu]"}, le ${signedDate || "[date]"}.`, { gapAfter: 8 })

  ensure(60)

  const sigGap = 10
  const sigW = (pageW - M.left - M.right - sigGap) / 2
  const sigH = 32
  const sigY = y + 8

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.text("Le prestataire", M.left, sigY - 3)
  pdf.text("Le client", M.left + sigW + sigGap, sigY - 3)

  pdf.setDrawColor(60)
  pdf.rect(M.left, sigY, sigW, sigH)
  pdf.rect(M.left + sigW + sigGap, sigY, sigW, sigH)

  const pad = 2
  const okProvider = addSignature(pdf, providerSigRaw, M.left + pad, sigY + pad, sigW - pad * 2, sigH - pad * 2)
  const okClient = addSignature(pdf, clientSigRaw, M.left + sigW + sigGap + pad, sigY + pad, sigW - pad * 2, sigH - pad * 2)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  if (!okProvider) pdf.text("Signature non fournie", M.left + 4, sigY + sigH / 2)
  if (!okClient) pdf.text("Signature non fournie", M.left + sigW + sigGap + 4, sigY + sigH / 2)
  pdf.setTextColor(20)

  y = sigY + sigH + 10
  base()

  hr()
  }

  /* =========================================================
    ANNEXE 1
  ========================================================= */

  pdf.addPage()
  y = M.top
  base()

  heading("Annexe 1 · Conditions Particulières / Fiche Box", 2)
  y += 2

  text("Site de stockage :", { bold: true, gapAfter: 2 })
  writeLabelValueDots("Adresse :", siteAddress, y)
  y += 8
  text("Plan de repérage : Le client reconnaît avoir reçu le plan du site « Aaron Travel » avec le repérage du box.", {
    size: 10.5,
    gapAfter: 6,
  })

  text("Client :", { bold: true, gapAfter: 2 })
  writeLabelValueDots("Nom/Raison sociale :", companyName || representativeName, y)
  y += 8
  writeLabelValueDots("Adresse :", address, y)
  y += 8
  writeLabelValueDots("Téléphone/E-mail :", `${phone || ""}${phone && email ? " / " : ""}${email || ""}`, y)
  y += 8

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("Qualité du client :", M.left, y)
  checkbox(M.left + 42, y, false)
  pdf.text("Particulier (consommateur)", M.left + 47, y)
  checkbox(M.left + 105, y, false)
  pdf.text("Professionnel", M.left + 110, y)
  y += 10
  base()

  text("Box loué :", { bold: true, gapAfter: 2 })
  writeLabelValueDots("Référence du box :", boxCode, y)
  y += 8
  writeLabelValueDots("Localisation (allée, étage) :", boxLocation, y)
  y += 8
  writeLabelValueDots("Surface exacte (m²) :", boxSurface, y)
  y += 8
  writeLabelValueDots("Hauteur (m) :", boxHeight, y)
  y += 8
  writeLabelValueDots("Volume (m³) :", boxVolume, y)
  y += 10

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("Accès :", M.left, y)

  const is247 = accessMode === "24_7"
  const isHours = accessMode === "heures_du_site"
  const isRDV = accessMode === "sur_rdv"

  checkbox(M.left + 20, y, is247)
  pdf.text("24/7", M.left + 25, y)
  checkbox(M.left + 40, y, isHours)
  pdf.text("heures du site", M.left + 45, y)
  checkbox(M.left + 82, y, isRDV)
  pdf.text("sur RDV", M.left + 87, y)
  y += 10

  pdf.text("Moyen d’accès remis :", M.left, y)
  const isBadge = accessGiven === "badge"
  const isCle = accessGiven === "cle"
  const isCode = accessGiven === "code"
  const isOther = accessGiven === "autre"

  checkbox(M.left + 45, y, isBadge)
  pdf.text("badge", M.left + 50, y)
  checkbox(M.left + 68, y, isCle)
  pdf.text("clé", M.left + 73, y)
  checkbox(M.left + 82, y, isCode)
  pdf.text("code", M.left + 87, y)
  checkbox(M.left + 103, y, isOther)
  pdf.text("autre :", M.left + 108, y)
  dotLine(M.left + 125, pageW - M.right, y + 1)
  if (isOther && norm(accessOther)) pdf.text(normalizePdfText(accessOther), M.left + 125, y)
  y += 10
  base()

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("Cadenas :", M.left, y)

  const padClient = padlock === "client"
  const padPrest = padlock === "prestataire"

  checkbox(M.left + 25, y, padClient)
  pdf.text("fourni par le client", M.left + 30, y)
  checkbox(M.left + 78, y, padPrest)
  pdf.text("fourni par le prestataire", M.left + 83, y)
  y += 12
  base()

  text("Durée du contrat :", { bold: true, gapAfter: 2 })

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("Durée initiale choisie :", M.left, y)

  const opt = [1, 3, 6, 9, 12]
  let x = M.left + 55
  for (const o of opt) {
    checkbox(x, y, Number(durationChoice) === o)
    pdf.text(`${o} mois`, x + 5, y)
    x += 22
  }
  y += 10

  writeLabelValueDots("Date de début :", startDate, y)
  y += 8
  writeLabelValueDots("Date de fin de période initiale :", endDate, y)
  y += 8
  text("Reconduction tacite : Le contrat se reconduit pour des périodes identiques, sauf résiliation conformément aux conditions contractuelles.", {
    size: 10.5,
    gapAfter: 6,
  })

  text("Prix et dépôt de garantie :", { bold: true, gapAfter: 2 })
  writeLabelValueDots("Loyer mensuel TTC :", `${money(monthlyTTC)} €`, y)
  y += 8
  writeLabelValueDots(`Dont TVA (${Number(tvaRate)} %) :`, `${money(monthlyTVA)} €`, y)
  y += 8
  writeLabelValueDots("Loyer mensuel HT :", `${money(monthlyHT)} €`, y)
  y += 8
  writeLabelValueDots("Dépôt de garantie :", depositEnabled ? `${money(depositTTC)} €` : "—", y)
  y += 10

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("Modalités de paiement :", M.left, y)

  const cbx = (xx, labelText, checked) => {
    checkbox(xx, y, checked)
    pdf.text(labelText, xx + 5, y)
  }
  cbx(M.left + 45, "virement", paymentMethod === "virement")
  cbx(M.left + 72, "prélèvement", paymentMethod === "prelevement")
  cbx(M.left + 110, "carte bancaire", paymentMethod === "carte")
  cbx(M.left + 155, "espèces", paymentMethod === "especes")
  y += 10
  base()

  text("Échéance : Paiement d’avance au 1er de chaque mois", { gapAfter: 6 })

  text("Assurance des biens :", { bold: true, gapAfter: 2 })
  writeLabelValueDots("Assureur :", insuranceCompany, y)
  y += 8
  writeLabelValueDots("Numéro de police :", insurancePolicy, y)
  y += 8
  writeLabelValueDots("Attestation fournie le :", insuranceAttestationDate, y)
  y += 10

  text("État des lieux :", { bold: true, gapAfter: 2 })
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("État des lieux d’entrée réalisé :", M.left, y)
  checkbox(M.left + 60, y, !!entryInspectionDone)
  pdf.text("oui", M.left + 65, y)
  checkbox(M.left + 75, y, !entryInspectionDone)
  pdf.text("non", M.left + 80, y)
  y += 10

  pdf.text("Photos datées annexées :", M.left, y)
  checkbox(M.left + 50, y, !!photosAttached)
  pdf.text("oui", M.left + 55, y)
  checkbox(M.left + 65, y, !photosAttached)
  pdf.text("non", M.left + 70, y)
  y += 12
  base()

  text("Signatures :", { bold: true, gapAfter: 2 })
  writeLabelValueDots("Fait à :", citySigned, y)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)
  pdf.text("le :", pageW - M.right - 55, y)
  dotLine(pageW - M.right - 42, pageW - M.right, y + 1)
  if (norm(signedDate)) pdf.text(normalizePdfText(signedDate), pageW - M.right - 42, y)
  y += 10
  base()

  text("Signature du client (précédée de 'lu et approuvé') :", { gapAfter: 5 })
  const lineY1 = y + 2
  dotLine(M.left, pageW - M.right, lineY1)
  addSignature(pdf, clientSigRaw, M.left + 2, lineY1 - 18, pageW - M.left - M.right - 4, 16)
  y += 22

  text("Signature du prestataire (précédée de 'lu et approuvé') :", { gapAfter: 5 })
  const lineY2 = y + 2
  dotLine(M.left, pageW - M.right, lineY2)
  addSignature(pdf, providerSigRaw, M.left + 2, lineY2 - 18, pageW - M.left - M.right - 4, 16)

  /* =========================================================
    ANNEXE 2
  ========================================================= */

  pdf.addPage()
  y = M.top
  base()

  heading("Annexe 2 · Règlement Intérieur", 2)

  const reg = [
    {
      t: "1. Accès au site",
      p: [
        "L’accès est réservé aux clients en cours de contrat et aux personnes les accompagnant sous leur responsabilité.",
        "Il est interdit de prêter ou de communiquer ses moyens d’accès (badge, clé, code) à des tiers non autorisés.",
        "Le client doit refermer les portes et portails après chaque passage et veiller à ce que l’accès au site demeure sécurisé.",
      ],
    },
    {
      t: "2. Circulation · Allées et parties communes",
      p: [
        "Les allées et parties communes doivent impérativement rester libres de tout objet ou encombrant. Il est interdit d’y stocker des effets, même temporairement.",
        "Le client doit circuler avec prudence et utiliser les chariots et matériels mis à disposition de manière appropriée, puis les remettre à leur emplacement.",
        "Tout objet abandonné dans les parties communes pourra être évacué par le prestataire aux frais du client.",
      ],
    },
    {
      t: "3. Quai et zone de déchargement",
      p: [
        "L’espace quai est réservé aux opérations de chargement et déchargement. Le stationnement y est limité au temps strictement nécessaire.",
        "Il est interdit de bloquer l’accès au quai et aux autres boxes. En cas de nécessité, l’accès doit être partagé avec courtoisie.",
        "Les véhicules doivent être stationnés sur les emplacements prévus. Le moteur doit être coupé pendant la manutention.",
      ],
    },
    {
      t: "4. Sécurité et interdictions",
      p: [
        "Il est strictement interdit de fumer ou de manipuler des flammes nues dans l’ensemble du site.",
        "Il est interdit de stocker des matières dangereuses, inflammables, explosives ou illégales, des denrées périssables, des animaux ou des produits sensibles nécessitant une température contrôlée.",
        "Tout appareil électrique, machine ou outillage utilisé à l’intérieur du box doit faire l’objet d’une autorisation écrite du prestataire.",
      ],
    },
    {
      t: "5. Vidéosurveillance et contrôle des accès",
      p: [
        "Le site est équipé de caméras de vidéosurveillance dans les parties communes pour assurer la sécurité des personnes et des biens.",
        "Les enregistrements sont conservés pendant une durée maximale de 30 jours puis automatiquement effacés, sauf en cas d’incident nécessitant leur conservation plus longue.",
        "Les données issues de la vidéosurveillance sont traitées par le prestataire conformément à la réglementation sur la protection des données personnelles (RGPD). Les personnes filmées peuvent exercer leurs droits auprès du prestataire.",
      ],
    },
    {
      t: "6. Propreté et déchets",
      p: [
        "Le client est responsable de la propreté du box et de son environnement immédiat.",
        "Les déchets (cartons, palettes, emballages) doivent être évacués par le client. Toute évacuation effectuée par le prestataire sera facturée au client sur justificatif.",
      ],
    },
    {
      t: "7. Nuisances et respect du site",
      p: [
        "Les activités bruyantes, salissantes ou nuisant à la tranquillité (bricolage intensif, peinture, transformation de produits, etc.) sont interdites sans autorisation écrite.",
        "Il est interdit de transformer le box en atelier ou en lieu de résidence.",
        "Les nuisances sonores, olfactives ou visuelles sont proscrites.",
      ],
    },
    {
      t: "8. Contrôle, urgences et intervention",
      p: [
        "Le prestataire n’a pas accès au box en temps normal. Toutefois, en cas de situation d’urgence (incendie, dégât des eaux, odeur suspecte, fuite, péril imminent) ou sur réquisition des autorités, il peut accéder au box en présence du client ou, à défaut, seul.",
        "Le prestataire informera le client de l’intervention dès que possible et dressera un constat en présence d’un huissier si nécessaire.",
      ],
    },
    {
      t: "9. Sanctions en cas de manquement",
      p: [
        "En cas de non-respect du présent règlement ou des obligations contractuelles (impayé, stockage de produits interdits, occupation abusive des parties communes, nuisances), le prestataire pourra :",
        "· mettre le client en demeure de se conformer à ses obligations ;",
        "· facturer les frais occasionnés (nettoyage, remise en état, évacuation, constat) sur justificatifs ;",
        "· suspendre temporairement l’accès au box en tant que mesure conservatoire ;",
        "· résilier le contrat de plein droit dans les conditions prévues au contrat.",
        "Les sanctions financières doivent rester proportionnées aux frais réels exposés par le prestataire et ne pourront excéder les plafonds prévus au contrat.",
        "Le présent règlement intérieur est remis au client qui en prend connaissance et s’engage à le respecter.",
      ],
    },
  ]

  for (const sec of reg) {
    heading(sec.t, 3)
    for (const p of sec.p) text(p, { gapAfter: 2 })
    y += 2
  }

  /* =========================================================
    ANNEXE 3
  ========================================================= */

  pdf.addPage()
  y = M.top
  base()

  heading("Annexe 3 · Grille Tarifaire (mensuelle)", 2)
  y += 2

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  pdf.setCharSpace(0)

  const x1 = M.left
  const x2 = M.left + 45
  const x3 = M.left + 85
  const x4 = M.left + 120

  pdf.text("Surface du box", x1, y)
  pdf.text("Loyer HT (€)", x2, y)
  pdf.text("TVA 20 % (€)", x3, y)
  pdf.text("Loyer TTC (€)", x4, y)
  y += 3
  pdf.setDrawColor(20)
  pdf.line(M.left, y, pageW - M.right, y)
  y += 6
  base()

  const rows = [
    { s: "20 m²", ht: 416.67, tva: 83.33, ttc: 500.0 },
    { s: "30 m²", ht: 583.33, tva: 116.67, ttc: 700.0 },
    { s: "55 m²", ht: 916.67, tva: 183.33, ttc: 1100.0 },
  ]

  for (const r of rows) {
    ensure(8)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(11)
    pdf.setTextColor(20)
    pdf.setCharSpace(0)
    pdf.text(`· ${r.s}`, x1, y)
    pdf.text(money(r.ht), x2, y)
    pdf.text(money(r.tva), x3, y)
    pdf.text(money(r.ttc), x4, y)
    y += 6
    base()
  }

  y += 3
  text("Les tarifs indiqués s’entendent pour une période mensuelle et incluent la TVA au taux en vigueur de 20 %.", { gapAfter: 2 })
  text("La redevance due pour le box du client est celle figurant dans les Conditions particulières (Annexe 1).", { gapAfter: 2 })
  text("La grille tarifaire peut être mise à jour pour les nouveaux contrats ou lors des renouvellements, sans effet sur les contrats en cours hors indexation annuelle.", {
    gapAfter: 2,
  })
  text("Pour toute surface ou configuration particulière non listée, un tarif personnalisé sera établi sur demande.", { gapAfter: 2 })

  addFooter()

  if (save) {
    const fname =
      filename ||
      `contrat-${normalizePdfText(boxCode || "box")}-${normalizePdfText(contractId || "")}.pdf`
    pdf.save(fname)
  }

  return pdf
}
