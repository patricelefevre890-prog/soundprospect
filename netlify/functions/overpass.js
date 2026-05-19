// netlify/functions/overpass.js
// Proxy Overpass API — évite les timeouts/rate-limits côté navigateur
// Déposer dans : netlify/functions/overpass.js

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Cache mémoire simple (durée de vie du process Netlify, ~10 min)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function queryOverpass(query) {
  // Vérifier le cache
  const cacheKey = query;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log('[overpass] cache hit');
    return cached.data;
  }

  let lastError;
  for (const server of SERVERS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`[overpass] trying ${server} (attempt ${attempt + 1})`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000); // 55s max

        const resp = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (resp.status === 429) {
          // Rate limited — attendre 2s avant de réessayer sur ce serveur
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        if (resp.status === 504 || resp.status === 502) {
          // Gateway timeout — passer au serveur suivant directement
          break;
        }
        if (!resp.ok) {
          lastError = new Error(`HTTP ${resp.status} from ${server}`);
          break;
        }

        const text = await resp.text();
        // Vérifier que c'est bien du JSON (pas une page d'erreur HTML)
        if (!text.trim().startsWith('{')) {
          lastError = new Error(`Non-JSON response from ${server}`);
          break;
        }

        const json = JSON.parse(text);
        const elements = json.elements || [];

        // Mettre en cache
        cache.set(cacheKey, { ts: Date.now(), data: elements });
        console.log(`[overpass] success: ${elements.length} elements`);
        return elements;

      } catch (e) {
        lastError = e;
        if (e.name === 'AbortError') {
          console.log(`[overpass] timeout on ${server}`);
          break; // passer au serveur suivant
        }
        console.log(`[overpass] error on ${server}: ${e.message}`);
      }
    }
  }

  throw lastError || new Error('All Overpass servers failed');
}

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { query } = JSON.parse(event.body || '{}');
    if (!query) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing query' }) };
    }

    const elements = await queryOverpass(query);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ elements }),
    };
  } catch (e) {
    console.error('[overpass] handler error:', e.message);
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
