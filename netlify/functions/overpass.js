// netlify/functions/overpass.js
// Proxy Overpass — 3 micro-requêtes séquentielles, chacune < 3s
// Compatible plan Netlify gratuit (timeout 10s)

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Cache mémoire (dure tant que le process Netlify tourne, ~10 min)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Construit une requête ciblée sur UN seul tag, résultats limités
function makeQuery(lat, lon, radius, tag, withEmail) {
  const r = Math.min(parseInt(radius), 2000); // cap 2km par micro-requête
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

async function fetchOne(query) {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  for (const server of SERVERS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const resp = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text.trim().startsWith('{')) continue;
      const elements = JSON.parse(text).elements || [];
      cache.set(query, { ts: Date.now(), data: elements });
      return elements;
    } catch (e) {
      continue;
    }
  }
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
    const { lat, lon, radius, withEmail } = JSON.parse(event.body || '{}');
    if (!lat || !lon || !radius) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing lat/lon/radius' }) };

    // 3 micro-requêtes séquentielles : amenity, shop, leisure
    let allElements = [];
    for (const tag of ['amenity', 'shop', 'leisure']) {
      const els = await fetchOne(makeQuery(lat, lon, radius, tag, withEmail));
      allElements = allElements.concat(els);
    }

    // Dédoublonnage par id OSM
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
    console.error('[overpass] error:', e.message);
    return { statusCode: 503, headers, body: JSON.stringify({ error: e.message }) };
  }
};
