// Test delle parti pure dell'app: estrae i blocchi marcati da index.html e li esegue in un contesto isolato.
// Uso: node tests/run.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
function block(name){
  const a = html.indexOf('/*' + name + '-START*/'), b = html.indexOf('/*' + name + '-END*/');
  if(a < 0 || b < a) throw new Error('Blocco ' + name + ' non trovato in index.html');
  return html.slice(a, b);
}
const exportsList = ['parseRower', 'demoPacket', 'fmtTime', 'median', 'hrFilter', 'zoneTimes', 'maxHrSustained', 'decoupling', 'thinRec', 'pruneHistory',
  'buildTcx', 'recKind', 'testWatts', 'isTestRec', 'sessionComment', 'bestAvg', 'estimateRef', 'estimateHrK', 'recommend', 'planForCycle', 'PLAN8_BASE',
  'planPhases', 'buildPlan', 'planTitle', 'hrAt', 'zoneIdx', 'ytEmbed', 'KEEP_SAMPLES'];
const ctx = vm.createContext({ console, URL, location: { origin: 'https://example.github.io', hash: '' } });
vm.runInContext('var cfg = { hrMax: 182, hrRest: 60, weight: 80 };\n' + block('PARSER') + block('ANALYSIS') + block('COACH') + block('YT') +
  '\nglobalThis.T = {' + exportsList.join(',') + '};', ctx);
const T = ctx.T;

let pass = 0, fail = 0;
function test(name, fn){ try{ fn(); pass++; console.log('  ok  ' + name); }catch(e){ fail++; console.log('  NO  ' + name + '\n      ' + (e && e.message)); } }
const DAY = 864e5, NOW = Date.UTC(2026, 10, 8, 18, 0, 0);
// Campioni sintetici: [t, W, spm, passo, metri, kcal, fc]
function samples(sec, fnP, fnHr, spm){ const out = []; let dist = 0; for(let t = 0; t <= sec; t++){ const p = fnP(t); dist += 500 / (500 * Math.cbrt(2.8 / Math.max(p, 1))); out.push([t, p, spm || 22, 120, Math.round(dist), t / 60, fnHr ? fnHr(t) : 0]); } return out; }

console.log('Parser FTMS');
test('pacchetto demo letto per intero', () => {
  const dv = T.demoPacket({ spm: 24, strokes: 100, dist: 1234, pace: 125, power: 180, kcal: 50, kcalH: 900, hr: 140, t: 300 });
  const o = T.parseRower(dv);
  assert.equal(o.spm, 24); assert.equal(o.strokes, 100); assert.equal(o.dist, 1234); assert.equal(o.pace, 125);
  assert.equal(o.power, 180); assert.equal(o.kcal, 50); assert.equal(o.hr, 140); assert.equal(o.elapsed, 300); assert.equal(o.truncated, false);
});
test('pacchetto troncato: campi presenti restituiti, segnalato', () => {
  const full = T.demoPacket({ spm: 20, strokes: 5, dist: 10, pace: 130, power: 150, kcal: 1, kcalH: 800, hr: 120, t: 10 });
  const cut = new DataView(full.buffer.slice(0, 10));
  const o = T.parseRower(cut);
  assert.equal(o.truncated, true); assert.equal(o.dist, 10); assert.equal(o.power, undefined);
});
test('resistenza a 1 byte riconosciuta dalla lunghezza', () => {
  const b = new DataView(new ArrayBuffer(6)); b.setUint16(0, 0x0080, true); b.setUint8(2, 40); b.setUint16(3, 7, true); b.setUint8(5, 9);
  const o = T.parseRower(b); assert.equal(o.resistance, 9); assert.equal(o.spm, 20);
});

console.log('Filtro della frequenza cardiaca');
test('un picco isolato viene scartato', () => {
  const st = {}; assert.equal(T.hrFilter(st, 140, 0), 140); assert.equal(T.hrFilter(st, 141, 1000), 141);
  assert.equal(T.hrFilter(st, 185, 2000), null); assert.equal(T.hrFilter(st, 142, 3000), 142); assert.equal(st.rej, 1);
});
test('un salto vero confermato da tre letture viene accettato', () => {
  const st = {}; T.hrFilter(st, 100, 0);
  assert.equal(T.hrFilter(st, 130, 500), null); assert.equal(T.hrFilter(st, 131, 1000), null); assert.equal(T.hrFilter(st, 132, 1500), 132);
});
test('valori impossibili scartati', () => { const st = {}; assert.equal(T.hrFilter(st, 0, 0), null); assert.equal(T.hrFilter(st, 260, 0), null); });
test('FC massima sostenuta ignora un picco singolo', () => {
  const sm = samples(120, () => 200, (t) => t === 60 ? 199 : 160);
  assert.equal(T.maxHrSustained(sm), 160);
});

