// =========================================================================
// FLEMME — alerte e-mail à l'équipe (fonction Netlify, /api/alerte)
// Appelée par les « Database Webhooks » de Supabase à chaque nouvelle
// demande et à chaque nouveau message, elle prévient l'équipe par e-mail via
// Resend. Seuls les messages des clients déclenchent une alerte.
// Variables Netlify : RESEND_API_KEY, ALERTE_SECRET, ALERTE_EMAIL (voir README).
// =========================================================================
import { timingSafeEqual } from 'node:crypto';

const SITE = 'https://www.flemme.org';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Comparaison du secret en temps constant.
function secretOk(given, expected) {
  const a = Buffer.from(given || ''), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mail(titre, lignes, bouton) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#11120e;max-width:520px">
<p style="font-size:20px;font-weight:800;margin:0 0 12px">${titre}</p>
${lignes.filter(([, v]) => v).map(([k, v]) => `<p style="margin:0 0 6px"><b>${esc(k)} :</b> ${esc(v).replace(/\n/g, '<br>')}</p>`).join('')}
<p style="margin:20px 0"><a href="${SITE}/equipe.html" style="background:#11120e;color:#fff;text-decoration:none;font-weight:800;padding:12px 20px;border-radius:12px">${bouton}</a></p>
<p style="font-size:12px;color:#74786a">Alerte automatique de flemme.org</p></div>`;
}

// Contenu de l'alerte selon l'événement, ou null s'il n'y a rien à signaler.
export function alerte(p) {
  if (!p || p.type !== 'INSERT' || !p.record) return null;
  const r = p.record;
  if (p.table === 'demandes') return {
    subject: `Nouvelle demande ${r.ref} : ${String(r.besoin || '').slice(0, 60)}`,
    html: mail('Nouvelle demande client', [
      ['Référence', r.ref], ['Besoin', r.besoin], ['Détails', r.details], ['Catégorie', r.categorie], ['Échéance', r.echeance],
      ['Fréquence', r.frequence], ['Aide attendue', r.aide_attendue],
      ['Pièces jointes', r.pieces_jointes ? r.pieces_jointes + ' (dans Netlify Forms)' : ''], ['Contact', r.email || 'téléphone (voir Netlify Forms)'],
    ], 'Ouvrir la page équipe'),
  };
  if (p.table === 'messages' && r.auteur === 'client') return {
    subject: 'Nouveau message d’un client',
    html: mail('Un client t’a écrit', [['Message', r.texte]], 'Répondre depuis la page équipe'),
  };
  return null;
}

export default async req => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  const secret = process.env.ALERTE_SECRET, key = process.env.RESEND_API_KEY;
  if (!secret || !key) return new Response('Alerte non configurée', { status: 500 });
  if (!secretOk(req.headers.get('x-alerte-secret'), secret)) return new Response('', { status: 401 });

  let a;
  try { a = alerte(await req.json()); } catch (e) { return new Response('', { status: 400 }); }
  if (!a) return new Response(null, { status: 204 }); // rien à signaler (ex. réponse de l'équipe)

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERTE_FROM || 'Flemme <alertes@flemme.org>',
      to: (process.env.ALERTE_EMAIL || 'ben.champly@gmail.com').split(',').map(s => s.trim()).filter(Boolean),
      subject: a.subject,
      html: a.html,
    }),
  });
  return new Response(r.ok ? 'ok' : 'Resend : ' + r.status, { status: r.ok ? 200 : 502 });
};

export const config = { path: '/api/alerte' };
