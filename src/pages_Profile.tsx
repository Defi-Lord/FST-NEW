// src/pages_Profile.tsx
import React from "react";

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.replace(/\/+$/, "") || "";

type Me = {
  userId?: string;
  walletId?: string;
  walletAddress?: string;
  createdAt?: string;
  [k: string]: any;
};

export default function ProfilePage({ onBack }: { onBack?: () => void }) {
  const [me, setMe] = React.useState<Me | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("auth_token")
            : null;
        const res = await fetch(`${API_BASE}/me`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
        setMe(JSON.parse(txt));
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signOut = React.useCallback(() => {
    try {
      localStorage.removeItem("auth_token");
    } catch {}
    // If your API has /auth/signout that clears cookie, call it too (optional).
    try {
      window.location.assign("/");
    } catch {}
  }, []);

  return (
    <Shell title="Profile" onBack={onBack}>
      {loading && <p>Loading profile…</p>}
      {err && (
        <div style={errBox}>
          <strong>Error:</strong> {err}
        </div>
      )}
      {me && (
        <div style={{ textAlign: "left", marginTop: 8 }}>
          <Row label="User ID" value={me.userId || "—"} />
          <Row label="Wallet ID" value={me.walletId || "—"} />
          <Row label="Wallet Address" value={me.walletAddress || "—"} />
          {me.createdAt && <Row label="Joined" value={new Date(me.createdAt).toLocaleString()} />}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button style={btnMuted} onClick={() => (window.location.href = "/home")}>
          Home
        </button>
        <button style={btnPrimary} onClick={signOut}>Sign Out</button>
      </div>
    </Shell>
  );
}

/** UI bits reused across pages */
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
const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 8,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  marginTop: 8,
};
const rowLabel: React.CSSProperties = { opacity: 0.75 };
const rowVal: React.CSSProperties = { wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };
const errBox: React.CSSProperties = {
  border: "1px solid rgba(255,0,0,.35)",
  background: "rgba(255,0,0,.08)",
  color: "#ffd5d5",
  borderRadius: 10,
  padding: 10,
  marginTop: 12,
  textAlign: "left",
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
