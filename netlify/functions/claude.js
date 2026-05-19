// netlify/functions/claude.js
// Utilise fetch natif — pas de dépendance @anthropic-ai/sdk

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

async function callAnthropic(body) {
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
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
      const emailClause = withEmail ? 'Inclus uniquement ceux qui ont une adresse email publique.' : '';

      const prompt = `Tu es un assistant de prospection commerciale. Cherche les établissements commerciaux situés dans un rayon de ${radiusLabel} autour de "${city}" en Belgique. ${emailClause}

Inclus tous types : restaurants, bars, cafés, commerces, hôtels, coiffeurs, beauté, sport, médecins, dentistes, kinés, pharmacies, supermarchés, boulangeries, garages, etc.

Retourne UNIQUEMENT ce JSON valide, sans texte avant ni après :
{"prospects":[{"name":"...","type":"...","address":"...","email":"...","phone":"...","website":"...","lat":0.0,"lon":0.0}]}

Vise 20-30 résultats minimum.`;

      const response = await callAnthropic({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      });

      // Extraire le texte final (après les tool_use blocks)
      let resultText = '';
      for (const block of (response.content || [])) {
        if (block.type === 'text') resultText += block.text;
      }

      const jsonMatch = resultText.match(/\{[\s\S]*"prospects"[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Pas de JSON prospects dans la réponse: ' + resultText.substring(0, 300));
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = (response.content || []).find(b => b.type === 'text')?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Pas de JSON dans la réponse email');
      return { statusCode: 200, headers, body: jsonMatch[0] };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };

  } catch (e) {
    console.error('[claude] error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
