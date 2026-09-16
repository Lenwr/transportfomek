import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROJECT_ID = 'fomektrack';
const DATABASE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;
const excelPath = process.argv.find((arg) => arg.endsWith('.xlsx'));
const shouldCommit = process.argv.includes('--commit');

if (!excelPath) throw new Error('Chemin du fichier .xlsx manquant.');

const decodeXml = (value = '') => value
  .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"').replaceAll('&apos;', "'");
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const phone = (value) => {
  let digits = clean(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9 && /^[67]/.test(digits)) return `+33${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+33${digits.slice(1)}`;
  if (digits.startsWith('33')) return `+${digits}`;
  return `+${digits}`;
};
const normalize = (value) => clean(value).toLocaleLowerCase('fr-FR');
const xmlText = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
  .map((match) => decodeXml(match[1])).join('');
const columnIndex = (ref) => [...ref.match(/[A-Z]+/)[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function parseSheet(sheetXml, sharedStrings) {
  return [...sheetXml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [];
    for (const match of rowMatch[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = match[1];
      const body = match[2];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      cells[columnIndex(ref)] = type === 's' ? (sharedStrings[Number(raw)] ?? '') : type === 'inlineStr' ? xmlText(body) : decodeXml(raw);
    }
    return cells;
  });
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, firestoreValue(v)])) } };
  return { stringValue: String(value) };
}
const firestoreFields = (object) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, firestoreValue(value)]));
const fromFirestore = (value) => {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestore);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, fromFirestore(v)]));
  return null;
};
const documentData = (doc) => Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) => [key, fromFirestore(value)]));

async function accessToken() {
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const token = config.tokens?.access_token;
  if (!token) throw new Error('Session Firebase CLI absente. Exécutez firebase login.');
  return token;
}

async function api(token, suffix, options = {}) {
  const response = await fetch(`${DATABASE_ROOT}${suffix}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Firestore ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function queryCollection(token, collectionId) {
  const rows = await api(token, '/documents:runQuery', {
    method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }),
  });
  return rows.flatMap((row) => row.document ? [row.document] : []);
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fomek-clients-'));
try {
  execFileSync('unzip', ['-qq', excelPath, '-d', tempDir]);
  const sharedXml = await fs.readFile(path.join(tempDir, 'xl/sharedStrings.xml'), 'utf8').catch(() => '');
  const sharedStrings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]));
  const sheetXml = await fs.readFile(path.join(tempDir, 'xl/worksheets/sheet1.xml'), 'utf8');
  const rows = parseSheet(sheetXml, sharedStrings);
  const headers = rows.shift().map((header) => normalize(header));
  const at = (row, name) => clean(row[headers.indexOf(name)]);
  const now = new Date().toISOString();
  const clients = rows.filter((row) => row.some(Boolean)).map((row) => ({
    numeroClient: at(row, 'num client'),
    nom: at(row, 'nom'),
    prenom: at(row, 'prenom'),
    telephone: phone(at(row, 'telephone')),
    adresse: at(row, 'adresse'),
    ville: at(row, 'ville'),
    codePostal: at(row, 'code postal'),
    destination: at(row, 'destination'),
    tarifSpecial: at(row, 'tarif spe'),
    historiqueActivite: { '2024': at(row, '2024'), '2025': at(row, '2025'), '2026': at(row, '2026') },
    envois: [], source: 'import_excel', importedAt: now,
  }));

  const token = await accessToken();
  const existingDocs = await queryCollection(token, 'customers');
  const existing = existingDocs.map((doc) => ({ id: doc.name.split('/').pop(), ...documentData(doc) }));
  const numericNumbers = [...clients, ...existing].map((client) => Number(String(client.numeroClient ?? '').replace(/\D/g, ''))).filter(Number.isFinite);
  let counter = numericNumbers.length ? Math.max(...numericNumbers) : 0;
  const repairs = [];
  for (const client of clients.filter((item) => !item.numeroClient)) {
    const match = existing.find((item) => item.source === 'import_excel' && normalize(item.nom) === normalize(client.nom) && normalize(item.prenom) === normalize(client.prenom));
    if (match?.numeroClient) client.numeroClient = match.numeroClient;
    else {
      client.numeroClient = `CL${++counter}`;
      if (match) { match.numeroClient = client.numeroClient; repairs.push(match); }
    }
  }
  const existingNumbers = new Set(existing.map((client) => normalize(client.numeroClient)).filter(Boolean));
  const existingPhones = new Set(existing.map((client) => phone(client.telephone)).filter(Boolean));
  const duplicates = [];
  const toImport = clients.filter((client) => {
    if (existingNumbers.has(normalize(client.numeroClient))) { duplicates.push({ numeroClient: client.numeroClient, raison: 'numero_client_existant' }); return false; }
    if (client.telephone && existingPhones.has(client.telephone)) { duplicates.push({ numeroClient: client.numeroClient, raison: 'telephone_existant' }); return false; }
    return true;
  });

  const backupsDir = path.resolve('backups');
  await fs.mkdir(backupsDir, { recursive: true });
  const stamp = now.replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `customers-before-import-${stamp}.json`);
  const reportPath = path.join(backupsDir, `customers-import-report-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({ project: PROJECT_ID, exportedAt: now, count: existing.length, customers: existing }, null, 2));

  const counterResponse = await fetch(`${DATABASE_ROOT}/documents/referenceCounters/clients`, { headers: { Authorization: `Bearer ${token}` } });
  if (counterResponse.ok) counter = Math.max(counter, Number(fromFirestore((await counterResponse.json()).fields?.value)) || 0);

  const report = { mode: shouldCommit ? 'commit' : 'simulation', excel: clients.length, existing: existing.length, importable: toImport.length, skipped: duplicates.length, counter, backupPath, duplicates, pending: toImport.map(({ numeroClient, nom, prenom, telephone }) => ({ numeroClient, nom, prenom, telephone })) };
  if (shouldCommit) {
    const writes = repairs.map((client) => ({
      update: { name: `${DATABASE_ROOT.replace('https://firestore.googleapis.com/v1/', '')}/documents/customers/${client.id}`, fields: firestoreFields(Object.fromEntries(Object.entries(client).filter(([key]) => key !== 'id'))) },
    }));
    writes.push(...toImport.map((client, index) => ({
      update: {
        name: `${DATABASE_ROOT.replace('https://firestore.googleapis.com/v1/', '')}/documents/customers/excel_${String(index + 2).padStart(4, '0')}_${client.numeroClient.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        fields: firestoreFields(client),
      }, currentDocument: { exists: false },
    })));
    writes.push({ update: { name: `${DATABASE_ROOT.replace('https://firestore.googleapis.com/v1/', '')}/documents/referenceCounters/clients`, fields: firestoreFields({ value: counter, prefix: 'CL', updatedAt: now }) } });
    for (let i = 0; i < writes.length; i += 400) {
      await api(token, '/documents:commit', { method: 'POST', body: JSON.stringify({ writes: writes.slice(i, i + 400) }) });
    }
    report.imported = toImport.length;
  }
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, backupPath: path.resolve(backupPath), reportPath: path.resolve(reportPath), duplicates: undefined }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
