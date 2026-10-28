import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, commission, createTask, parseMoney, visibleTask } from '../src/domain.ts';
import { DemoGateway, demoActors } from '../src/gateway.ts';
const [owner, brigadier, stranger] = demoActors;
const at = '2026-10-28T10:00:00.000Z';
const input = { title: 'Mon meuble', details: 'Un montage', place: 'Aix', budget: null };
const initial = () => createTask('t', owner, input, at);
const proposed = () => applyCommand(initial(), brigadier, 'offer', { id: 'o', amount: 4000, slot: 'Samedi', scope: 'Déplacement inclus' }, at);

test('montants : français, centimes, limites et arrondi de la commission', () => {
  assert.equal(parseMoney('40,05'), 4005);
  assert.equal(parseMoney('', true), null);
  for (const bad of ['0', '-1', '1.005', '1e2', 'Infinity', '10000.01', '  ']) assert.throws(() => parseMoney(bad));
  assert.equal(commission(4000), 400);
  assert.equal(commission(1005), 101);
  assert.equal(commission(1), 0);
});
test('annonce ouverte sans expiration, budget facultatif et validation', () => {
  assert.equal(initial().status, 'open'); assert.equal(initial().budget, null);
  assert.ok(!('expiresAt' in initial()));
  assert.throws(() => createTask('t', owner, { ...input, title: '  ' }, at));
  assert.throws(() => createTask('t', owner, { ...input, budget: 12.5 }, at));
});
test('droits : pas d’auto-attribution, lecture des discussions réservée aux participants', () => {
  assert.throws(() => applyCommand(initial(), owner, 'offer', { id: 'a', amount: 100 }, at));
  const t = applyCommand(proposed(), owner, 'message', { offerId: 'o', text: 'Message privé' }, at);
  assert.throws(() => applyCommand(t, stranger, 'message', { offerId: 'o', text: 'Intrusion' }, at));
  assert.equal(visibleTask(t, stranger).offers.length, 0);
  assert.equal(visibleTask(t, brigadier).offers[0].messages[0].text, 'Message privé');
  assert.equal(proposed().offers[0].messages.length, 0);
});
test('acceptation unique, prix figé et autres offres conservées', () => {
  let t = applyCommand(proposed(), stranger, 'offer', { id: 'o2', amount: 3000, slot: 'Lundi', scope: 'Sans transport' }, at);
  assert.throws(() => applyCommand(t, brigadier, 'accept', { offerId: 'o' }, at));
  t = applyCommand(t, owner, 'accept', { offerId: 'o' }, at);
  assert.equal(t.status, 'assigned');
  assert.deepEqual(t.agreement, { amount: 4000, commission: 400, total: 4400, slot: 'Samedi', scope: 'Déplacement inclus', brigadier });
  assert.equal(t.offers.length, 2); assert.equal(t.offers[1].status, 'not_selected');
  assert.throws(() => applyCommand(t, owner, 'accept', { offerId: 'o2' }, at));
  assert.throws(() => applyCommand(t, stranger, 'offer', { id: 'o3', amount: 1000 }, at));
});
test('tâche terminée, paiement déclaré puis confirmé, signalement conservé', () => {
  let t = applyCommand(proposed(), owner, 'accept', { offerId: 'o' }, at);
  assert.throws(() => applyCommand(t, owner, 'declare_payment', {}, at));
  assert.throws(() => applyCommand(t, brigadier, 'complete', {}, at));
  t = applyCommand(t, owner, 'complete', {}, at);
  t = applyCommand(t, owner, 'declare_payment', {}, at);
  assert.throws(() => applyCommand(t, stranger, 'confirm_payment', {}, at));
  t = applyCommand(t, brigadier, 'confirm_payment', {}, at);
  t = applyCommand(t, brigadier, 'report', { text: 'Prestation contestée' }, at);
  assert.equal(t.paymentConfirmed, true); assert.equal(t.reports.length, 1);
  assert.equal(t.history.length, 7); assert.equal(t.agreement?.commission, 400);
  assert.throws(() => applyCommand(t, stranger, 'report', { text: 'Intrusion' }, at));
});
test('déclin conserve la proposition et permet un nouveau forfait', () => {
  let t = applyCommand(proposed(), owner, 'decline', { offerId: 'o' }, at);
  t = applyCommand(t, brigadier, 'offer', { id: 'o2', amount: 3500, slot: 'Samedi', scope: 'Nouveau forfait' }, at);
  assert.equal(t.offers.length, 2); assert.equal(t.offers[0].status, 'declined');
});
test('persistance : un échec disque n’annonce pas une création réussie ; rejeu idempotent', async () => {
  const fail = new DemoGateway(null, async () => { throw new Error('Disque plein'); });
  await assert.rejects(fail.create(input, 'request'), /Disque plein/);
  assert.equal((await fail.list()).length, 3);
  let writes = 0;
  const g = new DemoGateway(null, async () => { writes++; });
  const a = await g.create(input, 'request'), b = await g.create(input, 'request');
  assert.equal(a.id, b.id); assert.equal(writes, 1);
  g.actor = brigadier;
  const t = await g.command(a.id, 'offer', { amount: 1005, slot: 'Lundi', scope: 'Tout compris' }, 'offer-request');
  assert.ok(t.offers[0].id);
  assert.equal((await g.list()).find(x => x.id === a.id)?.offers.length, 1);
});
