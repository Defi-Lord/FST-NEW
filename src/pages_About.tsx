// src/pages_AboutUs.tsx
type Props = { onBack?: () => void }

export default function AboutUs({ onBack }: Props) {
  return (
    <div className="screen">
      <style>{`
        .container { max-width: 900px; margin: 0 auto; padding: 14px; }
        .card {
          background: linear-gradient(135deg, rgba(99,102,241,0.22), rgba(236,72,153,0.22));
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 16px; padding: 16px; backdrop-filter: blur(6px);
        }
        h1 { font-size: clamp(22px, 5vw, 36px); margin: 8px 0; }
        p { color: rgba(255,255,255,0.86); font-size: clamp(13px, 3.2vw, 16px); }
        .grid { display: grid; gap: 12px; margin-top: 10px; }
        .tile { padding: 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12);
                background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); }
        .top { display:flex; align-items:center; gap:8px; margin-bottom: 8px; }
        .back { appearance:none; border:0; background:transparent; color:#fff; padding:8px 10px; border-radius: 10px; }
      `}</style>

      <div className="container">
        <div className="top">
          {onBack && <button className="back" onClick={onBack}>←</button>}
          <h2 style={{ margin: 0 }}>About Us</h2>
        </div>

        <div className="card">
          <h1>Fantasy Sport Token (FST)</h1>
          <p>
            FST powers a new era of fantasy football where strategy meets ownership.
            Build squads, compete in weekly and seasonal contests, and earn rewards —
            all inside a sleek, mobile-first experience.
          </p>

          <div className="grid">
            <div className="tile">
              <h3 style={{ margin: 0 }}>Fair • Fun • Rewarding</h3>
              <p>Transparent rules, smart scoring, and meaningful rewards for top managers.</p>
            </div>
            <div className="tile">
              <h3 style={{ margin: 0 }}>Built for Mobile</h3>
              <p>Zero sideways scrolling, fast interactions, and gorgeous UI on every device.</p>
            </div>
            <div className="tile">
              <h3 style={{ margin: 0 }}>Community-Driven</h3>
              <p>Leagues, badges, and events that celebrate football culture and competition.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
