// src/utils/invoicePdf.js
import jsPDF from "jspdf"

/* =========================
  Helpers anti espaces bizarres + formats FR
========================= */
function normalizePdfText(v) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function moneyFR(n) {
  const v = Number(n || 0)
  return normalizePdfText(
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(v)
  )
}

function safeISO(d) {
  if (!d) return ""
  if (typeof d === "string") return d.slice(0, 10)
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10)
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return ""
}

function isoToFR(iso) {
  const s = String(iso || "").slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  return `${m[3]}/${m[2]}/${m[1]}`
}

function safeLinesArray(v) {
  if (!v) return []
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean)
  return String(v)
    .split("\n")
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
}

function pad2(n) {
  return String(n).padStart(2, "0")
}

function dateFRFromAny(v) {
  if (!v) return ""
  if (typeof v === "string") return isoToFR(v.slice(0, 10))
  if (v?.toDate) {
    const d = v.toDate()
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
  }
  if (v instanceof Date) {
    return `${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}/${v.getFullYear()}`
  }
  return ""
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100
}

function getVatRate(input) {
  const raw = Number(input)
  if (!Number.isFinite(raw) || raw < 0) return 0.2
  return raw > 1 ? raw / 100 : raw
}

function splitTTCInternal(ttc, vatRate = 0.2) {
  const totalTTC = Number(ttc || 0)
  const rate = getVatRate(vatRate)
  const ht = round2(totalTTC / (1 + rate))
  const tva = round2(totalTTC - ht)
  return { ht, tva, ttc: round2(totalTTC) }
}

