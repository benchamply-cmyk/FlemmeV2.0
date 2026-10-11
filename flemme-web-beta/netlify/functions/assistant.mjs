// =========================================================================
// FLEMME — assistant IA de création de demande (fonction Netlify, /api/assistant)
// Le widget du site (assistant.js) envoie la conversation ; Claude pose une
// question à la fois, puis propose une demande prête (besoin, catégorie,
// échéance, précisions) que le site recopie dans le formulaire #offer.
// L'utilisateur relit et envoie lui-même : rien n'est envoyé à l'équipe ici.
// Variable Netlify : ANTHROPIC_API_KEY (obligatoire), ASSISTANT_MODEL (facultatif).
// =========================================================================
import Anthropic from '@anthropic-ai/sdk';
import categories from '../../content/categories.json' with { type: 'json' };

const ECHEANCES = ['Aucune urgence', 'Cette année', 'Ce mois-ci', 'Cette semaine', 'Aujourd’hui', 'Urgent, délai dépassé'];
const CATS = categories.groupes.flatMap(g => g.sous.map(s => ({ id: s.id, nom: s.nom, groupe: g.nom, exemple: s.exemple })));

// Limites pour éviter les abus : la clé est payée à l'usage.
const MAX_MESSAGES = 24, MAX_CHARS = 2000;

const SYSTEM = `Tu es l'assistant de Flemme (flemme.org), un service où l'on confie ce qu'on a la flemme de faire : trouver un artisan, prendre un rendez-vous, gérer de la paperasse, comparer des prix, préparer un voyage, chercher et résumer une information, apprendre plus facilement. Le service est en bêta gratuite ; une équipe humaine étudie chaque demande.

Ton rôle : aider la personne à formuler une demande claire et complète, puis la préparer pour le formulaire du site. Tu ne réalises pas la tâche toi-même et tu ne promets pas qu'elle sera prise en charge.

Façon de faire :
- Tutoie, sois chaleureux, simple et bref (2 à 3 phrases au plus par message). Écris en français.
- Pose UNE seule question à la fois, celle qui manque le plus pour que l'équipe puisse agir : le résultat attendu, le lieu, les dates ou le délai, le budget, les contraintes, ce qui a déjà été essayé.
- Propose 2 à 4 réponses courtes cliquables dans « suggestions » quand c'est utile (sinon une liste vide).
- Dès que tu as l'essentiel (en général après 2 à 4 questions), ou si la personne veut finir, mets « pret » à true, résume la demande dans « message » et demande-lui de vérifier puis de cliquer sur « Remplir le formulaire ».
- Tant que « pret » est false, remplis quand même « demande » avec ce que tu sais déjà.
- Ne demande jamais de données sensibles (numéro de sécurité sociale, coordonnées bancaires, mots de passe, données de santé détaillées). Si la personne en donne, ne les recopie pas dans la demande. Le contact (e-mail ou téléphone) est demandé par le formulaire : ne le demande pas.
- Si la demande sort du cadre (illégal, dangereux), dis-le gentiment et propose de reformuler.

Champs de « demande » :
- besoin : une phrase claire à la première personne, 140 caractères au plus (ex. « Trouver un plombier pour une fuite sous l'évier à Lyon 3e »).
- categorie_id : l'identifiant de la catégorie la plus proche dans la liste ci-dessous, ou "" si aucune ne convient.
- echeance : une des valeurs proposées ; « Aucune urgence » si rien n'a été dit.
- precisions : le contexte utile en quelques lignes (lieu, dates, budget, contraintes, résultat attendu, ce qui a déjà été tenté).

Catégories (identifiant : service — section) :
${CATS.map(c => `${c.id} : ${c.nom} — ${c.groupe}`).join('\n')}`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'suggestions', 'pret', 'demande'],
  properties: {
    message: { type: 'string', description: 'Ce que l’assistant dit à la personne.' },
    suggestions: { type: 'array', items: { type: 'string' }, description: 'Réponses courtes cliquables (0 à 4).' },
    pret: { type: 'boolean', description: 'true quand la demande est prête à être recopiée dans le formulaire.' },
    demande: {
      type: 'object',
      additionalProperties: false,
      required: ['besoin', 'categorie_id', 'echeance', 'precisions'],
      properties: {
        besoin: { type: 'string' },
        categorie_id: { type: 'string', enum: ['', ...CATS.map(c => c.id)] },
        echeance: { type: 'string', enum: ECHEANCES },
        precisions: { type: 'string' },
      },
    },
  },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Conversation reçue du navigateur : on ne garde que des messages texte bien formés,
// en commençant par l'utilisateur et en alternant les rôles, comme l'exige l'API.
export function nettoyer(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    if (out.length ? out[out.length - 1].role === m.role : m.role !== 'user') return null;
    out.push({ role: m.role, content });
  }
  return out[out.length - 1].role === 'user' ? out : null;
}

export default async req => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) return json({ erreur: 'Assistant non configuré' }, 503);

  let messages;
  try { messages = nettoyer((await req.json()).messages); } catch (e) { messages = null; }
  if (!messages) return json({ erreur: 'Conversation invalide' }, 400);

  try {
    const client = new Anthropic();
    const r = await client.beta.messages.create({
      model: process.env.ASSISTANT_MODEL || 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages,
    });
    if (r.stop_reason === 'refusal') return json({ message: 'Je ne peux pas t’aider sur ce point. Tu peux reformuler ta demande ou remplir le formulaire directement.', suggestions: [], pret: false, demande: null });
    const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const out = JSON.parse(text);
    const cat = CATS.find(c => c.id === out.demande.categorie_id);
    out.demande.categorie = cat ? cat.nom : '';
    out.suggestions = (out.suggestions || []).slice(0, 4);
    return json(out);
  } catch (e) {
    console.error('Assistant :', e && e.status, e && e.message);
    return json({ erreur: 'Assistant indisponible' }, 502);
  }
};

export const config = { path: '/api/assistant' };
