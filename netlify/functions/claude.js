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
      const rawType = prospect.type || prospect.amenity || prospect.shop || '';
      const typeLabels = {
        bar:'bar', pub:'pub', restaurant:'restaurant', cafe:'café', nightclub:'boîte de nuit',
        fast_food:'restaurant fast-food', ice_cream:'glacier', food_court:'food court', biergarten:'brasserie',
        hotel:'hôtel', hostel:'auberge de jeunesse', guest_house:"chambre d'hôte", motel:'motel',
        hairdresser:'salon de coiffure', beauty:'institut de beauté', nail_salon:'salon de nail art',
        spa:'spa', massage:'institut de massage',
        fitness:'salle de fitness', gym:'salle de sport', sports_centre:'centre sportif', yoga:'studio de yoga',
        doctors:'cabinet médical', dentist:'cabinet dentaire', physiotherapist:'cabinet de kinésithérapie',
        clinic:'clinique', veterinary:'cabinet vétérinaire', optician:"magasin d'optique",
        pharmacy:'pharmacie',
        supermarket:'supermarché', mall:'centre commercial', department_store:'grand magasin',
        convenience:'épicerie', bakery:'boulangerie', butcher:'boucherie', deli:'traiteur',
        greengrocer:'primeur', confectionery:'chocolaterie',
        clothes:'magasin de vêtements', shoes:'magasin de chaussures', jewelry:'bijouterie',
        furniture:"magasin de mobilier", florist:'fleuriste', garden_centre:'jardinerie',
        cinema:'cinéma', theatre:'théâtre', museum:'musée', casino:'casino', escape_room:'escape room',
        car_repair:'garage automobile', car_wash:'station de lavage',
        laundry:'laverie', dry_cleaning:'pressing', travel_agency:'agence de voyage',
        office:'bureau', bank:'banque', real_estate:'agence immobilière',
      };
      const type = typeLabels[rawType] || (rawType ? rawType.replace(/_/g,' ') : 'établissement');
      const name = prospect.name || 'votre établissement';
      const corps = `Bonjour,

Je me permets de vous contacter au sujet de la diffusion musicale dans votre établissement. Je m'appelle Arnaud, je suis le fondateur de Moodstream.ai, une solution belge de gestion et diffusion musicale pour les commerces.

J'imagine que vous diffusez de la musique dans votre espace. L'ambiance sonore est vraiment importante pour vos clients et pour l'image de votre ${type}. Le problème, c'est que les coûts liés à UNISONO et aux sociétés de gestion collective peuvent représenter une vraie charge financière.

Moodstream.ai est un logiciel de diffusion et gestion musicale qui change la donne. Vous pouvez créer un horaire de diffusion précis pour chaque jour de la semaine, avec une ambiance qui change automatiquement selon les moments de la journée. Notre équipe peut créer cet horaire gratuitement avec vous, ou vous pouvez utiliser notre IA de conseil, ou simplement le faire en toute autonomie. Vous pouvez même ajouter des annonces vocales personnalisées.

Le meilleur ? Nos musiques sont 100% libres de toute redevance aux sociétés de gestion collective. Ça vous permet de faire des économies drastiques.

Je vous propose un essai gratuit de 14 jours sans engagement. Vous pouvez demander un devis sur https://www.moodstreamai.com/demande-de-devis ou simplement me répondre si vous avez des questions.

Cordialement`;

      const prompt = `Génère uniquement l'objet de cet email de prospection pour un "${type}" nommé "${name}". L'objet doit être court, accrocheur, en français.
Retourne UNIQUEMENT ce JSON sans texte avant ni après :
{"objet":"..."}`;

      const response = await callAnthropic({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = (response.content || []).find(b => b.type === 'text')?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      let objet = jsonMatch ? JSON.parse(jsonMatch[0]).objet : 'Moodstream.ai — Diffusion musicale pour votre ' + type;
      objet = objet.replace(/^\[|\]$/g, '').trim(); // retire les crochets si Claude en ajoute
      return { statusCode: 200, headers, body: JSON.stringify({ objet, corps }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };

  } catch (e) {
    console.error('[claude] error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
