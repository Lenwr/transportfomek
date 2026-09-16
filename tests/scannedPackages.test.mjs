import test from 'node:test';
import assert from 'node:assert/strict';
import { groupScannedPackages } from '../src/utils/scannedPackages.js';
import { transportFomekTrackingUrl } from '../src/utils/publicTracking.js';
test('groups by recipient across senders and orders names and parcel numbers', () => {
 const input = [
  { destinataire: 'Zoé', coli: 'Valise', expediteur: 'A' },
  { destinataire: ' Émile ', coli: 'Carton 10', expediteur: 'B' },
  { destinataire: 'emile', coli: 'Carton 2', expediteur: 'C' },
  { destinataire: 'Alice', coli: 'Sac', expediteur: 'D' }
 ];
 const groups = groupScannedPackages(input);
 assert.deepEqual(groups.map(g => g.destinataire), ['Alice','Émile','Zoé']);
 assert.deepEqual(groups[1].items.map(i => i.coli), ['Carton 2','Carton 10']);
 assert.equal(groups[1].expediteur, 'B, C');
 assert.equal(groups[1].items[0], input[2]);
 assert.equal(input[0].destinataire, 'Zoé');
});
test('missing recipients remain visible and empty input is supported', () => {
 assert.equal(groupScannedPackages([{coli:'Sac'}])[0].destinataire, 'Sans destinataire');
 assert.deepEqual(groupScannedPackages([]), []);
});
test('tracking links always include the Fomek route and encode the code', () => {
 assert.equal(transportFomekTrackingUrl('COLIS-260904-155323-508'), 'https://tracksend.vercel.app/suivi/transport-fomek?code=COLIS-260904-155323-508');
 assert.equal(transportFomekTrackingUrl(' A&B '), 'https://tracksend.vercel.app/suivi/transport-fomek?code=A%26B');
 assert.equal(transportFomekTrackingUrl(''), '');
});
