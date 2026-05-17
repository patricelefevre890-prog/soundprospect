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

    // ── FIND EMAIL: fetch website + Claude extract ─────────────────────────
    if (action === 'find_email') {
      const p = data.prospect;
      const name = p.name || '';
      const city = p.city || 'Belgique';
      const type = p.typePrecise || p.type || '';
      const address = p.address || '';

      let scrapedText = '';
      let websiteFound = p.website || null;

      // Step 1: Try to fetch website if available
      if (websiteFound) {
        try {
          const siteResp = await fetch(websiteFound.startsWith('http') ? websiteFound : 'https://' + websiteFound, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
          });
          const html = await siteResp.text();
          // Extract text and emails from HTML
          const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 3000);
          scrapedText = stripped;
        } catch(e) {}
      }

      // Step 2: Ask Claude Haiku to extract email from scraped content OR generate search links
      const prompt = `Tu es un expert en recherche d'informations de contact pour des établissements commerciaux.

Établissement :
- Nom : ${name}
- Type : ${type}
- Adresse : ${address}, ${city}
- Site web : ${websiteFound || 'inconnu'}
${scrapedText ? `\nContenu du site web (extrait) :\n${scrapedText.substring(0, 2000)}` : ''}

Analyse ces informations et extrait ou déduit :
1. L'adresse email de contact (cherche dans le contenu du site web si disponible)
2. Le numéro de téléphone
3. Le site web (si pas déjà connu)

Réponds UNIQUEMENT en JSON valide :
{"email":"adresse@domaine.be","phone":"+32...","website":"https://...","confidence":"haute|moyenne|faible","source":"site web|deduction|inconnu"}

Si tu ne trouves pas d'email, mets null. Ne mets JAMAIS un email fictif ou inventé.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      if (result.error) {
        return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };
      }

      const text = result.content[0].text.replace(/```json|```/g, '').trim();

      // Extract JSON
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      let parsed = { email: null, phone: null, website: websiteFound, confidence: 'faible', source: 'inconnu' };
      if (jsonMatch) {
        try { parsed = { ...parsed, ...JSON.parse(jsonMatch[0]) }; } catch(e) {}
      }

      // Fallback: regex email extraction from scraped text
      if (!parsed.email && scrapedText) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = scrapedText.match(emailRegex);
        if (emails) {
          const valid = emails.filter(e =>
            !e.includes('anthropic') && !e.includes('example') &&
            !e.includes('sentry') && !e.includes('placeholder') &&
            !e.endsWith('.png') && !e.endsWith('.jpg')
          );
          if (valid.length > 0) {
            parsed.email = valid[0];
            parsed.source = 'site web (scraping)';
            parsed.confidence = 'haute';
          }
        }
      }

      // Generate search URLs for manual lookup
      const encodedName = encodeURIComponent(`${name} ${city} email contact`);
      const fbSearch = encodeURIComponent(`${name} ${city}`);
      parsed.search_urls = {
        google: `https://www.google.com/search?q=${encodedName}`,
        facebook: `https://www.facebook.com/search/top?q=${fbSearch}`,
        pages_jaunes: `https://www.pagesjaunes.be/fr/search?search_word=${encodeURIComponent(name)}&where=${encodeURIComponent(city)}`
      };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      };
    }

    // ── SCORE ──────────────────────────────────────────────────────────────
    if (action === 'score') {
      const prompt = `Expert Moodstream.ai. Score 0-100 ces prospects.
Prospects : ${JSON.stringify(data.prospects)}
JSON UNIQUEMENT : {"scores":[{"id":"id","score":85,"score_surface":30,"score_secteur":35,"score_musique":20,"type_precise":"Restaurant","surface_estimee":"150m²","potentiel":"Élevé","raison":"explication"}]}`;

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

    // ── ENRICH ─────────────────────────────────────────────────────────────
    if (action === 'enrich') {
      const prompt = `Expert Moodstream.ai. Enrichis ces établissements.
${JSON.stringify(data.prospects)}
JSON UNIQUEMENT : {"prospects":[{"id":"id","nom":"Nom","type_precise":"Type","secteur":"horeca|commerce|bienetre|sante|hotel|parking|sport|autre","surface_estimee":"~80m²","score":78,"potentiel_musical":"Élevé|Moyen|Faible","raison_contact":"Raison","accroche":"Accroche email"}]}`;

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

    // ── EMAIL ──────────────────────────────────────────────────────────────
    if (action === 'email') {
      const p = data.prospect;
      const prompt = `Email prospection Moodstream.ai (diffusion musicale B2B) :
- Chaleureux, court max 150 mots, personnalisé
- Adaptation automatique aux moments de la journée
- Musiques libres de droits, suppression UNISONO
- Essai 14 jours gratuit sans engagement
- CTA : moodstreamai.com/demande-de-devis

Établissement: ${p.name || p.typePrecise || 'Établissement'}
Type: ${p.typePrecise || p.type || ''}
Accroche: ${p.accroche || ''}

JSON UNIQUEMENT : {"objet":"sujet","corps":"corps email complet"}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
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
