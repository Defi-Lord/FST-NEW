// src/pages_ContactUs.tsx
type Props = { onBack?: () => void }

export default function ContactUs({ onBack }: Props) {
  const links = [
    { label: 'Email',    href: 'mailto:support@fantasysporttoken.com', key: 'email' },
    { label: 'Twitter',  href: 'https://twitter.com/YourHandle', key: 'twitter' },
    { label: 'Telegram', href: 'https://t.me/YourHandle', key: 'telegram' },
    { label: 'Discord',  href: 'https://discord.gg/YourInvite', key: 'discord' },
  ]
  return (
    <div className="screen">
      <style>{`
        .container { max-width: 840px; margin: 0 auto; padding: 14px; }
        .top { display:flex; align-items:center; gap:8px; margin-bottom: 6px; }
        .back { appearance:none; border:0; background:transparent; color:#fff; padding:8px 10px; border-radius: 10px; }
        .wrap { display:grid; gap: 14px; }
        .cta {
          display:flex; align-items:center; justify-content:center; gap:10px;
          padding: 14px; border-radius: 16px; text-decoration:none;
          color:#fff; font-weight:900; letter-spacing:.3px;
          background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
          border: 1px solid rgba(255,255,255,0.16);
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
        }
        .cta:hover {
          transform: translateY(-2px) scale(1.01);
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 14px 30px rgba(99,102,241,0.30), inset 0 0 60px rgba(255,255,255,0.06);
        }
        .cta span.icon {
          width: 22px; height: 22px; display:grid; place-items:center;
          border-radius: 999px; background: radial-gradient(circle at 30% 30%, rgba(99,102,241,0.9), rgba(236,72,153,0.9));
        }
      `}</style>

      <div className="container">
        <div className="top">
          {onBack && <button className="back" onClick={onBack}>←</button>}
          <h2 style={{ margin: 0 }}>Contact Us</h2>
        </div>

        <p style={{ color:'rgba(255,255,255,0.86)' }}>
          Reach the FST team via any of the channels below:
        </p>

        <div className="wrap">
          {links.map((l) => (
            <a key={l.key} className="cta" href={l.href} target="_blank" rel="noreferrer">
              <span className="icon">★</span>
              <span>{l.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
