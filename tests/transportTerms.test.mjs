import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { TRANSPORT_TERMS, TRANSPORT_TERMS_VERSION, transportTermsAcceptance, appendTransportTerms } from '../src/utils/transportTerms.js'

test('acceptance is explicit and saves the version, clauses and timestamp', () => {
  for (const value of [false, null, undefined, 'true']) assert.throws(() => transportTermsAcceptance(value, 'date'))
  const acceptedAt = new Date('2026-09-21T10:00:00Z')
  const result = transportTermsAcceptance(true, acceptedAt)
  assert.equal(result.version, TRANSPORT_TERMS_VERSION)
  assert.equal(result.acceptedAt, acceptedAt)
  assert.deepEqual(result.clauses, TRANSPORT_TERMS)
  assert.notEqual(result.clauses, TRANSPORT_TERMS)
  assert.equal(result.clauses.length, 6)
})

test('terms append a readable page to the receipt', () => {
  const pdf = new jsPDF()
  appendTransportTerms(pdf, { reference: 'TEST' })
  assert.equal(pdf.getNumberOfPages(), 2)
  const text = pdf.output()
  assert.ok(text.includes('Douala'))
  assert.ok(text.includes('Total Biteng'))
  assert.ok(!text.includes('Acceptation enregistr'))
})

test('accepted snapshot is retained and long text paginates', () => {
  const pdf = new jsPDF()
  appendTransportTerms(pdf, { acceptance: { accepted: true, version: 'ancienne-version', clauses: ['Clause historique '.repeat(1800)], acceptedAt: { seconds: 1790000000 } } })
  assert.ok(pdf.getNumberOfPages() > 2)
  assert.ok(pdf.output().includes('ancienne-version'))
  assert.ok(pdf.output().includes('Acceptation enregistr'))
})
