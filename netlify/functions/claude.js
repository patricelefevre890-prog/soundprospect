// netlify/functions/claude.js

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

async function callAnthropic(body) {
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Anthropic ' + resp.status + ': ' + err.substring(0, 200));
  }
  return resp.json();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { action, data } = JSON.parse(event.body || '{}');

    // ── ACTION : SEARCH ──────────────────────────────────────────────────────
    if (action === 'search') {
      const { city, radius, withEmail } = data;
      const r = parseInt(radius);
      const radiusLabel = r <= 500 ? '500m' : r <= 1000 ? '1km' : r <= 2000 ? '2km' : '5km';
      const emailClause = withEmail ? 'Inclus uniquement les établissements qui ont un email.' : '';

      const prompt = `Liste des établissements commerciaux réels situés à ${city} en Belgique (rayon ${radiusLabel}). ${emailClause}
Types à inclure : restaurants, bars, cafés, hôtels, coiffeurs, instituts beauté, salles de sport, médecins, dentistes, kinés, pharmacies, supermarchés, boulangeries, garages, commerces de mode, etc.
Réponds UNIQUEMENT avec ce JSON valide, sans aucun texte avant ou après :
{"prospects":[{"name":"nom réel","type":"type","address":"adresse complète","email":"","phone":"","website":"","lat":50.0,"lon":4.0}]}
Donne minimum 15 établissements réels avec leurs vraies coordonnées GPS.`;

      const response = await callAnthropic({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = (response.content || []).find(b => b.type === 'text')?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Pas de JSON: ' + text.substring(0, 200));
      const parsed = JSON.parse(jsonMatch[0]);
      return { statusCode: 200, headers, body: JSON.stringify(parsed) };
    }

    // ── ACTION : EMAIL ───────────────────────────────────────────────────────
    if (action === 'email') {
      const { prospect } = data;
      const type = prospect.type || prospect.amenity || prospect.shop || 'établissement';
      const name = prospect.name || 'votre établissement';
      const prompt = `Rédige un email de prospection pour "${name}" (${type}) en adaptant UNIQUEMENT les parties [entre crochets] de ce texte exact. Ne change rien d'autre :

Bonjour,

Je me permets de vous contacter au sujet de la diffusion musicale dans votre établissement. Je m'appelle Arnaud, je suis le fondateur de Moodstream.ai, une solution belge de gestion et diffusion musicale pour les commerces.

J'imagine que vous diffusez de la musique dans votre espace. L'ambiance sonore est vraiment importante pour vos clients et pour l'image de [votre ${type}]. Le problème, c'est que les coûts liés à UNISONO et aux sociétés de gestion collective peuvent représenter une vraie charge financière.

Moodstream.ai est un logiciel de diffusion et gestion musicale qui change la donne. Vous pouvez créer un horaire de diffusion précis pour chaque jour de la semaine, avec une ambiance qui change automatiquement selon les moments de la journée. Notre équipe peut créer cet horaire gratuitement avec vous, ou vous pouvez utiliser notre IA de conseil, ou simplement le faire en toute autonomie. Vous pouvez même ajouter des annonces vocales personnalisées.

Le meilleur ? Nos musiques sont 100% libres de toute redevance aux sociétés de gestion collective. Ça vous permet de faire des économies drastiques.

Je vous propose un essai gratuit de 14 jours sans engagement. Vous pouvez demander un devis sur https://www.moodstreamai.com/demande-de-devis ou simplement me répondre si vous avez des questions.

Cordialement

Retourne UNIQUEMENT ce JSON sans texte avant ni après, sans signature :
{"objet":"[objet court et accrocheur adapté au type d'établissement]","corps":"[le texte complet de l'email]"}`;

      const response = await callAnthropic({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = (response.content || []).find(b => b.type === 'text')?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Pas de JSON email: ' + text.substring(0, 200));
      return { statusCode: 200, headers, body: jsonMatch[0] };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };

  } catch (e) {
    console.error('[claude] error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
