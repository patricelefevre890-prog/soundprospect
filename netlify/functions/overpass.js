// netlify/functions/overpass.js
// UNE seule requête Overpass via bbox (plus rapide que "around")

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Calcule une bounding box autour d'un point
function toBbox(lat, lon, radius) {
  const R = 6371000;
  const dLat = (radius / R) * (180 / Math.PI);
  const dLon = dLat / Math.cos(lat * Math.PI / 180);
  return {
    minLat: lat - dLat, maxLat: lat + dLat,
    minLon: lon - dLon, maxLon: lon + dLon,
  };
}

// UNE seule requête, tous les tags, bbox au lieu de around
function makeQuery(lat, lon, radius, withEmail) {
  const r = Math.min(parseInt(radius), 2000);
  const { minLat, maxLat, minLon, maxLon } = toBbox(lat, lon, r);
  const bb = minLat + ',' + minLon + ',' + maxLat + ',' + maxLon;
  const ef = withEmail ? '["email"]' : '';
  return (
    '[out:json][timeout:8][bbox:' + bb + '];' +
    '(' +
    'node["amenity"]["name"]' + ef + ';' +
    'way["amenity"]["name"]' + ef + ';' +
    'node["shop"]["name"]' + ef + ';' +
    'way["shop"]["name"]' + ef + ';' +
    'node["leisure"]["name"]' + ef + ';' +
    'way["leisure"]["name"]' + ef + ';' +
    ');' +
    'out center tags qt 800;'
  );
}

async function fetchOverpass(query) {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log('[overpass] cache hit, elements:', cached.data.length);
    return cached.data;
  }

  for (let i = 0; i < SERVERS.length; i++) {
    const server = SERVERS[i];
    try {
      console.log('[overpass] trying', server);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7500);

      const resp = await fetch(server, {
        method: 'POST',
        headers: { 'User-Agent': 'MoodstreamAI/1.0' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);

      console.log('[overpass] status', resp.status, 'from', server);

      if (resp.status === 429) {
        if (i < SERVERS.length - 1) { await sleep(500); continue; }
        return [];
      }
      if (!resp.ok) { continue; }

      const text = await resp.text();
      if (!text.trim().startsWith('{')) {
        console.log('[overpass] non-JSON:', text.substring(0, 80));
        continue;
      }

      const elements = JSON.parse(text).elements || [];
      console.log('[overpass] got', elements.length, 'elements');
      cache.set(query, { ts: Date.now(), data: elements });
      return elements;

    } catch (e) {
      console.log('[overpass] error:', e.message);
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

    console.log('[overpass] request lat=' + lat + ' lon=' + lon + ' radius=' + radius + ' withEmail=' + withEmail);

    const elements = await fetchOverpass(makeQuery(lat, lon, radius, withEmail));
    console.log('[overpass] returning', elements.length, 'elements');

    return { statusCode: 200, headers, body: JSON.stringify({ elements }) };

  } catch (e) {
    console.error('[overpass] handler error:', e.message);
    return { statusCode: 503, headers, body: JSON.stringify({ error: e.message }) };
  }
};
