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
      const prompt = `Tu es Arnaud Gregoire, fondateur de Moodstream.AI, startup belge de diffusion musicale pour commerces (100% libre de droits, remplace UNISONO/SABAM).

Rédige un email de prospection court et personnel pour "${prospect.name || 'cet établissement'}" (${prospect.type || prospect.amenity || prospect.shop || 'commerce'}).

- Français, ton chaleureux et direct
- Mentionne le type d'établissement
- Valeur : musique adaptée + suppression redevances
- Essai gratuit 14 jours
- 4-6 phrases max

Retourne UNIQUEMENT ce JSON sans texte avant ni après :
{"objet":"...","corps":"..."}`;

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
