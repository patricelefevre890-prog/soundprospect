// netlify/functions/claude.js

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    // ── ACTION : SEARCH ───────────────────────────────────────────────────────
    if (action === 'search') {
      const { city, radius, withEmail } = data;
      const radiusLabel = radius <= 500 ? '500m' : radius <= 1000 ? '1km' : radius <= 2000 ? '2km' : '5km';
      const emailClause = withEmail ? 'qui ont une adresse email publique' : '';

      const prompt = `Tu es un assistant de prospection commerciale. 
Cherche tous les établissements commerciaux ${emailClause} situés dans un rayon de ${radiusLabel} autour de "${city}" en Belgique (ou France si non trouvé en Belgique).

Inclus TOUS les types : restaurants, bars, cafés, commerces, hôtels, coiffeurs, instituts de beauté, salles de sport, cabinets médicaux, dentistes, kinés, pharmacies, supermarchés, boulangeries, garages, etc.

Pour chaque établissement trouvé, retourne un objet JSON avec exactement ces champs :
- name : nom de l'établissement
- type : type (restaurant, bar, coiffeur, etc.)
- address : adresse complète
- email : adresse email si disponible (sinon chaîne vide)
- phone : téléphone si disponible (sinon chaîne vide)
- website : site web si disponible (sinon chaîne vide)
- lat : latitude (nombre)
- lon : longitude (nombre)

Retourne UNIQUEMENT un objet JSON valide avec ce format, sans texte avant ni après :
{"prospects": [...]}

Cherche autant d'établissements que possible, vise au moins 20-30 résultats.`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      });

      // Extraire le texte final de la réponse (après tool use)
      let resultText = '';
      for (const block of response.content) {
        if (block.type === 'text') resultText += block.text;
      }

      // Parser le JSON retourné par Claude
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);
      return { statusCode: 200, headers, body: JSON.stringify(parsed) };
    }

    // ── ACTION : EMAIL ────────────────────────────────────────────────────────
    if (action === 'email') {
      const { prospect } = data;
      const prompt = `Tu es Arnaud Gregoire, fondateur de Moodstream.AI, une startup belge de diffusion musicale pour commerces (100% libre de droits, remplace les redevances UNISONO/SABAM).

Rédige un email de prospection court, naturel et personnel pour "${prospect.name || 'cet établissement'}" (${prospect.type || prospect.amenity || prospect.shop || 'commerce'}).

L'email doit :
- Être en français, ton chaleureux et direct (pas corporate)
- Mentionner spécifiquement le type d'établissement
- Expliquer brièvement la valeur : musique adaptée + suppression redevances
- Proposer un essai gratuit 14 jours
- Faire 4-6 phrases maximum

Retourne UNIQUEMENT ce JSON sans texte avant ni après :
{"objet": "...", "corps": "..."}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content.find(b => b.type === 'text')?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in email response');
      return { statusCode: 200, headers, body: jsonMatch[0] };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (e) {
    console.error('[claude] error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
