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

    // ── FIND EMAIL via Claude Sonnet + Web Search ──────────────────────────
    if (action === 'find_email') {
      const p = data.prospect;

      const searchPrompt = `Search for the contact email address of this business:
Name: ${p.name || 'Unknown'}
Type: ${p.typePrecise || p.type || ''}
Address: ${p.address || ''}, ${p.city || 'Belgium'}
Known website: ${p.website || 'Not available'}

Search Google, the business website, Facebook, Instagram, Yellow Pages, TripAdvisor.
Look for their contact email, phone number, and website.

After searching, respond with ONLY a JSON object (no markdown, no explanation):
{"email":"address@email.be","source":"website/Facebook/Google","website":"https://...","phone":"+32...","confidence":"high/medium/low"}
Use null for fields not found.`;

      // Use streaming=false, betas for web search
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: searchPrompt }]
        })
      });

      const result = await response.json();

      if (result.error) {
        return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };
      }

      // Extract all text from response content blocks
      let allText = '';
      let foundEmail = null;
      let foundPhone = null;
      let foundWebsite = null;
      let foundSource = null;
      let foundConfidence = 'medium';

      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === 'text') {
            allText += block.text + '\n';
          }
          // web_search_result blocks contain the actual search results
          if (block.type === 'web_search_tool_result' || block.type === 'tool_result') {
            const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            allText += content + '\n';
          }
        }
      }

      // Try to parse JSON from the text
      const jsonMatch = allText.match(/\{\s*"email"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          foundEmail = parsed.email || null;
          foundPhone = parsed.phone || null;
          foundWebsite = parsed.website || null;
          foundSource = parsed.source || null;
          foundConfidence = parsed.confidence || 'medium';
        } catch(e) {}
      }

      // Fallback: extract email with regex from all text
      if (!foundEmail) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = allText.match(emailRegex);
        if (emails) {
          // Filter out anthropic/system emails
          const validEmails = emails.filter(e =>
            !e.includes('anthropic') &&
            !e.includes('example') &&
            !e.includes('test@') &&
            !e.includes('@email.be') // placeholder
          );
          if (validEmails.length > 0) {
            foundEmail = validEmails[0];
            foundSource = 'recherche web';
            foundConfidence = 'medium';
          }
        }
      }

      // Extract phone if not found
      if (!foundPhone) {
        const phoneRegex = /(\+32|0032|04|02|03|04|09|010|011|012|013|014|015|016|017|018|019)[\s.\-]?[0-9]{2,3}[\s.\-]?[0-9]{2,3}[\s.\-]?[0-9]{2,3}/g;
        const phones = allText.match(phoneRegex);
        if (phones && phones.length > 0) {
          foundPhone = phones[0];
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: foundEmail,
          phone: foundPhone,
          website: foundWebsite,
          source: foundSource,
          confidence: foundConfidence
        })
      };
    }

    // ── SCORE prospects via Claude Haiku ───────────────────────────────────
    if (action === 'score') {
      const prompt = `Tu es un expert en développement commercial pour Moodstream.ai.
Analyse ces prospects et attribue un score de 0 à 100.
Prospects : ${JSON.stringify(data.prospects)}
Réponds UNIQUEMENT en JSON : {"scores":[{"id":"id","score":85,"score_surface":30,"score_secteur":35,"score_musique":20,"type_precise":"Restaurant gastronomique","surface_estimee":"150 m²","potentiel":"Élevé","raison":"explication courte"}]}`;

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

    // ── ENRICH prospects via Claude Haiku ──────────────────────────────────
    if (action === 'enrich') {
      const prompt = `Tu es un expert en développement commercial pour Moodstream.ai.
Enrichis ces établissements : ${JSON.stringify(data.prospects)}
Réponds UNIQUEMENT en JSON : {"prospects":[{"id":"id","nom":"Nom","type_precise":"Type précis","secteur":"horeca|commerce|bienetre|sante|hotel|parking|sport|autre","surface_estimee":"~80 m²","score":78,"potentiel_musical":"Élevé|Moyen|Faible","raison_contact":"Raison courte","accroche":"Accroche email personnalisée"}]}`;

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

    // ── GENERATE EMAIL via Claude Haiku ────────────────────────────────────
    if (action === 'email') {
      const p = data.prospect;
      const prompt = `Rédige un email de prospection pour Moodstream.ai (diffusion musicale B2B) :
- Chaleureux, court (max 150 mots), personnalisé
- Adaptation automatique aux moments de la journée
- Musiques 100% libres de droits, suppression redevances UNISONO
- Essai gratuit 14 jours sans engagement
- CTA : moodstreamai.com/demande-de-devis

Établissement : ${p.name || p.typePrecise || 'Établissement'}
Type : ${p.typePrecise || p.type || ''}
Surface : ${p.surfaceEstimee || 'non connue'}
Accroche : ${p.accroche || ''}

Réponds UNIQUEMENT en JSON : {"objet":"sujet","corps":"corps complet de l'email"}`;

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
