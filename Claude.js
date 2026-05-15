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

Effectue des recherches sur Google, le site web de l'établissement, Facebook, Instagram, Pages Jaunes, TripAdvisor.
Cherche "email contact ${p.name}", "${p.name} ${p.city} contact", page Facebook, etc.

Une fois les recherches effectuées, retourne UNIQUEMENT du JSON valide sans markdown ni texte autour :
{"email":"adresse@email.be","source":"site web / Facebook / Google / Pages Jaunes","website":"https://...","phone":"+32...","confidence":"haute / moyenne / faible"}
Si aucun email trouvé, mets null pour email.`;

      // Agentic loop - handle multiple tool use turns
      let messages = [{ role: 'user', content: searchPrompt }];
      let finalResult = { email: null, source: null };
      let maxTurns = 5;

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

        // Add assistant response to messages
        messages.push({ role: 'assistant', content: result.content });

        // Check stop reason
        if (result.stop_reason === 'end_turn') {
          // Extract final text block
          const textBlock = result.content.find(b => b.type === 'text');
          if (textBlock) {
            const clean = textBlock.text.replace(/```json|```/g, '').trim();
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try { finalResult = JSON.parse(jsonMatch[0]); } catch(e) {}
            }
          }
          break;
        }

        // If tool_use, process tool results and continue
        if (result.stop_reason === 'tool_use') {
          const toolUseBlocks = result.content.filter(b => b.type === 'tool_use');
          const toolResults = toolUseBlocks.map(block => ({
            type: 'tool_result',
            tool_use_id: block.id,
            content: block.type === 'tool_use' ? (block.content || '') : ''
          }));
          messages.push({ role: 'user', content: toolResults });
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
      const prompt = `Tu es un expert en développement commercial pour Moodstream.ai, solution de diffusion musicale B2B.

Analyse ces prospects et attribue un score de 0 à 100 basé sur :
- Surface (plus c'est grand = mieux, max 40 pts)
- Secteur (horeca et commerces = priorité, max 35 pts)
- Probabilité de diffusion musicale (max 25 pts)

Prospects :
${JSON.stringify(data.prospects)}

Réponds UNIQUEMENT en JSON valide :
{"scores":[{"id":"id","score":85,"score_surface":30,"score_secteur":35,"score_musique":20,"type_precise":"Restaurant gastronomique","surface_estimee":"150 m²","potentiel":"Élevé","raison":"courte explication"}]}`;

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
      const prompt = `Tu es un expert en développement commercial pour Moodstream.ai, solution de diffusion musicale B2B.

Pour chaque établissement, analyse et enrichis les données.

Établissements :
${JSON.stringify(data.prospects)}

Réponds UNIQUEMENT en JSON valide :
{"prospects":[{"id":"id","nom":"Nom","type_precise":"Type précis","secteur":"horeca|commerce|bienetre|sante|hotel|parking|sport|autre","surface_estimee":"~80 m²","score":78,"potentiel_musical":"Élevé|Moyen|Faible","raison_contact":"Raison courte","accroche":"Accroche personnalisée pour l'email"}]}`;

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
      const prompt = `Tu es expert en développement commercial pour Moodstream.ai, solution de diffusion musicale B2B.

Rédige un email de prospection :
- Chaleureux, jamais intrusif, court (max 150 mots)
- Personnalisé avec le nom/type de l'établissement
- Mentionner l'adaptation automatique aux moments de la journée
- Musiques 100% libres de droits, suppression redevances UNISONO
- Essai gratuit 14 jours sans engagement
- CTA : devis sur moodstreamai.com/demande-de-devis

Établissement : ${p.name || p.typePrecise || 'Établissement'}
Type : ${p.typePrecise || p.type || ''}
Surface : ${p.surfaceEstimee || 'non connue'}
Accroche : ${p.accroche || ''}

Modèle :
"OBJET: [Nom] mérite une ambiance à son image
Bonjour,
Dans [type établissement], l'ambiance sonore compte autant que [élément clé]. Moodstream.ai propose une programmation musicale qui s'adapte automatiquement à vos moments de la journée.
Le tout avec des musiques 100% libres de droits, pour supprimer les redevances UNISONO.
Essayez gratuitement 14 jours — sans engagement.
Devis sur moodstreamai.com/demande-de-devis ou répondez à cet email."

Réponds UNIQUEMENT en JSON : {"objet":"sujet","corps":"corps complet"}`;

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
