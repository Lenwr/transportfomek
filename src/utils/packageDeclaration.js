export function packageDeclaration(group = {}, detail = {}) {
  const raw = detail.valeurEstimee ?? group.valeurEstimee;
  const value = raw == null || String(raw).trim() === '' ? null : Number(String(raw).replace(',', '.'));
  return {
    contenuDetaille: String(detail.contenuDetaille ?? group.contenuDetaille ?? '').trim(),
    valeurEstimee: Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null,
  };
}
export function formatDeclaredValue(value) {
  return value == null || value === '' ? 'Non renseignée' : `${Number(value).toFixed(2)} €`;
}
export function buildPackingRows(items) {
  const groups = new Map();
  for (const item of items) {
    const declaration = packageDeclaration(item);
    const label = String(item.coli || 'Divers').replace(/\s+\d+\s*\/\s*\d+$/, '').trim();
    const key = JSON.stringify([label, declaration.contenuDetaille, declaration.valeurEstimee]);
    if (!groups.has(key)) groups.set(key, { key, label, ...declaration, qty: 0 });
    groups.get(key).qty++;
  }
  return [...groups.values()].map(row => ({ ...row,
    valeurTotale: row.valeurEstimee == null ? null : Math.round(row.valeurEstimee * 100) * row.qty / 100,
  })).sort((a,b) => a.label.localeCompare(b.label, 'fr'));
}

export function validDeclaredValue(raw) {
  if (raw == null || String(raw).trim() === '') return true;
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value >= 0;
}
