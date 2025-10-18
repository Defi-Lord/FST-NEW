// src/pages_Landing.tsx
import React, { useEffect, useRef, useState } from 'react'

/**
 * Drop your logo video in: public/assets/fst-logo.mp4
 * If yours is named differently, update LOGO_SRC below.
 */
const LOGO_SRC = '/assets/fst-logo.mp4'

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  const vidRef = useRef<HTMLVideoElement | null>(null)
  const [canPlay, setCanPlay] = useState(false)

  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    const tryPlay = async () => {
      try {
        await v.play()
        setCanPlay(true)
      } catch {
        setCanPlay(false)
      }
    }
    tryPlay()
  }, [])

  const handleHeroClick = () => {
    const v = vidRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
  }

  return (
    <div className="screen landing">
      <Style />
      <div className="bg-anim" aria-hidden />
      <div className="grain" aria-hidden />

      <div className="container center hero" onClick={handleHeroClick}>
        <div className="logo-shell" role="img" aria-label="FST 3D Logo">
          <video
            ref={vidRef}
            className={`logo ${canPlay ? 'is-live' : ''}`}
            src={LOGO_SRC}
            playsInline
            muted
            loop
            preload="auto"
          />
          <div className="logo-mask" aria-hidden />
        </div>

        <div className="copy-card">
          <div className="brand">Fantasy Sports Token</div>
          <h1 className="headline">
            Welcome to <span className="accent">Fantasy Sports Token (FST)</span> – the ultimate community for football
            fans who love to play, predict, and win.
          </h1>
          <p className="sub">
            Build your dream squad, enter weekly, monthly, and seasonal contests, and climb dynamic leaderboards.
            Connect your wallet to start — your journey begins now.
          </p>

          <div className="cta-row">
            <button className="cta" onClick={onLaunch}>⚽ Start</button>
            <button className="ghost" onClick={onLaunch} aria-label="Explore without connecting">
              Explore
            </button>
          </div>
        </div>
      </div>

      <div className="bottom-fade" aria-hidden />
    </div>
  )
}

function Style() {
  return (
    <style>{`
      .landing { position: relative; min-height: 100dvh; overflow: hidden; background: #090b10; color: #e8edf2; }
      .container.center.hero { display:grid; place-items:center; padding: 18px; min-height: 100dvh; text-align:center; }

      .bg-anim {
        position:absolute; inset:-20% -20% -10% -20%;
        background:
          radial-gradient(40% 40% at 20% 25%, rgba(99,102,241,0.30) 0%, rgba(99,102,241,0.00) 60%),
          radial-gradient(36% 36% at 80% 30%, rgba(236,72,153,0.28) 0%, rgba(236,72,153,0.00) 60%),
          radial-gradient(45% 45% at 50% 85%, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.00) 60%);
        filter: blur(20px);
        animation: orb 18s ease-in-out infinite alternate;
        z-index: 0;
      }
      @keyframes orb { 0% { transform: translateY(0) scale(1.0); } 100% { transform: translateY(-2%) scale(1.05); } }

      .grain { position:absolute; inset:0; pointer-events:none; opacity:.06; z-index:1;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" opacity="0.6" width="100%" height="100%"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)"/></svg>');
        mix-blend-mode: overlay;
      }

      .logo-shell { position: relative; width: min(56dvw, 460px); aspect-ratio: 1; display:grid; place-items:center; margin: 6dvh auto 18px; z-index: 2; transform: translateZ(0);
        filter: drop-shadow(0 40px 80px rgba(99,102,241,0.35)) drop-shadow(0 18px 40px rgba(236,72,153,0.20));
      }
      .logo { width: 100%; height: 100%; object-fit: contain; mix-blend-mode: screen; filter: brightness(1.15) contrast(1.12) saturate(1.05); opacity: .98; transform: scale(1.02); }
      .logo.is-live { opacity: 1; }

      .logo-mask { position:absolute; inset:0; -webkit-mask-image: radial-gradient(60% 60% at 50% 50%, #000 60%, rgba(0,0,0,0.0) 100%); mask-image: radial-gradient(60% 60% at 50% 50%, #000 60%, rgba(0,0,0,0.0) 100%); pointer-events:none; }

      .copy-card { z-index: 3; width: min(92dvw, 880px); margin: 0 auto; padding: clamp(14px, 4.2dvw, 24px); border-radius: 18px; border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); backdrop-filter: blur(8px); box-shadow: 0 24px 80px rgba(0,0,0,0.35), inset 0 0 80px rgba(255,255,255,0.06); }
      .brand { font-weight: 900; letter-spacing:.3px; opacity:.92; font-size: clamp(13px, 2.6dvw, 16px); margin-bottom: 6px; text-transform: uppercase; }
      .headline { font-weight: 900; font-size: clamp(18px, 4.5dvw, 34px); line-height: 1.12; margin: 0 0 8px 0; }
      .headline .accent { color: #cdb8ff; }
      .sub { margin: 0 auto; max-width: 68ch; color: rgba(232,237,242,0.90); font-size: clamp(12px, 2.8dvw, 16px); }
      .cta-row { display:flex; gap:10px; justify-content:center; margin-top: 14px; flex-wrap: wrap; }
      .cta, .ghost { appearance: none; cursor: pointer; border-radius: 14px; padding: 10px 16px; font-weight: 900; }
      .cta { border: 1px solid rgba(255,255,255,0.22); background: linear-gradient(135deg, rgba(99,102,241,0.85), rgba(236,72,153,0.85)); color:#fff; }
      .ghost { color:#fff; border:1px solid rgba(255,255,255,0.18); background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)); }
      .cta:active, .ghost:active { transform: translateY(1px); }

      .bottom-fade { position:absolute; inset:auto 0 0 0; height: 22dvh; z-index: 0;
        background: linear-gradient(180deg, rgba(9,11,16,0.0), rgba(9,11,16,0.85) 40%, rgba(9,11,16,1)); pointer-events:none; }

      @media (max-width: 480px) { .logo-shell { width: min(70dvw, 360px); margin-top: 10dvh; margin-bottom: 14px; } }
    `}</style>
  )
}