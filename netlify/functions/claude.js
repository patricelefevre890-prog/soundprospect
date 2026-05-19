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

      const prompt = "Tu es Arnaud, fondateur de Moodstream.ai. Ecris un email naturel et humain a " + name + " qui est un(e) " + type + ".\n\nStructure EXACTE :\n\n1. Bonjour,\n\n2. Premier paragraphe : Commencer par je me permets de vous contacter au sujet de la diffusion musicale dans votre etablissement. Puis se presenter : je m appelle Arnaud, je suis le fondateur de Moodstream.ai, une solution belge de gestion et diffusion musicale pour les commerces. 2 phrases max.\n\n3. Deuxieme paragraphe : Dire qu on imagine qu ils diffusent de la musique dans leur espace (adapter : salle, surface, salle d attente selon le type) et que l ambiance sonore est importante pour leurs clients et l image de leur etablissement. Mentionner que les couts lies a UNISONO et aux societes de gestion collective peuvent representer une vraie charge financiere.\n\n4. Troisieme paragraphe : Moodstream.ai est un logiciel de diffusion et gestion musicale. Il permet de creer un horaire de diffusion precis pour chaque jour de la semaine, avec une ambiance qui change automatiquement selon les moments de la journee. Notre equipe peut creer cet horaire avec eux gratuitement, ou ils peuvent utiliser notre IA de conseil, ou le faire eux-memes en toute autonomie. Il est aussi possible d ajouter des annonces vocales personnalisees.\n\n5. Quatrieme paragraphe : Nos musiques sont 100% libres de toute redevance aux societes de gestion collective, ce qui permet de faire des economies drastiques.\n\n6. Appel a l action : essai gratuit 14 jours sans engagement. Devis sur https://www.moodstreamai.com/demande-de-devis ou repondre a cet email pour toute question.\n\n7. Cordialement uniquement, pas de coordonnees, pas de nom.\n\nTon : humain, simple, direct. Max 230 mots.\n\nPour l objet : utiliser le format Une nouvelle solution musicale pour l ambiance de [nom etablissement ou type etablissement].\n\nReponds UNIQUEMENT en JSON valide sans markdown :\n{\"objet\":\"Une nouvelle solution musicale pour l ambiance de [nom]\",\"corps\":\"corps complet\"}";

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
