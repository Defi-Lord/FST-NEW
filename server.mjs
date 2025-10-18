// server.mjs  (Node 18+ has global fetch)
import http from 'node:http'
import { URL } from 'node:url'

const PORT = 3300
const UPSTREAM = 'https://fantasy.premierleague.com/api/bootstrap-static/'

async function handleBootstrap(_req, res) {
  try {
    const r = await fetch(UPSTREAM, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    const body = await r.text()
    res.writeHead(r.status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    })
    res.end(body)
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('Upstream fetch failed: ' + (e?.message || e))
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  const p = u.pathname
  if (p === '/fpl/bootstrap-static' || p === '/fpl/api/bootstrap-static/') {
    return handleBootstrap(req, res)
  }
  res.writeHead(404); res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`FPL relay running:
  - http://localhost:${PORT}/fpl/bootstrap-static
  - http://localhost:${PORT}/fpl/api/bootstrap-static/`)
})
