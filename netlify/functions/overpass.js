// netlify/functions/overpass.js

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

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

      const resp = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);

      console.log('[overpass] tag=' + tag + ' status=' + resp.status + ' server=' + server);

      if (!resp.ok) {
        console.log('[overpass] non-ok, skipping server');
        continue;
      }

      const text = await resp.text();
      console.log('[overpass] tag=' + tag + ' response length=' + text.length + ' starts=' + text.trim().substring(0, 30));

      if (!text.trim().startsWith('{')) {
        console.log('[overpass] non-JSON response, skipping');
        continue;
      }

      const json = JSON.parse(text);
      const elements = json.elements || [];
      console.log('[overpass] tag=' + tag + ' got ' + elements.length + ' elements');

      cache.set(query, { ts: Date.now(), data: elements });
      return elements;

    } catch (e) {
      console.log('[overpass] error tag=' + tag + ' server=' + server + ' err=' + e.message);
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
    console.log('[overpass] received:', JSON.stringify(body));

    const { lat, lon, radius, withEmail } = body;
    if (!lat || !lon || !radius) {
      console.log('[overpass] missing params');
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing lat/lon/radius' }) };
    }

    let allElements = [];
    for (const tag of ['amenity', 'shop', 'leisure']) {
      const q = makeQuery(lat, lon, radius, tag, withEmail);
      console.log('[overpass] query for ' + tag + ':', q.substring(0, 100));
      const els = await fetchOne(q, tag);
      allElements = allElements.concat(els);
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
