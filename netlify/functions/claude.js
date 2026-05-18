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

      const prompt = "Tu es Arnaud, fondateur de Moodstream.ai en Belgique. Ecris un email de prospection personnel et humain a " + name + ", un(e) " + type + ".\n\nContexte Moodstream.ai :\n- Solution belge de diffusion musicale intelligente pour commerces et etablissements\n- La musique s adapte automatiquement aux moments de la journee (matin energique, midi convivial, soir plus feutre)\n- Musiques 100% libres de droits : zero redevances UNISONO\n- Essai gratuit 14 jours sans engagement\n- Site web : https://www.moodstreamai.com\n\nRegles STRICTES :\n- Ecris comme si tu l avais tape a la main, naturellement, sans template commercial\n- Commence directement par Bonjour, sans Madame/Monsieur\n- Presente-toi : je m appelle Arnaud, je developpe Moodstream.ai\n- Fais une observation pertinente sur ce type d etablissement et la musique\n- Explique ce que fait Moodstream.ai en 2 phrases simples\n- Mentionne l avantage UNISONO (supprimer les redevances) comme argument cle\n- Inclus le lien https://www.moodstreamai.com pour en savoir plus\n- Propose l essai gratuit 14 jours\n- Termine UNIQUEMENT par Cordialement, sans coordonnees ni signature (deja dans l email)\n- Maximum 180 mots\n- Ton : chaleureux, direct, humain, jamais commercial ni pompeux\n\nReponds UNIQUEMENT en JSON valide sans markdown :\n{\"objet\":\"objet court et accrocheur personnalise\",\"corps\":\"corps complet de l email\"}";

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
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
