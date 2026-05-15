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
      const searchPrompt = `Trouve l'adresse email de contact de cet établissement commercial :
Nom : ${p.name || 'Inconnu'}
Type : ${p.typePrecise || p.type || ''}
Adresse : ${p.address || ''}, ${p.city || 'Belgique'}
Site web connu : ${p.website || 'Non disponible'}

Effectue des recherches sur Google, le site web de l'établissement, Facebook, Instagram, Pages Jaunes.
Cherche "email contact ${p.name}", "${p.name} ${p.city} contact", page Facebook, etc.

Retourne un objet JSON avec ces champs : email (string ou null), source (string), website (string ou null), phone (string ou null), confidence (haute/moyenne/faible).`;

      let messages = [{ role: 'user', content: searchPrompt }];
      let finalResult = { email: null, source: null, website: null, phone: null, confidence: 'faible' };
      let maxTurns = 6;

      while (maxTurns > 0) {
        maxTurns--;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages
          })
        });

        const result = await response.json();

        if (result.error) {
          return { statusCode: 400, body: JSON.stringify({ error: result.error.message }) };
        }

        messages.push({ role: 'assistant', content: result.content });

        if (result.stop_reason === 'end_turn') {
          // Extract text and parse JSON from it
          const textBlocks = result.content.filter(b => b.type === 'text');
          for (const block of textBlocks) {
            const text = block.text || '';
            // Try to extract JSON object
            const jsonMatch = text.match(/\{[^{}]*"email"[^{}]*\}/s) || text.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed && typeof parsed === 'object') {
                  finalResult = {
                    email: parsed.email || null,
                    source: parsed.source || null,
                    website: parsed.website || null,
                    phone: parsed.phone || null,
                    confidence: parsed.confidence || 'moyenne'
                  };
                  break;
                }
              } catch(e) {
                // Try to extract email directly from text
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch) {
                  finalResult.email = emailMatch[0];
                  finalResult.source = 'recherche web';
                  finalResult.confidence = 'moyenne';
                }
              }
            } else {
              // No JSON, try direct email extraction from text
              const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (emailMatch) {
                finalResult.email = emailMatch[0];
                finalResult.source = 'recherche web';
                finalResult.confidence = 'moyenne';
              }
            }
          }
          break;
        }

        if (result.stop_reason === 'tool_use') {
          const toolUseBlocks = result.content.filter(b => b.type === 'tool_use');
          const toolResults = toolUseBlocks.map(block => ({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '')
          }));
          if (toolResults.length > 0) {
            messages.push({ role: 'user', content: toolResults });
          } else {
            break;
          }
        } else {
          break;
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalResult)
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
- Mentionner adaptation automatique aux moments de la journée
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
