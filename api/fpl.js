export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  const upstream = 'https://fantasy.premierleague.com/api/bootstrap-static/';
  try {
    const r = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}
