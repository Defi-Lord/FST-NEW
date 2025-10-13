// src/pages_HowToPlay.tsx
type Props = { onBack?: () => void }

export default function HowToPlay({ onBack }: Props) {
  return (
    <div className="screen">
      <style>{`
        .container { max-width: 980px; margin: 0 auto; padding: 14px; }
        .glass {
          background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 16px; backdrop-filter: blur(8px);
        }
        .hero { padding: 18px; margin: 8px 0 14px; }
        .hero h1 { margin: 0; font-size: clamp(20px, 4.5vw, 36px); }
        .hero p { margin: 6px 0 0; color: rgba(255,255,255,0.8); }
        .steps { display: grid; gap: 12px; }
        .step { display: grid; gap: 6px; padding: 12px; }
        .step h3 { margin: 0; font-size: clamp(16px, 3.6vw, 22px); }
        .step p { margin: 0; color: rgba(255,255,255,0.85); font-size: clamp(13px, 3.2vw, 15px); }
        .faq { margin: 12px 0 0; padding: 12px; }
        .top { display:flex; align-items:center; gap:8px; margin-bottom: 4px; }
        .back { appearance:none; border:0; background:transparent; color:#fff; padding:8px 10px; border-radius: 10px; }
      `}</style>

      <div className="container">
        <div className="top">
          {onBack && <button className="back" onClick={onBack}>←</button>}
          <h2 style={{ margin: 0 }}>How to Play</h2>
        </div>

        <div className="glass hero">
          <h1>Build. Compete. Earn.</h1>
          <p>Pick your squad, outsmart the league, and climb the FST leaderboard.</p>
        </div>

        <div className="steps">
          {[
            { t: '1) Create your team', d: 'Pick 15 players within the budget. Respect position & club limits to build a balanced squad.' },
            { t: '2) Set your XI & formation', d: 'Choose a formation (e.g., 4-4-2) and your starters. Bench the rest — you can swap before the deadline.' },
            { t: '3) Score points', d: 'Players earn points for goals, assists, clean sheets and more. Poor performances can deduct!' },
            { t: '4) Climb leaderboards', d: 'Compete weekly and season-long, and flex your football IQ.' },
            { t: '5) Earn with FST', d: 'Top performers and special contests can earn rewards in Fantasy Sport Token (FST).' },
          ].map((s) => (
            <div key={s.t} className="glass step">
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>

        <div className="glass faq">
          <h3 style={{ marginTop: 0 }}>Tips & Tricks</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Check recent form and fixtures before locking your XI.</li>
            <li>Balance premium stars with budget enablers.</li>
            <li>Rotate defenders for clean-sheet potential.</li>
            <li>Mind the deadline — save your changes!</li>
          </ul>
        </div>
      </div>
    </div>
  )
}