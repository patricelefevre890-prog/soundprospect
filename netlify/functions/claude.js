exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') {

    return { statusCode: 405, body: 'Method Not Allowed' };

  }

 

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {

    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };

  }

 

  try {

    const { action, data } = JSON.parse(event.body);

 

    if (action === 'email') {

      const p = data.prospect;

      const type = p.typePrecise || TYPE_LABELS_MAP[p.amenity] || TYPE_LABELS_MAP[p.shop] || p.amenity || p.shop || 'établissement';

      const name = p.name || type;

 

      const prompt = `Tu es Arnaud, fondateur de Moodstream.ai en Belgique. Tu dois écrire un email de prospection personnel et humain à ${name}, un(e) ${type}.

 

Contexte sur Moodstream.ai :

- Solution belge de diffusion musicale intelligente pour les commerces et établissements

- La musique s'adapte automatiquement aux moments de la journée (matin énergique, midi convivial, soir plus feutré)

- Musiques 100% libres de droits — donc zéro redevances UNISONO à payer

- Essai gratuit de 14 jours sans engagement

- Devis sur moodstreamai.com/demande-de-devis

 

Règles d'écriture STRICTES :

- Écris comme si tu l'avais tapé à la main, naturellement, sans template commercial

- Commence par une observation sincère sur ce type d'établissement (pas de flatterie creuse)

- Présente-toi rapidement : "Je m'appelle Arnaud, je développe Moodstream.ai..."

- Explique en 2-3 phrases ce qu'on fait et pourquoi ça peut les intéresser

- Mentionne l'avantage UNISONO (supprimer les redevances) — c'est souvent ce qui accroche

- Propose l'essai gratuit 14 jours

- Termine par "Cordialement" uniquement (pas de coordonnées, l'expéditeur a une signature automatique)

- Maximum 180 mots

- Ton : chaleureux, direct, jamais commercial ni pompeux

 

Réponds UNIQUEMENT en JSON valide :

{"objet":"objet court et accrocheur personnalisé","corps":"corps complet de l'email"}`;

 

      const response = await fetch('https://api.anthropic.com/v1/messages', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },

        body: JSON.stringify({

          model: 'claude-haiku-4-5-20251001',

          max_tokens: 1024,

          messages: [{ role: 'user', content: prompt }]

        })

      });

 

      const result = await response.json();

      if (result.error) return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };

      const text = result.content[0].text.replace(/```json|```/g, '').trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);

      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: jsonMatch ? jsonMatch[0] : '{}' };

    }

 

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };

 

  } catch (err) {

    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };

  }

};

 

const TYPE_LABELS_MAP = {bar:'Bar',pub:'Pub',restaurant:'Restaurant',cafe:'Café',nightclub:'Boîte de nuit',fast_food:'Fast-food',ice_cream:'Glacier',clothes:'Boutique de vêtements',shoes:'Boutique de chaussures',hairdresser:'Salon de coiffure',beauty:'Institut de beauté',mall:'Centre commercial',supermarket:'Supermarché',bakery:'Boulangerie',sports:'Commerce de sport',fitness:'Salle de fitness',hotel:'Hôtel',hostel:'Auberge',guest_house:"Chambre d'hôte",pharmacy:'Pharmacie',doctors:'Cabinet médical',dentist:'Cabinet dentaire',physiotherapist:'Cabinet de kiné',spa:'Spa',massage:'Institut de massage',parking:'Parking'};
