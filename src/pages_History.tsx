// src/pages_History.tsx
import React from "react";

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.replace(/\/+$/, "") || "";

type Item = {
  id: string;
  kind: "join" | "win" | "entry" | "other";
  label: string;
  at: string;
};

export default function HistoryPage({ onBack }: { onBack?: () => void }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // Your current API doesn't expose /history in docs, so we try /me and show
        // minimal info. If you later add /history, swap the endpoint here.
        const token = localStorage.getItem("auth_token");
        const res = await fetch(`${API_BASE}/me`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
        const me = JSON.parse(txt);

        // synthesize a tiny "history" row from available info
        const now = new Date().toISOString();
        const seed: Item[] = [
          {
            id: "me",
            kind: "entry",
            label: `Signed in as ${me.walletAddress || me.walletId || me.userId || "unknown"}`,
            at: now,
          },
        ];
        setItems(seed);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Shell title="History" onBack={onBack}>
      {loading && <p>Loading…</p>}
      {err && (
        <div style={errBox}>
          <strong>Error:</strong> {err}
        </div>
      )}
      {(!loading && !err) && (
        <div style={{ marginTop: 8 }}>
          {items.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No history yet.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {items.map((it) => (
                <li key={it.id} style={histRow}>
                  <span style={pill(it.kind)}>{it.kind}</span>
                  <span style={{ flex: 1, padding: "0 8px" }}>{it.label}</span>
                  <span style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(it.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Shell>
  );
}

/** --- shared mini shell (duplicated with Profile/Admin for isolation) --- */
function Shell({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={logo}>FST</div>
        <h1 style={{ margin: "6px 0 6px" }}>{title}</h1>
        {onBack && (
          <button style={btnMuted} onClick={onBack}>
            ← Back
          </button>
        )}
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
      <div style={bg} />
    </div>
  );
}

/** styles */
const wrap: React.CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  position: "relative",
  overflow: "hidden",
  background: "#0b1020",
};
const bg: React.CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(60% 40% at 20% 10%, rgba(124,58,237,.25), transparent 60%)," +
    "radial-gradient(50% 40% at 80% 20%, rgba(236,72,153,.25), transparent 60%)," +
    "radial-gradient(40% 30% at 40% 80%, rgba(16,185,129,.25), transparent 60%)",
  filter: "blur(80px)",
};
const card: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "min(92vw, 560px)",
  color: "#e7e9ee",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 10px 50px rgba(0,0,0,.35)",
  textAlign: "center",
  backdropFilter: "blur(8px)",
};
const logo: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  margin: "0 auto 12px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #7c3aed, #ec4899)",
  color: "#fff",
  fontWeight: 900,
  letterSpacing: ".5px",
};
const btnMuted: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.25)",
  background: "transparent",
  color: "#e7e9ee",
  cursor: "pointer",
  fontWeight: 700,
};
const histRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  marginTop: 8,
  textAlign: "left",
  background: "rgba(255,255,255,.04)",
};
const pill = (kind: Item["kind"]): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.2)",
  color: "#fff",
  textTransform: "uppercase",
  opacity: 0.9,
  background:
    kind === "win"
      ? "linear-gradient(180deg,#22c55e,#15803d)"
      : kind === "join"
      ? "linear-gradient(180deg,#3b82f6,#1d4ed8)"
      : "linear-gradient(180deg,#64748b,#334155)",
});
const errBox: React.CSSProperties = {
  border: "1px solid rgba(255,0,0,.35)",
  background: "rgba(255,0,0,.08)",
  color: "#ffd5d5",
  borderRadius: 10,
  padding: 10,
  marginTop: 12,
  textAlign: "left",
};