/* =========================================================
   RENDER — style "Facture 1381" + pagination propre
========================================================= */
function renderInvoiceLikeModel(data, options = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  const mx = 14
  const rightX = W - mx
  let y = 18

  const brown = [88, 58, 48]
  const grey = [210, 210, 210]

  const bottomLimit = H - 14

  const hr = (yy) => {
    pdf.setDrawColor(...grey)
    pdf.line(mx, yy, W - mx, yy)
  }

  const addNewPage = () => {
    pdf.addPage()
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(10)
    pdf.setTextColor(0)
    return 30
  }

  const ensureSpaceOrNewPage = (startY, need) => {
    if (startY + need > bottomLimit) return addNewPage()
    return startY
  }

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.setTextColor(0)

  const seller = data.seller || {}
  const client = data.client || {}
  const invoice = data.invoice || {}
  const documentTitle = normalizePdfText(invoice.title || "FACTURE").toUpperCase()
  const items = Array.isArray(data.items) ? data.items : []
  const payment = data.payment || {}
  const totals = data.totals || {}

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(14)
  pdf.text(normalizePdfText(seller.title || seller.name || "TRANSPORT FOMEK"), mx, y)

  y += 8
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  if (seller.contactName) {
    pdf.text(normalizePdfText(seller.contactName), mx, y)
    y += 6
  }

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  const sellerLine2 = [
    seller.tva ? `n° TVA ${normalizePdfText(seller.tva)}` : "",
    seller.siret ? `N°SIRET : ${normalizePdfText(seller.siret)}` : "",
  ]
    .filter(Boolean)
    .join(" ")

  if (sellerLine2) {
    pdf.text(normalizePdfText(sellerLine2), mx, y)
    y += 6
  }

  const sellerLines = [
    ...safeLinesArray(seller.addressLines),
    seller.phone ? normalizePdfText(seller.phone) : "",
    seller.website ? normalizePdfText(seller.website) : "",
    seller.email ? normalizePdfText(seller.email) : "",
  ].filter(Boolean)

  sellerLines.forEach((line) => {
    pdf.text(line, mx, y)
    y += 6
  })

  let my = 64

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  pdf.text(documentTitle, rightX, my, { align: "right" })

  my += 10
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(11)
  pdf.text(normalizePdfText(String(invoice.number || "—")), rightX, my, { align: "right" })

  my += 12
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("DATE", rightX, my, { align: "right" })

  my += 8
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.text(normalizePdfText(invoice.dateFR || "—"), rightX, my, { align: "right" })

  my += 14
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("MONTANT DÛ", rightX, my, { align: "right" })

  my += 8
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.text(normalizePdfText(invoice.amountDueLabel || "Dû à réception"), rightX, my, { align: "right" })

  my += 14
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("SOLDE DÛ", rightX, my, { align: "right" })

  my += 8
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.text(`EUR ${moneyFR(totals.due)} €`, rightX, my, { align: "right" })

  hr(92)

  let by = 108
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("ADRESSE DE FACTURATION", mx, by)

  by += 10
  pdf.setFontSize(13)
  pdf.text(normalizePdfText(client.companyName || client.name || "Client"), mx, by)

  by += 8
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  if (client.representativeName) {
    pdf.text(normalizePdfText(client.representativeName), mx, by)
    by += 7
  }

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)

  const clientLines = [
    ...safeLinesArray(client.addressLines || client.address),
    client.email ? normalizePdfText(client.email) : "",
    client.phone ? normalizePdfText(client.phone) : "",
  ].filter(Boolean)

  clientLines.forEach((line) => {
    by = ensureSpaceOrNewPage(by, 10)
    pdf.text(line, mx, by)
    by += 6
  })

  hr(152)

  let ty = 170
  ty = ensureSpaceOrNewPage(ty, 40)

  const tableW = W - mx * 2
  const headerH = 10

  pdf.setFillColor(...brown)
  pdf.rect(mx, ty, tableW, headerH, "F")

  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)

  const colArticleX = mx + 4
  const colPriceX = mx + 126
  const colQtyX = mx + 148
  const colAmountX = W - mx - 4

  const articleMaxW = 104

  pdf.text("ARTICLE", colArticleX, ty + 6.7)
  pdf.text("PRIX", colPriceX, ty + 6.7, { align: "right" })
  pdf.text("QTÉ", colQtyX, ty + 6.7, { align: "center" })
  pdf.text("MONTANT", colAmountX, ty + 6.7, { align: "right" })

  pdf.setTextColor(0, 0, 0)

  let ry = ty + headerH + 8
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)

  const rowLine = (yLine) => {
    pdf.setDrawColor(230)
    pdf.line(mx, yLine, W - mx, yLine)
  }

  items.forEach((it) => {
    const rawLines = safeLinesArray(it?.label || "Mise à disposition")
    const wrappedLines = rawLines.flatMap((line) =>
      pdf.splitTextToSize(normalizePdfText(line), articleMaxW)
    )

    const lineCount = Math.max(1, wrappedLines.length)
    const rowH = Math.max(10, lineCount * 5 + 2)

    ry = ensureSpaceOrNewPage(ry, rowH + 8)

    pdf.text(wrappedLines, colArticleX, ry)

    pdf.text(`${moneyFR(it?.unitPriceTTC ?? 0)} €`, colPriceX, ry, { align: "right" })
    pdf.text(String(it?.qty ?? 1), colQtyX, ry, { align: "center" })
    pdf.text(`${moneyFR(it?.amountTTC ?? 0)} €`, colAmountX, ry, { align: "right" })

    ry += rowH
    rowLine(ry)
    ry += 6
  })

  const paymentOtherLines = pdf.splitTextToSize(normalizePdfText(payment.other || ""), tableW * 0.6).length
  const paymentBlockH =
    12 + 14 + 12 + 6 * 2 + 10 + 8 + 12 + Math.max(10, paymentOtherLines * 5.5) + 6

  const totalsBlockH = 8 + 8 + 8 + 10 + 8
  const bottomBlocksNeed = Math.max(paymentBlockH, totalsBlockH) + 20

  let baseY = ry + 8
  baseY = ensureSpaceOrNewPage(baseY, bottomBlocksNeed)

  const blocksTopY = baseY

  let payY = blocksTopY

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(12)
  pdf.text("Information De Paiement", mx, payY)

  payY += 14
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  if (payment.primaryTitle) pdf.text(normalizePdfText(payment.primaryTitle), mx, payY)

  payY += 7
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  if (payment.primaryValue) pdf.text(normalizePdfText(payment.primaryValue), mx, payY)

  payY += 12
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("INSTRUCTIONS DE PAIEMENT", mx, payY)

  payY += 8
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  if (payment.iban) {
    pdf.text(`IBAN : ${normalizePdfText(payment.iban)}`, mx, payY)
    payY += 6
  }
  if (payment.bic) {
    pdf.text(`BIC: ${normalizePdfText(payment.bic)}`, mx, payY)
    payY += 6
  }
  if (payment.other) {
    const otherLines = pdf.splitTextToSize(normalizePdfText(payment.other), tableW * 0.6)
    pdf.text(otherLines, mx, payY)
  }

  const totalsXLabel = mx + tableW * 0.62
  const totalsXValue = W - mx

  let ty2 = blocksTopY

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  pdf.setFont("helvetica", "bold")
  const discount = Number(totals.discount || totals.discountTTC || 0)
  const subtotal = Number(totals.subtotal || totals.subtotalTTC || 0)
  if (discount > 0 && subtotal > 0) {
    pdf.text("SOUS-TOTAL", totalsXLabel, ty2)
    pdf.text(`${moneyFR(subtotal)} €`, totalsXValue, ty2, { align: "right" })
    ty2 += 8
    pdf.setFont("helvetica", "normal")
    pdf.text("REMISE", totalsXLabel, ty2)
    pdf.text(`-${moneyFR(discount)} €`, totalsXValue, ty2, { align: "right" })
    ty2 += 8
    pdf.setFont("helvetica", "bold")
  }
  pdf.text("TOTAL", totalsXLabel, ty2)
  pdf.text(`${moneyFR(totals.total || 0)} €`, totalsXValue, ty2, { align: "right" })

  ty2 += 8
  pdf.setFont("helvetica", "normal")
  if (Number(totals.paid || 0) > 0) {
    pdf.text("PAIEMENT", totalsXLabel, ty2)
    pdf.text(`-${moneyFR(Math.abs(totals.paid || 0))} €`, totalsXValue, ty2, { align: "right" })
    ty2 += 8
  }

  hr(ty2 - 2)
  ty2 += 6
  pdf.setFont("helvetica", "bold")
  pdf.text("SOLDE DÛ", totalsXLabel, ty2)
  pdf.text(`EUR ${moneyFR(totals.due)} €`, totalsXValue, ty2, { align: "right" })

  if (data.footer) {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.setTextColor(120)
    pdf.text(normalizePdfText(data.footer), mx, H - 10)
    pdf.setTextColor(0)
  }

  if (options?.download !== false) {
    pdf.save(data.fileName || "facture.pdf")
  }

  return pdf
}

