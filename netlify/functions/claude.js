exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const TYPE_LABELS_MAP = {bar:'Bar',pub:'Pub',restaurant:'Restaurant',cafe:'Cafe',nightclub:'Boite de nuit',fast_food:'Fast-food',ice_cream:'Glacier',clothes:'Boutique de vetements',shoes:'Boutique de chaussures',hairdresser:'Salon de coiffure',beauty:'Institut de beaute',mall:'Centre commercial',supermarket:'Supermarche',bakery:'Boulangerie',sports:'Commerce de sport',fitness:'Salle de fitness',hotel:'Hotel',hostel:'Auberge',guest_house:'Chambre hote',pharmacy:'Pharmacie',doctors:'Cabinet medical',dentist:'Cabinet dentaire',physiotherapist:'Cabinet kine',spa:'Spa',massage:'Institut de massage',parking:'Parking'};

  try {
    const { action, data } = JSON.parse(event.body);

    if (action === 'email') {
      const p = data.prospect;
      const type = p.typePrecise || TYPE_LABELS_MAP[p.amenity] || TYPE_LABELS_MAP[p.shop] || p.amenity || p.shop || 'etablissement';
      const name = p.name || type;

      const prompt = "Tu es Arnaud, fondateur de Moodstream.ai en Belgique. Ecris un email de prospection personnel et humain a " + name + ", un(e) " + type + ".\n\nStructure EXACTE a respecter :\n\n1. Salutation : Bonjour, (sans prenom)\n\n2. Presentation : Je m appelle Arnaud et je developpe Moodstream.ai, une solution belge de diffusion et de gestion musicale intelligente pour les commerces.\n\n3. Accroche sur l etablissement : Une suggestion ou une reflexion naturelle sur ce type d etablissement et la musique. Ne pas commencer par j ai remarque. Utiliser plutot : En travaillant avec des [type]... / Dans un [type], la musique... / Je pense que dans un [type]... / Il me semble que pour un [type]...\n\n4. Description du logiciel (2-3 phrases) : Moodstream.ai est un logiciel de diffusion et de gestion de musique qui permet de creer un horaire de diffusion precis pour chaque jour de la semaine. L ambiance change automatiquement selon les moments de la journee. Notre equipe, notre IA de conseil ou vous-meme pouvez definir l horaire parfait selon vos besoins. Il est egalement possible d ajouter ou de creer des annonces vocales personnalisees.\n\n5. Argument economique : Nos musiques sont 100% libres de droits, ce qui permet de faire des economies drastiques sur les couts lies a UNISONO et aux redevances.\n\n6. Appel a l action : Proposer l essai gratuit de 14 jours sans engagement. Inviter a demander un devis sur https://www.moodstreamai.com/demande-de-devis ou a repondre directement a cet email pour toute question.\n\n7. Fin : Cordialement uniquement, pas de coordonnees.\n\nRegles : ton chaleureux et humain, jamais commercial, max 220 mots, ecrit comme une vraie personne.\n\nReponds UNIQUEMENT en JSON valide sans markdown ni caracteres speciaux problematiques :\n{\"objet\":\"objet court accrocheur personnalise\",\"corps\":\"corps complet\"}";

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
      });

      const result = await response.json();
      if (result.error) return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };
      const text = result.content[0].text.replace(/```json|```/g, '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: jsonMatch ? jsonMatch[0] : '{}' };
    }

    if (action === 'score') {
      const prompt = "Expert Moodstream.ai. Score 0-100 ces prospects selon surface, secteur, probabilite musicale.\nProspects : " + JSON.stringify(data.prospects) + "\nJSON UNIQUEMENT : {\"scores\":[{\"id\":\"id\",\"score\":85,\"score_surface\":30,\"score_secteur\":35,\"score_musique\":20,\"type_precise\":\"Restaurant\",\"surface_estimee\":\"150m2\",\"potentiel\":\"Eleve\",\"raison\":\"explication\"}]}";
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
      });
      const result = await response.json();
      if (result.error) return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };
      const text = result.content[0].text.replace(/```json|```/g, '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: jsonMatch ? jsonMatch[0] : '{}' };
    }

    if (action === 'enrich') {
      const prompt = "Expert Moodstream.ai. Enrichis ces etablissements.\n" + JSON.stringify(data.prospects) + "\nJSON UNIQUEMENT : {\"prospects\":[{\"id\":\"id\",\"nom\":\"Nom\",\"type_precise\":\"Type\",\"secteur\":\"horeca\",\"surface_estimee\":\"80m2\",\"score\":78,\"potentiel_musical\":\"Eleve\",\"raison_contact\":\"Raison\",\"accroche\":\"Accroche email\"}]}";
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
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
