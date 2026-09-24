import test from 'node:test';
import assert from 'node:assert/strict';
import { packageDeclaration, buildPackingRows, validDeclaredValue } from '../src/utils/packageDeclaration.js';
import { drawWrappedTableRow } from '../src/utils/pdfTableRow.js';
test('old packages stay empty and zero differs from unknown', () => {
 assert.deepEqual(packageDeclaration(), {contenuDetaille:'', valeurEstimee:null});
 assert.equal(packageDeclaration({valeurEstimee:0}).valeurEstimee,0);
 assert.equal(packageDeclaration({valeurEstimee:'12,50'}).valeurEstimee,12.5);
 assert.equal(validDeclaredValue(-1),false);
 assert.equal(validDeclaredValue('oops'),false);
 assert.equal(validDeclaredValue(''),true);
});
test('detail overrides group declaration and packing totals count only scanned units', () => {
 assert.deepEqual(packageDeclaration({contenuDetaille:'Vêtements',valeurEstimee:100},{contenuDetaille:'Livres',valeurEstimee:20}),{contenuDetaille:'Livres',valeurEstimee:20});
 const rows=buildPackingRows([
 {coli:'Carton 1/3',contenuDetaille:'Livres',valeurEstimee:20},
 {coli:'Carton 2/3',contenuDetaille:'Livres',valeurEstimee:20},
 {coli:'Carton 1/1',contenuDetaille:'Vaisselle',valeurEstimee:30},
 {coli:'Carton 1/1'}]);
 assert.equal(rows.length,3);
 assert.equal(rows.find(r=>r.contenuDetaille==='Livres').valeurTotale,40);
 assert.equal(rows.find(r=>!r.contenuDetaille).valeurTotale,null);
});
test('long PDF descriptions continue on new pages without dropping lines', () => {
 let pages=0;const written=[];
 const pdf={splitTextToSize:s=>s.split('\n'),rect:()=>{},text:lines=>written.push(...lines)};
 const description=Array.from({length:120},(_,i)=>'ligne '+i);
 const end=drawWrappedTableRow(pdf,['1',description.join('\n'),'50'],[20,100,30],20,240,269,()=>{pages++;return 50});
 assert.ok(pages>=3);assert.ok(end<=269);
 assert.deepEqual(written.filter(s=>s.startsWith('ligne ')),description);
 assert.equal(written.filter(s=>s==='50').length,1);
});