/* =========================================================
   NORMALIZER: accepte 2 formats
========================================================= */
function toModelData(input) {
  const x = input || {}

  const isCustom =
    "invoiceNumber" in x ||
    "provider" in x ||
    "billTo" in x ||
    "paymentInfo" in x

  if (isCustom) {
    const provider = x.provider || {}
    const billTo = x.billTo || {}
    const items = Array.isArray(x.items) ? x.items : []
    const totals = x.totals || {}
    const pay = x.paymentInfo || {}

    const dateFR = isoToFR(safeISO(x.invoiceDateISO) || safeISO(new Date()))
    const vatRate = getVatRate(x.vatRate ?? x.tvaRate ?? totals.vatRate ?? 0.2)

    const normalizedItems = items.map((it) => {
      const qty = Number(it?.qty ?? 1)
      const unitPriceTTC = Number(it?.unitPriceTTC ?? it?.unitPrice ?? 0)
      const amountTTC = Number(it?.amountTTC ?? it?.totalTTC ?? it?.amount ?? unitPriceTTC * qty)

      const unitSplit = splitTTCInternal(unitPriceTTC, vatRate)
      const amountSplit = splitTTCInternal(amountTTC, vatRate)

      return {
        label: it?.label || "Mise a disposition",
        qty,
        unitPriceHT: unitSplit.ht,
        unitPriceTVA: unitSplit.tva,
        unitPriceTTC: unitSplit.ttc,
        amountHT: amountSplit.ht,
        amountTVA: amountSplit.tva,
        amountTTC: amountSplit.ttc,
      }
    })

    const computedTotalTTC = round2(
      normalizedItems.reduce((sum, it) => sum + Number(it.amountTTC || 0), 0)
    )

    const discountTTC = Math.max(0, Number(totals.discountTTC ?? totals.discount ?? 0))
    const subtotalTTC = Number(totals.subtotalTTC ?? totals.subtotal ?? computedTotalTTC)
    const totalTTC = Number(totals.totalTTC ?? totals.ttc ?? totals.total ?? Math.max(0, subtotalTTC - discountTTC))
    const totalSplit = splitTTCInternal(totalTTC, vatRate)

    const paid = Number(totals.paid ?? 0)
    const due = Number(totals.balanceDue ?? totals.due ?? round2(totalTTC - paid))

    return {
      fileName: x.fileName || `facture-${normalizePdfText(x.invoiceNumber || "—")}.pdf`,
      footer: provider.footer || "",

      seller: {
        title: provider.title || "TRANSPORT FOMEK",
        contactName: provider.contactName || "",
        tva: provider.tva || "",
        siret: provider.siret || "",
        addressLines:
          provider.addressLines || ["15 rue des Écoles, 95500 Le Thillay"],
        phone: provider.phone || "+33 6 95 93 19 92",
        website: provider.website || "https://transportfomek.vercel.app",
        email: provider.email || "",
      },

      client: {
        companyName: billTo.name || "Client",
        representativeName: billTo.representativeName || "",
        addressLines: billTo.address || "",
        email: billTo.email || "",
        phone: billTo.phone || "",
      },

      invoice: {
        number: x.invoiceNumber || "—",
        dateFR,
        amountDueLabel: x.amountDueLabel || "Dû à réception",
        title: x.documentTitle || x.type || "FACTURE",
      },

      items: normalizedItems,

      payment: {
        primaryTitle: pay?.primary?.title || "MODALITÉS DE PAIEMENT",
        primaryValue: pay?.primary?.value || "",
        iban: pay?.iban || "",
        bic: pay?.bic || "",
        chequeTo: pay?.chequeTo || "TRANSPORT FOMEK",
        other: pay?.other || "",
      },

      totals: {
        ht: totalSplit.ht,
        tva: totalSplit.tva,
        subtotal: subtotalTTC,
        discount: discountTTC,
        total: totalSplit.ttc,
        paid,
        paidDateFR: dateFRFromAny(x.paidAt) || "",
        due,
        vatRate,
      },
    }
  }

  const issueISO = safeISO(x?.issueDate) || safeISO(x?.createdAt) || safeISO(new Date())
  const issueFR = isoToFR(issueISO)

  const paidDateFR =
    dateFRFromAny(x?.paidAt) ||
    dateFRFromAny(x?.totals?.paidAt) ||
    dateFRFromAny(x?.payment?.paidAt) ||
    ""

  const seller = x?.seller || {}
  const client = x?.client || {}
  const vatRate = getVatRate(x?.vatRate ?? x?.tvaRate ?? x?.totals?.vatRate ?? 0.2)

  const items = (Array.isArray(x?.items) ? x.items : []).map((it) => {
    const qty = Number(it?.qty ?? 1)

    const unitPriceTTC = Number(
      it?.unitPriceTTC ??
      it?.unitPrice ??
      (it?.unitPriceHT != null ? Number(it.unitPriceHT) * (1 + vatRate) : 0)
    )

    const amountTTC = Number(
      it?.totalTTC ??
      it?.amountTTC ??
      it?.total ??
      (it?.totalHT != null ? Number(it.totalHT) * (1 + vatRate) : unitPriceTTC * qty)
    )

    const unitSplit = splitTTCInternal(unitPriceTTC, vatRate)
    const amountSplit = splitTTCInternal(amountTTC, vatRate)

    return {
      label: it?.label || "Mise a disposition",
      qty,
      unitPriceHT: unitSplit.ht,
      unitPriceTVA: unitSplit.tva,
      unitPriceTTC: unitSplit.ttc,
      amountHT: amountSplit.ht,
      amountTVA: amountSplit.tva,
      amountTTC: amountSplit.ttc,
    }
  })

  const computedTotalTTC = round2(items.reduce((sum, it) => sum + Number(it.amountTTC || 0), 0))
  const discountTTC = Math.max(0, Number(x?.totals?.discountTTC ?? x?.totals?.discount ?? 0))
  const subtotalTTC = Number(x?.totals?.subtotalTTC ?? x?.totals?.subtotal ?? computedTotalTTC)
  const totalTTC = Number(x?.totals?.ttc ?? x?.totals?.totalTTC ?? Math.max(0, subtotalTTC - discountTTC))
  const totalSplit = splitTTCInternal(totalTTC, vatRate)

  const due = Number(x?.totals?.due ?? round2(totalTTC - Number(x?.totals?.paid ?? 0)))
  const paid = Number(x?.totals?.paid ?? 0)

  return {
    fileName: `facture-${x?.number || x?.invoiceNumber || "—"}-${x?.period || issueISO.slice(0, 7)}.pdf`,
    footer: "",

    seller: {
      title: seller?.title || seller?.name || "TRANSPORT FOMEK",
      contactName: seller?.contactName || "",
      tva: seller?.tva || seller?.vat || "",
      siret: seller?.siret || "",
      addressLines:
        seller?.addressLines || ["15 rue des Écoles, 95500 Le Thillay"],
      phone: seller?.phone || "+33 6 95 93 19 92",
      website: seller?.website || "https://transportfomek.vercel.app",
      email: seller?.email || "",
    },

    client: {
      companyName: client?.companyName || client?.name || "Client",
      representativeName: client?.representativeName || "",
      addressLines: client?.addressLines || client?.address || "",
      email: client?.email || "",
      phone: client?.phone || "",
    },

    invoice: {
      number: x?.number || x?.invoiceNumber || "—",
      dateFR: issueFR || "—",
      amountDueLabel: x?.amountDueLabel || "Dû à réception",
      title: x?.documentTitle || x?.type || "FACTURE",
    },

    items,

    payment: {
      primaryTitle: "MODALITÉS DE PAIEMENT",
      primaryValue: "",
      iban: "",
      bic: "",
      chequeTo: "TRANSPORT FOMEK",
      other: "",
    },

    totals: {
      ht: totalSplit.ht,
      tva: totalSplit.tva,
      subtotal: subtotalTTC,
      discount: discountTTC,
      total: totalSplit.ttc,
      paid,
      paidDateFR,
      due,
      vatRate,
    },
  }
}

/* =========================================================
   PUBLIC API
========================================================= */
export function generateInvoicePdf(input, options = { download: true }) {
  const data = toModelData(input)
  return renderInvoiceLikeModel(data, options)
}
