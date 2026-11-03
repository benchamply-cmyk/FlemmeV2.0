import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDemo, writeDemo } from '../src/storage.ts';
import { seed } from '../../mobile/src/gateway.ts';

// Storage minimal en mémoire, avec une limite pour simuler un localStorage plein.
function memory(limit = Infinity): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, clear: () => m.clear(), removeItem: k => { m.delete(k); },
    setItem(k, v) { const used = [...m.values()].reduce((n, s) => n + s.length, 0); if (used + v.length > limit) throw new DOMException('plein', 'QuotaExceededError'); m.set(k, v); },
  };
}
const state = () => ({ version: 1 as const, tasks: seed(), requests: {} });

test('vide : pas de snapshot, la démo repart des données fictives', async () => {
  assert.equal(await readDemo(memory()), null);
});
test('snapshots additifs : le plus récent est lu, les anciens restent', async () => {
  const s = memory(), a = state(), b = { ...state(), tasks: [] };
  await writeDemo(a, s); await new Promise(r => setTimeout(r, 2)); await writeDemo(b, s);
  assert.equal(s.length, 2); assert.deepEqual((await readDemo(s))!.tasks, []);
});
test('snapshot récent illisible : retour au précédent sans rien effacer', async () => {
  const s = memory(); await writeDemo(state(), s);
  s.setItem('flemme-web-demo:9999999999999-x', '{cassé'); assert.equal((await readDemo(s))!.tasks.length, 3); assert.equal(s.length, 2);
});
test('stockage plein : les plus anciennes copies sont retirées, les 5 récentes et la nouvelle restent', async () => {
  const size = JSON.stringify(state()).length, s = memory(size * 8 + 10);
  for (let i = 0; i < 8; i++) { await writeDemo(state(), s); await new Promise(r => setTimeout(r, 2)); }
  const recent = [...Array(s.length).keys()].map(i => s.key(i)!).sort().reverse().slice(0, 5);
  await writeDemo({ ...state(), tasks: [] }, s);
  assert.equal(s.length, 6);
  for (const k of recent) assert.notEqual(s.getItem(k), null);
  assert.deepEqual((await readDemo(s))!.tasks, []);
});
test('stockage plein même après le ménage : l’écriture échoue, aucun succès annoncé', async () => {
  await assert.rejects(writeDemo(state(), memory(10)));
});
