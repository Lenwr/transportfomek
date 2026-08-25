// src/utils/billingSync.js
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    limit,
    serverTimestamp,
  } from "firebase/firestore"
  
  /* =========================================================
     Helpers
  ========================================================= */
  export function norm(v) {
    return String(v || "").trim()
  }
  
  export function round2(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100
  }
  
  /**
   * TVA déjà incluse dans le TTC
   * On décompose juste le montant TTC
   */
  export function splitTTC(ttc, vatRatePercent = 0) {
    const totalTTC = Number(ttc || 0)
    const rate = Number(vatRatePercent || 0) / 100
  
    if (!rate) {
      return {
        ht: round2(totalTTC),
        tva: 0,
        ttc: round2(totalTTC),
      }
    }
  
    const ht = round2(totalTTC / (1 + rate))
    const tva = round2(totalTTC - ht)
  
    return {
      ht,
      tva,
      ttc: round2(totalTTC),
    }
  }
  
  export function getInvoiceStatus(totalTTC, paid) {
    const ttc = Number(totalTTC || 0)
    const p = Number(paid || 0)
  
    if (p <= 0) return "unpaid"
    if (p >= ttc) return "paid"
    return "partial"
  }
  
  export function safeISO(d) {
    if (!d) return ""
    if (typeof d === "string") return d.slice(0, 10)
    if (d?.toDate) return d.toDate().toISOString().slice(0, 10)
    if (d instanceof Date) return d.toISOString().slice(0, 10)
    return ""
  }
  
  export function todayISO() {
    return new Date().toISOString().slice(0, 10)
  }
  
  export function slugInvoicePart(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase()
  }
  
  export function getBoxInvoicePrefix(source) {
    const s = source || {}
    return (
      slugInvoicePart(s.boxName) ||
      slugInvoicePart(s.boxCode) ||
      slugInvoicePart(s.boxId) ||
      "BOX"
    )
  }
  
  export function buildInvoiceNumber({ boxName, boxCode, boxId, contractId, period }) {
    const prefix =
      slugInvoicePart(boxName) ||
      slugInvoicePart(boxCode) ||
      slugInvoicePart(boxId) ||
      "BOX"
  
    const safePeriod = String(period || "").replace(/[^0-9-]/g, "") || "PERIODE"
    const contractShort = slugInvoicePart(contractId || "").slice(0, 6) || "CTR"
  
    return `${prefix}-${safePeriod}-${contractShort}`
  }
  
  export function periodToDueDate(period, billingDay = 1) {
    const [y, m] = String(period || "").split("-")
    const day = Math.min(28, Math.max(1, Number(billingDay || 1)))
    if (!y || !m) return ""
    return `${y}-${m}-${String(day).padStart(2, "0")}`
  }
  
  export function addOneMonthPeriod(ym) {
    const [y, m] = String(ym || "").split("-").map(Number)
    if (!y || !m) return ""
    const d = new Date(y, m - 1, 1)
    d.setMonth(d.getMonth() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  
  export function buildClientPayload(contract) {
    const c = contract || {}
    return {
      companyName: norm(c.companyName || ""),
      representativeName: norm(c.representativeName || ""),
      address: norm(c.address || ""),
      email: norm(c.email || ""),
      phone: norm(c.phone || ""),
      clientNumber: norm(c.clientNumber || ""),
    }
  }
  
  export function buildInvoicePayload({
    contract,
    contractId,
    period,
    invoiceTotalTTC,
    paidAmountTTC,
    issueDate,
    keepPdfUrl = "",
  }) {
    const c = contract || {}
    const vatRate = Number(c.tvaRate || 0)
  
    // TVA déjà incluse dans le TTC
    const invoiceSplit = splitTTC(invoiceTotalTTC, vatRate)
    const paid = round2(paidAmountTTC)
    const due = round2(Math.max(0, invoiceSplit.ttc - paid))
    const status = getInvoiceStatus(invoiceSplit.ttc, paid)
  
    const client = buildClientPayload(c)
    const displayName =
      client.companyName ||
      client.representativeName ||
      norm(c.clientName || "") ||
      "Client"
  
    return {
      contractId,
      boxId: norm(c.boxId || "") || null,
      boxCode: norm(c.boxCode || "") || null,
      boxName: norm(c.boxName || "") || null,
      number: buildInvoiceNumber({
        boxName: c.boxName,
        boxCode: c.boxCode,
        boxId: c.boxId,
        contractId,
        period,
      }),
      period,
      issueDate: issueDate || todayISO(),
      dueDate: periodToDueDate(period, Number(c.billingDay || 1)),
      client: {
        companyName: client.companyName || "",
        representativeName: client.representativeName || "",
        address: client.address || "",
        email: client.email || "",
        phone: client.phone || "",
        clientNumber: client.clientNumber || "",
        displayName,
      },
      items: [
        {
          label: `Mise a disposition Box ${c.boxName || c.boxCode || c.boxId || "BOX"}\n${period}`,
          qty: 1,
          unitPriceTTC: invoiceSplit.ttc,
          amountTTC: invoiceSplit.ttc,
        },
      ],
      totals: {
        ht: invoiceSplit.ht,
        tva: invoiceSplit.tva,
        ttc: invoiceSplit.ttc,
        paid,
        due,
        vatRate,
      },
      status,
      pdfUrl: keepPdfUrl || "",
      updatedAt: serverTimestamp(),
    }
  }
  
  /* =========================================================
     Firestore queries
  ========================================================= */
  export async function findInvoiceByContractAndPeriod(db, contractId, period) {
    const q = query(
      collection(db, "invoices"),
      where("contractId", "==", contractId),
      where("period", "==", period),
      limit(1)
    )
  
    const snap = await getDocs(q)
    if (snap.empty) return null
  
    const d = snap.docs[0]
    return { id: d.id, ...d.data() }
  }
  
  export async function findPaymentsByContractAndPeriod(db, contractId, period) {
    const q = query(
      collection(db, "payments"),
      where("contractId", "==", contractId),
      where("period", "==", period)
    )
  
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  
  export async function findPaymentsByInvoiceId(db, invoiceId) {
    const q = query(collection(db, "payments"), where("invoiceId", "==", invoiceId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  
  /* =========================================================
     Sync facture depuis paiements
  ========================================================= */
  export async function syncInvoiceByContractAndPeriod(db, { contract, contractId, period, issueDate = "" }) {
    if (!db || !contractId || !period) return null
  
    const c = contract || {}
    const existingInvoice = await findInvoiceByContractAndPeriod(db, contractId, period)
    const payments = await findPaymentsByContractAndPeriod(db, contractId, period)
    const paymentIssueDate =
      payments.map((p) => safeISO(p.invoiceIssueDate || p.paidAt)).filter(Boolean).sort()[0] || ""
  
    const paidAmountTTC = round2(
      payments.reduce((acc, p) => acc + Number(p.amountTTC ?? p.amount ?? 0), 0)
    )
  
    // total de la facture = mensuel TTC du contrat
    // TVA déjà incluse, on décompose uniquement
    const invoiceTotalTTC = Number(c.monthlyTTC || 0)
  
    const payload = buildInvoicePayload({
      contract: c,
      contractId,
      period,
      invoiceTotalTTC,
      paidAmountTTC,
      issueDate: safeISO(issueDate) || safeISO(existingInvoice?.issueDate) || paymentIssueDate || todayISO(),
      keepPdfUrl: existingInvoice?.pdfUrl || "",
    })
  
    if (!existingInvoice) {
      const ref = await addDoc(collection(db, "invoices"), {
        ...payload,
        createdAt: serverTimestamp(),
      })
  
      // rattache les paiements existants à la facture créée
      await Promise.all(
        payments.map((p) =>
          updateDoc(doc(db, "payments", p.id), {
            invoiceId: ref.id,
            invoiceNumber: payload.number,
            updatedAt: serverTimestamp(),
          })
        )
      )
  
      return { id: ref.id, ...payload }
    }
  
    await updateDoc(doc(db, "invoices", existingInvoice.id), payload)
  
    await Promise.all(
      payments.map((p) =>
        updateDoc(doc(db, "payments", p.id), {
          invoiceId: existingInvoice.id,
          invoiceNumber: payload.number,
          updatedAt: serverTimestamp(),
        })
      )
    )
  
    return { id: existingInvoice.id, ...existingInvoice, ...payload }
  }
  
  /* =========================================================
     Create payment + sync invoice
  ========================================================= */
  export async function createPaymentAndSyncInvoice(db, {
    contract,
    contractId,
    period,
    issueDate = "",
    amountTTC,
    method = "cash",
    note = "",
  }) {
    const c = contract || {}
    const vatRate = Number(c.tvaRate || 0)
  
    // TVA déjà incluse dans le montant
    const split = splitTTC(amountTTC, vatRate)
  
    const paymentRef = await addDoc(collection(db, "payments"), {
      contractId,
      boxId: norm(c.boxId || "") || null,
      boxCode: norm(c.boxCode || "") || null,
      boxName: norm(c.boxName || "") || null,
      period,
      paidAt: safeISO(issueDate) || todayISO(),
      invoiceIssueDate: safeISO(issueDate) || todayISO(),
      amount: split.ttc,
      amountHT: split.ht,
      amountTVA: split.tva,
      amountTTC: split.ttc,
      tvaRate: vatRate,
      method,
      note: norm(note),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  
    const invoice = await syncInvoiceByContractAndPeriod(db, {
      contract: c,
      contractId,
      period,
      issueDate,
    })
  
    await updateDoc(doc(db, "payments", paymentRef.id), {
      invoiceId: invoice?.id || null,
      invoiceNumber: invoice?.number || null,
      updatedAt: serverTimestamp(),
    })
  
    return {
      paymentId: paymentRef.id,
      invoice,
    }
  }
  
  /* =========================================================
     Update payment + resync old/new invoice
  ========================================================= */
  export async function updatePaymentAndSyncInvoice(db, {
    paymentId,
    previousPayment,
    contract,
    contractId,
    nextPeriod,
    nextIssueDate = "",
    nextAmountTTC,
    nextMethod,
    nextNote,
  }) {
    if (!paymentId) throw new Error("paymentId manquant")
  
    const c = contract || {}
    const vatRate = Number(c.tvaRate || 0)
    const split = splitTTC(nextAmountTTC, vatRate)
  
    const prevPeriod = String(previousPayment?.period || "").trim()
  
    await updateDoc(doc(db, "payments", paymentId), {
      contractId,
      boxId: norm(c.boxId || "") || null,
      boxCode: norm(c.boxCode || "") || null,
      boxName: norm(c.boxName || "") || null,
      period: nextPeriod,
      paidAt: safeISO(nextIssueDate) || todayISO(),
      invoiceIssueDate: safeISO(nextIssueDate) || todayISO(),
      amount: split.ttc,
      amountHT: split.ht,
      amountTVA: split.tva,
      amountTTC: split.ttc,
      tvaRate: vatRate,
      method: nextMethod,
      note: norm(nextNote),
      updatedAt: serverTimestamp(),
    })
  
    // Resync ancienne facture si la période change
    if (prevPeriod && prevPeriod !== nextPeriod) {
      await syncInvoiceByContractAndPeriod(db, {
        contract: c,
        contractId,
        period: prevPeriod,
      })
    }
  
    const invoice = await syncInvoiceByContractAndPeriod(db, {
      contract: c,
      contractId,
      period: nextPeriod,
      issueDate: nextIssueDate,
    })
  
    await updateDoc(doc(db, "payments", paymentId), {
      invoiceId: invoice?.id || null,
      invoiceNumber: invoice?.number || null,
      updatedAt: serverTimestamp(),
    })
  
    return invoice
  }
  
  /* =========================================================
     Delete payment + resync invoice
  ========================================================= */
  export async function deletePaymentAndSyncInvoice(db, {
    paymentId,
    payment,
    contract,
    contractId,
  }) {
    if (!paymentId) throw new Error("paymentId manquant")
  
    const period = String(payment?.period || "").trim()
    await deleteDoc(doc(db, "payments", paymentId))
  
    if (period) {
      await syncInvoiceByContractAndPeriod(db, {
        contract,
        contractId,
        period,
      })
    }
  
    return true
  }
  
  /* =========================================================
     Update invoice manually
  ========================================================= */
  export async function updateInvoiceManually(db, {
    invoiceId,
    currentInvoice,
    patch,
  }) {
    if (!invoiceId) throw new Error("invoiceId manquant")
  
    const current = currentInvoice || {}
    const nextTotals = {
      ...(current.totals || {}),
      ...(patch?.totals || {}),
    }
  
    const ttc = Number(nextTotals.ttc ?? nextTotals.totalTTC ?? 0)
    const paid = Number(nextTotals.paid ?? 0)
    nextTotals.due = round2(Math.max(0, ttc - paid))
    nextTotals.ht = Number(nextTotals.ht ?? splitTTC(ttc, nextTotals.vatRate || 0).ht)
    nextTotals.tva = Number(nextTotals.tva ?? splitTTC(ttc, nextTotals.vatRate || 0).tva)
  
    const payload = {
      ...patch,
      totals: nextTotals,
      status: getInvoiceStatus(ttc, paid),
      updatedAt: serverTimestamp(),
    }
  
    await updateDoc(doc(db, "invoices", invoiceId), payload)
    return true
  }
  
  /* =========================================================
     Delete invoice safely
  ========================================================= */
  export async function deleteInvoiceSafely(db, { invoiceId }) {
    if (!invoiceId) throw new Error("invoiceId manquant")
  
    const linkedPayments = await findPaymentsByInvoiceId(db, invoiceId)
    if (linkedPayments.length > 0) {
      throw new Error("Impossible de supprimer cette facture : des paiements y sont liés.")
    }
  
    await deleteDoc(doc(db, "invoices", invoiceId))
    return true
  }