console.log('Analisi della seduta');
test('zone: 10 minuti a 140 bpm sono in zona 2 con 182/60, 150 bpm in zona 3', () => {
  const zt = T.zoneTimes(samples(600, () => 150, () => 140), T.zoneIdx);
  assert.equal(T.zoneIdx(140), 2); assert.equal(T.zoneIdx(150), 3); assert.equal(zt[2], 600);
});
test('deriva cardiaca: FC che sale del 6% a potenza costante', () => {
  const sm = samples(1500, () => 150, (t) => 130 + 8 * (t / 1500));
  const d = T.decoupling(sm, 300, 1500);
  assert.ok(d.dec > 2 && d.dec < 6, 'deriva ' + d.dec); assert.equal(d.p, 150);
});
test('deriva non calcolata se la potenza è irregolare', () => {
  const sm = samples(1500, (t) => Math.floor(t / 120) % 2 ? 250 : 100, () => 140);
  assert.equal(T.decoupling(sm, 300, 1500), null);
});
test('deriva non calcolata sotto i 10 minuti', () => { assert.equal(T.decoupling(samples(500, () => 150, () => 130), 0, 500), null); });

console.log('Storico ed esportazione');
test('storico: campioni completi solo per i 60 più recenti, mini-grafico per gli altri', () => {
  const h = []; for(let i = 0; i < 80; i++) h.push({ id: NOW - i * DAY, dur: 600, samples: samples(600, () => 150) });
  T.pruneHistory(h);
  assert.equal(h.length, 80); assert.ok(h[59].samples); assert.equal(h[60].samples, undefined); assert.ok(h[60].spark.length <= 61);
});
test('TCX: un punto per secondo, niente orari duplicati, XML con le parti obbligatorie', () => {
  const sm = samples(30, () => 160, () => 130); sm.splice(10, 0, sm[10].slice());
  const x = T.buildTcx({ id: NOW, dur: 30, dist: 120, kcal: 3, avgHr: 130, avgSpm: 22, avgP: 160, samples: sm, coach: { name: 'Fondo' }, comment: ['Prova <ok> & fine'] });
  assert.equal((x.match(/<Trackpoint>/g) || []).length, 31);
  assert.ok(x.includes('<Id>2026-11-08T18:00:00Z</Id>')); assert.ok(x.includes('<ns3:Watts>160</ns3:Watts>'));
  assert.ok(x.includes('Prova &lt;ok&gt; &amp; fine')); assert.ok(x.trim().endsWith('</TrainingCenterDatabase>'));
});

console.log('Commento di fine seduta');
const fondoRec = (id, extra) => Object.assign({ id, dur: 1500, dist: 5600, avgP: 150, avgHr: 128, avgSpm: 22, coach: { id: 'fondo', name: 'Fondo', note: 'Fondo completato.', hard: false } }, extra);
test('fondo: esito, efficienza rispetto al precedente, deriva, prossimo passo', () => {
  const prev = [fondoRec(NOW - 3 * DAY, { ef: 1.10 })];
  const rec = fondoRec(NOW, { ef: 1.18, dec: 3.2, efP: 150, zt: [0, 60, 1200, 200, 0, 0] });
  const c = T.sessionComment(rec, prev, { hrMax: 182, next: 'Prossima volta: soglia.' });
  assert.equal(c[0], 'Fondo completato.');
  assert.ok(c.some(t => /W per battito/.test(t) && /\+7%/.test(t)), c.join(' | '));
  assert.ok(c.some(t => /Deriva cardiaca 3,2%: sotto il 5%/.test(t)));
  assert.ok(c.some(t => /Zona 2 per il 82%/.test(t)));
  assert.equal(c[c.length - 1], 'Prossima volta: soglia.');
});
test('fondo sentito duro e FC oltre la massima', () => {
  const c = T.sessionComment(fondoRec(NOW, { rpe: 8, maxHr: 190 }), [], { hrMax: 182 });
  assert.ok(c.some(t => /Fatica 8 su 10 per una seduta leggera/.test(t)));
  assert.ok(c.some(t => /Hai tenuto 190 bpm/.test(t)));
});
test('test: confronto con il test precedente e recupero a 1 minuto', () => {
  const t1 = { id: NOW - 40 * DAY, dur: 1100, coach: { id: 'piano', ptype: 'test', testAvg: 200, newRef: 180 }, hrr: { d: 20, hr0: 170, hr60: 150 } };
  const t2 = { id: NOW, dur: 1100, coach: { id: 'piano', ptype: 'test', testAvg: 212, newRef: 191, note: 'Test: 212 W medi.' }, hrr: { d: 25, hr0: 172, hr60: 147 } };
  const c = T.sessionComment(t2, [t1], { hrMax: 182 });
  assert.ok(c.some(t => /\+12 W \(\+6%\)/.test(t)), c.join(' | '));
  assert.ok(c.some(t => /Recupero della FC a 1 minuto: 25 battiti/.test(t) && /contro 20/.test(t)));
});
test('voga libera senza coach', () => {
  const c = T.sessionComment({ id: NOW, dur: 900, dist: 3200, avgP: 140, avgHr: 125 }, [], {});
  assert.match(c[0], /^Voga libera: 15:00, 3200 m a 140 W medi, FC media 125\.$/);
});

