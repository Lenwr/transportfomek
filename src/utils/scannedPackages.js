const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const name = value => String(value || '').trim().replace(/\s+/g, ' ');
export function recipientKey(value) {
  return name(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
export function groupScannedPackages(items) {
  const groups = new Map();
  for (const item of items) {
    const key = recipientKey(item.destinataire);
    if (!groups.has(key)) groups.set(key, { key, destinataire: name(item.destinataire) || 'Sans destinataire', items: [], totalColis: 0 });
    const group = groups.get(key);
    group.items.push(item);
    group.totalColis += Number(item.nombreDeColis || 0);
  }
  return [...groups.values()].sort((a, b) => collator.compare(a.destinataire, b.destinataire)).map(group => {
    const unique = field => [...new Set(group.items.map(field).map(name).filter(Boolean))].sort(collator.compare).join(', ');
    return { ...group,
      expediteur: unique(item => item.expediteur),
      telephoneDestinataire: unique(item => item.telephoneDestinataireDirect || item.telephoneDestinataire),
      telephoneDestinataireWhatsapp: unique(item => item.telephoneDestinataireWhatsapp),
      items: [...group.items].sort((a, b) => collator.compare(a.coli || '', b.coli || '') || collator.compare(a.expediteur || '', b.expediteur || ''))
    };
  });
}
