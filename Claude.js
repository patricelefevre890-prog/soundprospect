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
    let prompt = '';

    if (action === 'score') {
      // Score a list of prospects
      prompt = `Tu es un expert en développement commercial pour Moodstream.ai, une solution de diffusion musicale B2B pour commerces et établissements.

Analyse ces prospects et attribue un score de 0 à 100 basé sur :
- Surface (plus c'est grand = mieux, max 40 pts)
- Secteur (horeca et commerces = priorité, max 35 pts)  
- Probabilité de diffusion musicale (max 25 pts)

Prospects à analyser :
${JSON.stringify(data.prospects)}

Réponds UNIQUEMENT en JSON valide :
{
  "scores": [
    {
      "id": "id_du_prospect",
      "score": 85,
      "score_surface": 30,
      "score_secteur": 35,
      "score_musique": 20,
      "type_precise": "Restaurant gastronomique",
      "surface_estimee": "150 m²",
      "potentiel": "Élevé",
      "raison": "Restaurant de taille moyenne, fort potentiel musical"
    }
  ]
}`;

    } else if (action === 'enrich') {
      // Enrich prospects for city search
      prompt = `Tu es un expert en développement commercial pour Moodstream.ai, solution de diffusion musicale B2B.

Pour chaque établissement, analyse et enrichis les données. Identifie précisément le type d'établissement, estime la surface, évalue le potentiel musical.

Établissements :
${JSON.stringify(data.prospects)}

Réponds UNIQUEMENT en JSON valide :
{
  "prospects": [
    {
      "id": "id",
      "nom": "Nom de l'établissement",
      "type_precise": "Type précis (ex: Salon de coiffure haut de gamme)",
      "secteur": "horeca|commerce|bienetre|sante|hotel|parking|sport|autre",
      "surface_estimee": "~80 m²",
      "score": 78,
      "potentiel_musical": "Élevé|Moyen|Faible",
      "raison_contact": "Raison courte pourquoi contacter cet établissement",
      "accroche": "Accroche personnalisée pour l'email (ex: Dans un salon de coiffure, l'ambiance sonore est aussi importante que la coupe)"
    }
  ]
}`;

    } else if (action === 'email') {
      // Generate prospecting email
      const p = data.prospect;
      prompt = `Tu es un expert en développement commercial pour Moodstream.ai, solution de diffusion musicale B2B.

Rédige un email de prospection pour cet établissement. L'email doit être :
- Chaleureux et humain, jamais intrusif
- Court et efficace (max 150 mots)
- Personnalisé avec le nom/type de l'établissement
- Mentionner l'adaptation automatique aux moments de la journée
- Mentionner les musiques 100% libres de droits et la suppression des redevances UNISONO
- Proposer un essai gratuit de 14 jours
- Terminer par un appel à l'action simple (devis sur moodstreamai.com/demande-de-devis ou réponse à l'email)

Établissement : ${p.nom || p.name || 'Établissement'}
Type précis : ${p.type_precise || p.type || ''}
Secteur : ${p.secteur || ''}
Surface estimée : ${p.surface_estimee || 'non connue'}
Accroche spécifique : ${p.accroche || ''}

Inspire-toi de ce modèle mais adapte-le totalement à cet établissement :
"OBJET: [Nom établissement] mérite une ambiance à son image
[Prénom/Madame/Monsieur],
Dans [type établissement], l'ambiance sonore compte autant que [élément clé du business]. Pourtant, beaucoup se retrouvent avec une musique générique qui ne reflète pas leur identité.
Moodstream.ai propose une solution simple : une programmation musicale qui s'adapte automatiquement à vos moments de la journée.
Le tout avec des musiques 100% libres de droits, vous permettant d'alléger durablement votre facture musicale en supprimant les redevances UNISONO.
Essayez gratuitement pendant 14 jours — sans engagement.
Curieux d'en savoir plus ? Demandez un devis sur moodstreamai.com/demande-de-devis ou répondez simplement à cet email."

Réponds UNIQUEMENT en JSON :
{
  "objet": "Sujet de l'email",
  "corps": "Corps complet de l'email"
}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const result = await response.json();
    if (result.error) return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };

    const text = result.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
