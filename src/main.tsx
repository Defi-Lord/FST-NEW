// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  Link,
} from "react-router-dom";

// ⬇️ Use the new, gorgeous sign-in page we built
import SolanaSignIn from "./pages/SolanaSignIn";

import ProfilePage from "./pages_Profile";
import HistoryPage from "./pages_History";
import AdminPage from "./pages_Admin";

/** Read token from either the new or old key */
function getAuthToken(): string | null {
  return (
    window.localStorage.getItem("authToken") ||
    window.localStorage.getItem("auth_token")
  );
}

function useAuth() {
  const [authed, setAuthed] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    setAuthed(!!getAuthToken());
  }, []);
  return authed;
}

/** Landing now shows the polished Solana sign-in page */
function Landing() {
  const nav = useNavigate();
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={logo}>FST</div>
        <h1 style={{ margin: "6px 0 6px" }}>Welcome</h1>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          Sign in securely with your Phantom wallet to continue.
        </p>

        <div style={{ marginTop: 8 }}>
          <SolanaSignIn onSignedIn={() => nav("/home", { replace: true })} />
        </div>
      </div>
      <div style={bg} />
    </div>
  );
}

function Home() {
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={logo}>FST</div>
        <h1 style={{ margin: "6px 0 6px" }}>Home</h1>
        <p style={{ opacity: 0.8, margin: "0 0 12px" }}>Where to?</p>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link to="/profile" style={btnMuted}>
            Profile
          </Link>
          <Link to="/history" style={btnMuted}>
            History
          </Link>
          <Link to="/admin" style={btnMuted}>
            Admin
          </Link>
        </div>
      </div>
      <div style={bg} />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const authed = useAuth();
  if (authed === null) return null; // initial load
  return authed ? <>{children}</> : <Navigate to="/" replace />;
}

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <HistoryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

/** styles — kept your clean glass look */
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
  background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
  color: "#fff",
  fontWeight: 900,
  letterSpacing: ".5px",
};
const btnMuted: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.25)",
  background: "transparent",
  color: "#e7e9ee",
  textDecoration: "none",
  fontWeight: 700,
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
