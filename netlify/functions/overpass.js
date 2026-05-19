// netlify/functions/overpass.js

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeQuery(lat, lon, radius, tag, withEmail) {
  const r = Math.min(parseInt(radius), 2000);
  const ef = withEmail ? '["email"]' : '';
  return (
    '[out:json][timeout:8];' +
    '(' +
    'node["' + tag + '"]["name"]' + ef + '(around:' + r + ',' + lat + ',' + lon + ');' +
    'way["' + tag + '"]["name"]' + ef + '(around:' + r + ',' + lat + ',' + lon + ');' +
    ');' +
    'out center tags qt 500;'
  );
}

async function fetchOne(query, tag) {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log('[overpass] cache hit for', tag);
    return cached.data;
  }

  for (const server of SERVERS) {
    try {
      console.log('[overpass] fetching tag=' + tag + ' from ' + server);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);

      // Pas de Content-Type — laisser fetch définir multipart/form-data
      // User-Agent identifie l'app pour Overpass
      const formBody = 'data=' + encodeURIComponent(query);
      const resp = await fetch(server, {
        method: 'POST',
        headers: {
          'User-Agent': 'MoodstreamAI/1.0 (prospection@moodstreamai.com)',
        },
        body: formBody,
        signal: controller.signal,
      });
      clearTimeout(timer);

      console.log('[overpass] tag=' + tag + ' status=' + resp.status);

      if (resp.status === 429) {
        console.log('[overpass] rate limited, waiting 1s...');
        await sleep(1000);
        continue;
      }
      if (!resp.ok) {
        console.log('[overpass] non-ok ' + resp.status + ', trying next server');
        continue;
      }

      const text = await resp.text();
      if (!text.trim().startsWith('{')) {
        console.log('[overpass] non-JSON response: ' + text.substring(0, 100));
        continue;
      }

      const json = JSON.parse(text);
      const elements = json.elements || [];
      console.log('[overpass] tag=' + tag + ' got ' + elements.length + ' elements');

      cache.set(query, { ts: Date.now(), data: elements });
      return elements;

    } catch (e) {
      console.log('[overpass] error tag=' + tag + ': ' + e.message);
      continue;
    }
  }

  console.log('[overpass] all servers failed for tag=' + tag);
  return [];
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { lat, lon, radius, withEmail } = body;
    if (!lat || !lon || !radius) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing lat/lon/radius' }) };

    let allElements = [];
    for (const tag of ['amenity', 'shop', 'leisure']) {
      const q = makeQuery(lat, lon, radius, tag, withEmail);
      const els = await fetchOne(q, tag);
      allElements = allElements.concat(els);
      // Petite pause entre requêtes pour éviter le rate-limit
      await sleep(300);
    }

    const seen = new Set();
    allElements = allElements.filter(el => {
      const k = el.type + el.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    console.log('[overpass] total:', allElements.length);
    return { statusCode: 200, headers, body: JSON.stringify({ elements: allElements }) };

  } catch (e) {
    console.error('[overpass] handler error:', e.message);
    return { statusCode: 503, headers, body: JSON.stringify({ error: e.message }) };
  }
};
