// src/pages_Admin.tsx
import React from "react";

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.replace(/\/+$/, "") || "";

type Health = {
  ok: boolean;
  name?: string;
  message?: string;
  [k: string]: any;
};

export default function AdminPage({ onBack }: { onBack?: () => void }) {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const ping = React.useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`${API_BASE}/public/healthz`, {
        credentials: "include",
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      setHealth(JSON.parse(txt));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    ping();
  }, [ping]);

  return (
    <Shell title="Admin" onBack={onBack}>
      <div style={{ textAlign: "left" }}>
        <Row label="API Base" value={<code>{API_BASE || "(missing VITE_API_BASE)"}</code>} />
      </div>

      <div style={{ marginTop: 12 }}>
        <button style={btnPrimary} onClick={ping} disabled={loading}>
          {loading ? "Checking…" : "Check Health"}
        </button>
      </div>

      {err && (
        <div style={errBox}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {health && (
        <div style={{ marginTop: 12, textAlign: "left" }}>
          <Row label="Status" value={String(health.ok)} />
          {health.name && <Row label="Name" value={health.name} />}
          {health.message && <Row label="Message" value={health.message} />}
        </div>
      )}

      <div style={{ marginTop: 16, opacity: 0.8, fontSize: 12 }}>
        For admin actions (create/toggle contests, list users, etc.), wire endpoints here once your API exposes them.
      </div>
    </Shell>
  );
}

/** Shared shell + styles (same style family as other pages) */
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={row}>
      <div style={rowLabel}>{label}</div>
      <div style={rowVal}>{value}</div>
    </div>
  );
}

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
const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 8,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  marginTop: 8,
  background: "rgba(255,255,255,.04)",
};
const rowLabel: React.CSSProperties = { opacity: 0.75 };
const rowVal: React.CSSProperties = { wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };
const btnMuted: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.25)",
  background: "transparent",
  color: "#e7e9ee",
  cursor: "pointer",
  fontWeight: 700,
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #6b46c1",
  background: "linear-gradient(180deg,#7c3aed,#5b21b6)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 6px 20px rgba(124,58,237,.35)",
};
const errBox: React.CSSProperties = {
  border: "1px solid rgba(255,0,0,.35)",
  background: "rgba(255,0,0,.08)",
  color: "#ffd5d5",
  borderRadius: 10,
  padding: 10,
  marginTop: 12,
  textAlign: "left",
};