console.log('Coach');
test('soglia stimata da 20 minuti costanti a 200 W', () => {
  const r = T.estimateRef([{ id: NOW - DAY, samples: samples(1300, () => 200) }], NOW);
  assert.equal(r, 190);
});
test('senza soglia propone il test', () => { assert.equal(T.recommend([], 0, 0, NOW).id, 'test'); });
test('dopo una seduta intensa di ieri propone il fondo', () => {
  const h = [{ id: NOW - 20 * 36e5, dur: 1800, coach: { id: 'soglia', hard: true } }];
  assert.equal(T.recommend(h, 200, NOW - 5 * DAY, NOW).id, 'fondo');
});
test('carico settimanale molto sopra la media del mese: fondo di scarico', () => {
  const h = [];
  for(let i = 0; i < 6; i++) h.push({ id: NOW - (i + 0.5) * DAY, dur: 2400, rpe: 8, coach: { id: 'fondo', hard: false } });
  h.push({ id: NOW - 20 * DAY, dur: 600, rpe: 3, coach: { id: 'cadenza' } });
  const r = T.recommend(h, 200, NOW - 5 * DAY, NOW);
  assert.equal(r.id, 'fondo'); assert.match(r.why, /carico/);
});
test('senza tecnica da più di 14 giorni propone la scala di frequenza', () => {
  const h = [1, 3, 5, 8].map(d => ({ id: NOW - d * DAY, dur: 1500, coach: { id: 'fondo', hard: false } }));
  assert.equal(T.recommend(h, 200, NOW - 5 * DAY, NOW).id, 'cadenza');
});
test('piano: 24 sedute, la 5.3 ha 10 ripetute 30/30', () => {
  const p = T.planForCycle(T.PLAN8_BASE, 1);
  assert.equal(p.length, 24);
  const s = p.find(x => x.id === 'w5s3'); assert.equal(s.phases.filter(x => x.kind === 'work').length, 10);
});
test('ciclo 2: fondi lunghi +15%, il resto uguale', () => {
  const a = T.planForCycle(T.PLAN8_BASE, 1), b = T.planForCycle(T.PLAN8_BASE, 2);
  const fa = a.find(x => x.id === 'w3s1'), fb = b.find(x => x.id === 'w3s1');
  assert.equal(fb.steps[1].t, 1380); assert.equal(fa.steps[1].t, 1200); assert.equal(fb.cyc, 2);
  assert.equal(a.find(x => x.id === 'w5s1').sec, b.find(x => x.id === 'w5s1').sec);
  assert.equal(T.PLAN8_BASE.find(x => x.id === 'w3s1').steps[1].t, 1200, 'il piano base non va modificato');
});
test('zone Karvonen con 182/60', () => { assert.equal(T.hrAt(0.6), 133); assert.equal(T.hrAt(0.7), 145); });

console.log('Video');
test('link YouTube riconosciuti', () => {
  assert.match(T.ytEmbed('https://youtu.be/dQw4w9WgXcQ?t=42'), /embed\/dQw4w9WgXcQ\?.*start=42/);
  assert.match(T.ytEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), /embed\/dQw4w9WgXcQ/);
  assert.equal(T.ytEmbed('https://vimeo.com/123'), null);
});

console.log('\n' + pass + ' superati, ' + fail + ' falliti');
process.exit(fail ? 1 : 0);
