// apps/api/src/fpl-relay.ts
import type { Express, Request, Response } from "express";

const ORIGIN = "https://fantasy.premierleague.com";

// small helper to proxy + return JSON
async function relayJson(_req: Request, res: Response, path: string) {
  const url = `${ORIGIN}${path}`;
  try {
    const r = await fetch(url, {
      headers: {
        "accept": "application/json, text/plain, */*",
        // keep a normal UA; FPL accepts without this too
        "user-agent": "Mozilla/5.0",
      },
      // 15s timeout (Node 18/20+: AbortSignal.timeout)
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(15000) : undefined,
    } as any);

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return res.status(r.status).json({
        error: "upstream_failed",
        status: r.status,
        body: body.slice(0, 500),
      });
    }

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(502).json({ error: "relay_error", message: String(e?.message || e) });
  }
}

export function registerFplRelay(app: Express) {
  // Mirror endpoints that your frontend calls
  app.get("/fpl/api/bootstrap-static/", (req, res) =>
    relayJson(req, res, "/api/bootstrap-static/")
  );

  app.get("/fpl/api/fixtures/", (req, res) =>
    relayJson(req, res, "/api/fixtures/")
  );

  app.get("/fpl/api/element-summary/:id/", (req, res) =>
    relayJson(req, res, `/api/element-summary/${req.params.id}/`)
  );
}
