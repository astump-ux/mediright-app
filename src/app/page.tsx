import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MediRight – GOÄ-Analyse & Widerspruch für Privatversicherte',
  description: 'Arztrechnung hochladen, GOÄ-Ziffern prüfen, Kassenbescheid analysieren und Widerspruchsbrief generieren – automatisch in 60 Sekunden.',
}

export default function LandingPage() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
      />
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
    </>
  )
}

const LANDING_CSS = String.raw`
/* ── Reset & Base ─────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:        #0f172a;
      --navy-mid:    #1e293b;
      --navy-light:  #334155;
      --mint:        #10b981;
      --mint-dark:   #059669;
      --mint-light:  #d1fae5;
      --white:       #ffffff;
      --gray-50:     #f8fafc;
      --gray-100:    #f1f5f9;
      --gray-200:    #e2e8f0;
      --gray-400:    #94a3b8;
      --gray-600:    #475569;
      --text:        #0f172a;

      --font-serif:  'DM Serif Display', Georgia, serif;
      --font-sans:   'DM Sans', system-ui, sans-serif;

      --shadow-sm:   0 1px 3px rgba(15,23,42,.07), 0 1px 2px rgba(15,23,42,.05);
      --shadow-md:   0 4px 16px rgba(15,23,42,.10), 0 2px 6px rgba(15,23,42,.06);
      --shadow-lg:   0 20px 40px rgba(15,23,42,.14), 0 4px 12px rgba(15,23,42,.07);
      --shadow-xl:   0 32px 64px rgba(15,23,42,.18);

      --radius-sm:   8px;
      --radius:      14px;
      --radius-lg:   22px;
      --radius-xl:   32px;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-sans);
      color: var(--text);
      background: var(--white);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Utility ──────────────────────────────────────────────── */
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-sans);
      font-weight: 600;
      font-size: 1rem;
      line-height: 1;
      border: none;
      border-radius: 100px;
      cursor: pointer;
      text-decoration: none;
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn:active { transform: translateY(0); }

    .btn-primary {
      background: var(--mint);
      color: var(--white);
      padding: 16px 32px;
      box-shadow: 0 4px 20px rgba(16,185,129,.35);
    }
    .btn-primary:hover {
      background: var(--mint-dark);
      box-shadow: 0 8px 28px rgba(16,185,129,.45);
    }

    .btn-outline {
      background: transparent;
      color: var(--navy);
      border: 1.5px solid var(--gray-200);
      padding: 10px 22px;
      font-size: .9rem;
    }
    .btn-outline:hover {
      border-color: var(--mint);
      color: var(--mint-dark);
    }

    .btn-hero {
      background: var(--mint);
      color: var(--white);
      padding: 20px 40px;
      font-size: 1.08rem;
      border-radius: 100px;
      box-shadow: 0 6px 28px rgba(16,185,129,.4);
    }
    .btn-hero:hover {
      background: var(--mint-dark);
      box-shadow: 0 10px 36px rgba(16,185,129,.5);
    }

    .btn-footer {
      background: var(--mint);
      color: var(--white);
      padding: 20px 44px;
      font-size: 1.1rem;
      border-radius: 100px;
      box-shadow: 0 6px 28px rgba(16,185,129,.38);
    }
    .btn-footer:hover {
      background: var(--mint-dark);
      box-shadow: 0 10px 36px rgba(16,185,129,.5);
    }

    /* ── Animations ───────────────────────────────────────────── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(28px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes pulse-ring {
      0%   { box-shadow: 0 0 0 0 rgba(16,185,129,.4); }
      70%  { box-shadow: 0 0 0 14px rgba(16,185,129,0); }
      100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
    }

    .animate-fade-up   { animation: fadeUp .65s ease both; }
    .delay-1 { animation-delay: .1s; }
    .delay-2 { animation-delay: .22s; }
    .delay-3 { animation-delay: .36s; }
    .delay-4 { animation-delay: .52s; }
    .delay-5 { animation-delay: .68s; }

    /* ── HEADER ───────────────────────────────────────────────── */
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(255,255,255,.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--gray-200);
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 68px;
    }

    .logo {
      font-family: var(--font-serif);
      font-size: 1.55rem;
      font-weight: 400;
      color: var(--navy);
      text-decoration: none;
      letter-spacing: -.01em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mint);
      margin-bottom: 2px;
    }

    /* ── HERO ─────────────────────────────────────────────────── */
    .hero {
      background: var(--navy);
      padding: 96px 0 80px;
      overflow: hidden;
      position: relative;
    }

    /* Subtle mesh gradient overlay */
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 70% 60% at 85% 10%, rgba(16,185,129,.12) 0%, transparent 60%),
        radial-gradient(ellipse 50% 80% at -10% 80%, rgba(99,102,241,.08) 0%, transparent 55%);
      pointer-events: none;
    }

    /* Fine grid texture */
    .hero::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
      background-size: 48px 48px;
      pointer-events: none;
    }

    .hero-inner {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 64px;
      align-items: center;
    }

    .hero-pre {
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: var(--mint);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .hero-pre::before {
      content: '';
      display: block;
      width: 20px;
      height: 2px;
      background: var(--mint);
      border-radius: 2px;
    }

    .hero h1 {
      font-family: var(--font-serif);
      font-size: clamp(2rem, 3.5vw, 2.85rem);
      font-weight: 400;
      line-height: 1.22;
      color: var(--white);
      letter-spacing: -.02em;
      margin-bottom: 22px;
    }
    .hero h1 em {
      font-style: italic;
      color: var(--mint);
    }

    .hero-sub {
      font-size: 1.05rem;
      color: rgba(255,255,255,.72);
      line-height: 1.7;
      max-width: 480px;
    }

    /* Hero Card */
    .hero-card {
      background: var(--white);
      border-radius: var(--radius-xl);
      padding: 44px 40px;
      box-shadow: var(--shadow-xl);
      text-align: center;
    }

    .hero-card-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--mint-light);
      color: var(--mint-dark);
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 100px;
      margin-bottom: 24px;
    }

    .hero-card h3 {
      font-family: var(--font-serif);
      font-size: 1.5rem;
      font-weight: 400;
      color: var(--navy);
      line-height: 1.3;
      margin-bottom: 10px;
    }

    .hero-card p {
      font-size: .93rem;
      color: var(--gray-600);
      margin-bottom: 28px;
    }

    .hero-card .btn-hero {
      width: 100%;
      justify-content: center;
      animation: pulse-ring 2.4s ease-in-out infinite;
    }

    .trust-row {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 22px;
      padding-top: 22px;
      border-top: 1px solid var(--gray-200);
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: .78rem;
      font-weight: 500;
      color: var(--gray-600);
    }

    /* ── PAIN POINTS ──────────────────────────────────────────── */
    .pain-section {
      padding: 100px 0;
      background: var(--white);
    }

    .section-eyebrow {
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: var(--mint-dark);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }
    .section-eyebrow::before {
      content: '';
      display: block;
      width: 20px;
      height: 2px;
      background: var(--mint);
      border-radius: 2px;
    }

    .section-title {
      font-family: var(--font-serif);
      font-size: clamp(1.8rem, 3vw, 2.4rem);
      font-weight: 400;
      color: var(--navy);
      line-height: 1.25;
      letter-spacing: -.02em;
      margin-bottom: 56px;
      max-width: 540px;
    }

    .pain-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    /* Last row: 2 cards centered */
    .pain-card:nth-child(4) { grid-column: 1 / 2; }
    .pain-card:nth-child(5) { grid-column: 2 / 3; }

    .pain-card {
      background: var(--gray-50);
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-lg);
      padding: 36px 32px;
      transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
      position: relative;
      overflow: hidden;
    }
    .pain-card::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 3px;
      background: var(--mint);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform .3s ease;
    }
    .pain-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
      border-color: var(--mint-light);
    }
    .pain-card:hover::after { transform: scaleX(1); }

    .pain-icon {
      width: 52px;
      height: 52px;
      border-radius: var(--radius);
      background: var(--navy);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      color: var(--mint);
      margin-bottom: 22px;
    }

    .pain-card h3 {
      font-family: var(--font-serif);
      font-size: 1.18rem;
      font-weight: 400;
      color: var(--navy);
      margin-bottom: 12px;
      line-height: 1.3;
    }

    .pain-card p {
      font-size: .93rem;
      color: var(--gray-600);
      line-height: 1.7;
    }

    /* ── STEPS ────────────────────────────────────────────────── */
    .steps-section {
      padding: 100px 0;
      background: var(--navy);
      position: relative;
      overflow: hidden;
    }
    .steps-section::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 60% 70% at 100% 50%, rgba(16,185,129,.08) 0%, transparent 55%);
      pointer-events: none;
    }

    .steps-section .section-eyebrow { color: var(--mint); }
    .steps-section .section-eyebrow::before { background: var(--mint); }
    .steps-section .section-title { color: var(--white); margin-bottom: 64px; }

    .steps-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2px;
      position: relative;
    }

    /* Connector line – sits behind circles via z-index layering */
    .steps-connector {
      position: absolute;
      top: 35px; /* vertical center of 72px circle */
      left: calc(12.5% + 2px);  /* right edge of circle 1 */
      right: calc(12.5% + 2px); /* left edge of circle 4 */
      height: 1px;
      background: linear-gradient(90deg,
        rgba(16,185,129,.6),
        rgba(16,185,129,.25) 50%,
        rgba(16,185,129,.6));
      z-index: 0;
    }

    .step-item {
      position: relative;
      z-index: 1; /* above connector line */
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 0 20px 0 0;
    }

    .step-num {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #162a22; /* solid dark bg so line is hidden behind circle */
      border: 1.5px solid rgba(16,185,129,.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-serif);
      font-size: 1.5rem;
      color: var(--mint);
      margin-bottom: 28px;
      position: relative;
      z-index: 1; /* sits above the connector line */
    }
    .step-num::after {
      content: '';
      position: absolute;
      inset: -5px;
      border-radius: 50%;
      border: 1px dashed rgba(16,185,129,.25);
    }

    .step-tag {
      font-size: .73rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--mint);
      margin-bottom: 10px;
    }

    .step-item h3 {
      font-family: var(--font-serif);
      font-size: 1.2rem;
      font-weight: 400;
      color: var(--white);
      line-height: 1.3;
      margin-bottom: 12px;
    }

    .step-item p {
      font-size: .92rem;
      color: rgba(255,255,255,.6);
      line-height: 1.7;
    }

    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 18px;
      font-size: .78rem;
      font-weight: 600;
      color: var(--mint);
      background: rgba(16,185,129,.1);
      border: 1px solid rgba(16,185,129,.25);
      padding: 5px 12px;
      border-radius: 100px;
    }

    /* ── GOÄ URGENCY ──────────────────────────────────────────── */
    .urgency-section {
      padding: 100px 0;
      background: var(--gray-100);
      position: relative;
    }

    .urgency-inner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 80px;
      align-items: center;
    }

    .urgency-visual {
      background: var(--navy);
      border-radius: var(--radius-xl);
      padding: 44px 40px;
      position: relative;
      overflow: hidden;
    }
    .urgency-visual::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 180px; height: 180px;
      border-radius: 50%;
      background: rgba(16,185,129,.08);
    }

    .urgency-stat {
      position: relative;
      z-index: 1;
    }

    .urgency-stat + .urgency-stat {
      margin-top: 28px;
      padding-top: 28px;
      border-top: 1px solid rgba(255,255,255,.08);
    }

    .stat-number {
      font-family: var(--font-serif);
      font-size: 3rem;
      font-style: italic;
      color: var(--mint);
      line-height: 1;
      margin-bottom: 6px;
    }

    .stat-label {
      font-size: .88rem;
      color: rgba(255,255,255,.6);
    }

    .urgency-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16,185,129,.12);
      border: 1px solid rgba(16,185,129,.3);
      color: var(--mint);
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 7px 14px;
      border-radius: 100px;
      margin-bottom: 20px;
    }

    .urgency-section .section-title { margin-bottom: 18px; }

    .urgency-text {
      font-size: 1rem;
      color: var(--gray-600);
      line-height: 1.75;
      margin-bottom: 32px;
    }

    .feature-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .feature-list li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: .93rem;
      color: var(--gray-600);
    }
    .feature-list li i {
      color: var(--mint);
      font-size: .85rem;
      margin-top: 3px;
      flex-shrink: 0;
    }

    /* ── FOOTER / CTA ─────────────────────────────────────────── */
    .cta-section {
      background: var(--navy);
      padding: 110px 0 80px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .cta-section::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16,185,129,.1) 0%, transparent 60%);
      pointer-events: none;
    }

    .cta-inner {
      position: relative;
      z-index: 1;
      max-width: 640px;
      margin: 0 auto;
    }

    .cta-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16,185,129,.12);
      border: 1px solid rgba(16,185,129,.3);
      color: var(--mint);
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 7px 16px;
      border-radius: 100px;
      margin-bottom: 28px;
    }
    .cta-badge i { font-size: .72rem; }

    .cta-section h2 {
      font-family: var(--font-serif);
      font-size: clamp(2rem, 4vw, 2.8rem);
      font-weight: 400;
      font-style: italic;
      color: var(--white);
      line-height: 1.2;
      letter-spacing: -.02em;
      margin-bottom: 18px;
    }

    .cta-section p {
      font-size: 1rem;
      color: rgba(255,255,255,.65);
      line-height: 1.7;
      margin-bottom: 44px;
    }

    .cta-spots {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 100px;
      padding: 10px 20px;
      margin-bottom: 28px;
      font-size: .85rem;
      color: rgba(255,255,255,.75);
    }
    .spot-indicator {
      display: flex;
      gap: 3px;
    }
    .spot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--mint);
    }
    .spot.taken { background: rgba(255,255,255,.2); }

    .footer-links {
      margin-top: 60px;
      padding-top: 32px;
      border-top: 1px solid rgba(255,255,255,.08);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 28px;
      flex-wrap: wrap;
    }
    .footer-links a {
      font-size: .83rem;
      color: rgba(255,255,255,.4);
      text-decoration: none;
      transition: color .15s;
    }
    .footer-links a:hover { color: rgba(255,255,255,.75); }

    .footer-copy {
      text-align: center;
      margin-top: 20px;
      font-size: .78rem;
      color: rgba(255,255,255,.25);
    }

    /* ── RESPONSIVE ───────────────────────────────────────────── */
    @media (max-width: 1024px) {
      .steps-grid { grid-template-columns: repeat(2, 1fr); gap: 44px; }
      .steps-connector { display: none; }
      .step-item { padding: 0; }
      .pain-card:nth-child(4),
      .pain-card:nth-child(5) { grid-column: auto; }
    }

    @media (max-width: 900px) {
      .hero-inner {
        grid-template-columns: 1fr;
        gap: 48px;
      }
      .hero-sub { max-width: 100%; }
      .pain-grid { grid-template-columns: 1fr 1fr; gap: 16px; }
      .pain-card:nth-child(4),
      .pain-card:nth-child(5) { grid-column: auto; }
      .steps-grid {
        grid-template-columns: 1fr 1fr;
        gap: 44px;
      }
      .steps-connector { display: none; }
      .step-item { padding: 0; }
      .urgency-inner {
        grid-template-columns: 1fr;
        gap: 48px;
      }
    }

    @media (max-width: 600px) {
      .hero { padding: 72px 0 60px; }
      .hero-card { padding: 32px 24px; }
      .pain-section, .steps-section, .urgency-section, .cta-section { padding: 72px 0; }
      .pain-card { padding: 28px 24px; }
      .pain-grid { grid-template-columns: 1fr; }
      .steps-grid { grid-template-columns: 1fr; gap: 44px; }
      .urgency-visual { padding: 32px 28px; }
      .btn-footer { padding: 18px 32px; font-size: 1rem; }
      .stat-number { font-size: 2.2rem; }
      .trust-row { gap: 12px; }
      .trust-item { font-size: .72rem; }
      .steps-section .section-title { margin-bottom: 44px; }
    }

    /* ── WIDERSPRUCH SECTION ──────────────────────────────────── */
    .widerspruch-section {
      padding: 100px 0;
      background: var(--white);
    }

    .widerspruch-inner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 72px;
      align-items: center;
    }

    .widerspruch-flow {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .flow-step {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      background: var(--gray-50);
      border: 1px solid var(--gray-200);
      border-radius: var(--radius);
      padding: 18px 20px;
      transition: border-color .2s, box-shadow .2s;
    }
    .flow-step:hover {
      border-color: var(--mint-light);
      box-shadow: var(--shadow-sm);
    }

    .flow-step-num {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--navy);
      color: var(--mint);
      font-family: var(--font-serif);
      font-size: 1rem;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .flow-step-body h4 {
      font-size: .95rem;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 4px;
    }
    .flow-step-body p {
      font-size: .83rem;
      color: var(--gray-600);
      line-height: 1.55;
    }

    .widerspruch-result {
      background: var(--navy);
      border-radius: var(--radius-xl);
      padding: 40px 36px;
      position: relative;
      overflow: hidden;
    }
    .widerspruch-result::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 180px; height: 180px;
      border-radius: 50%;
      background: rgba(16,185,129,.08);
    }

    .result-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16,185,129,.12);
      border: 1px solid rgba(16,185,129,.3);
      color: var(--mint);
      font-size: .73rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 100px;
      margin-bottom: 20px;
    }

    .result-letter {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: var(--radius);
      padding: 20px;
      font-size: .82rem;
      color: rgba(255,255,255,.75);
      line-height: 1.7;
      margin: 20px 0;
      font-family: Georgia, serif;
    }
    .result-letter strong {
      color: white;
      font-weight: 600;
    }

    .result-meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .result-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16,185,129,.1);
      border: 1px solid rgba(16,185,129,.2);
      color: var(--mint);
      font-size: .75rem;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 100px;
    }

    /* ── PRICING SECTION ──────────────────────────────────────── */
    .pricing-section {
      padding: 100px 0;
      background: var(--gray-100);
    }

    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-top: 56px;
    }

    .pricing-card {
      background: var(--white);
      border: 1.5px solid var(--gray-200);
      border-radius: var(--radius-lg);
      padding: 36px 30px;
      position: relative;
      transition: transform .2s, box-shadow .2s;
    }
    .pricing-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }
    .pricing-card.featured {
      border-color: var(--mint);
      box-shadow: 0 0 0 1px var(--mint), var(--shadow-md);
    }

    .pricing-badge {
      position: absolute;
      top: -13px; left: 50%; transform: translateX(-50%);
      background: var(--mint);
      color: white;
      font-size: .72rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 4px 14px;
      border-radius: 100px;
      white-space: nowrap;
    }

    .pricing-name {
      font-size: .78rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--mint-dark);
      margin-bottom: 12px;
    }

    .pricing-price {
      font-family: var(--font-serif);
      font-size: 2.6rem;
      font-weight: 400;
      color: var(--navy);
      line-height: 1;
      margin-bottom: 4px;
    }
    .pricing-price span {
      font-size: 1.1rem;
      font-family: var(--font-sans);
      font-weight: 600;
    }

    .pricing-sub {
      font-size: .82rem;
      color: var(--gray-600);
      margin-bottom: 24px;
    }

    .pricing-divider {
      height: 1px;
      background: var(--gray-200);
      margin: 20px 0;
    }

    .pricing-features {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 28px;
    }
    .pricing-features li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: .88rem;
      color: var(--gray-600);
      line-height: 1.4;
    }
    .pricing-features li i {
      color: var(--mint);
      font-size: .78rem;
      margin-top: 3px;
      flex-shrink: 0;
    }

    .pricing-cta {
      display: block;
      width: 100%;
      padding: 13px 0;
      border-radius: 100px;
      border: none;
      text-align: center;
      font-family: var(--font-sans);
      font-weight: 700;
      font-size: .92rem;
      cursor: pointer;
      text-decoration: none;
      transition: all .18s;
    }
    .pricing-cta.primary {
      background: var(--mint);
      color: white;
      box-shadow: 0 4px 16px rgba(16,185,129,.3);
    }
    .pricing-cta.primary:hover {
      background: var(--mint-dark);
      box-shadow: 0 6px 22px rgba(16,185,129,.4);
    }
    .pricing-cta.outline {
      background: transparent;
      color: var(--navy);
      border: 1.5px solid var(--gray-200);
    }
    .pricing-cta.outline:hover {
      border-color: var(--mint);
      color: var(--mint-dark);
    }

    .pro-card {
      background: var(--navy);
      border-radius: var(--radius-lg);
      padding: 36px 40px;
      margin-top: 20px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 32px;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    .pro-card::before {
      content: '';
      position: absolute;
      top: -60px; right: -60px;
      width: 220px; height: 220px;
      border-radius: 50%;
      background: rgba(16,185,129,.07);
    }

    .pro-features {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 10px 24px;
      margin-top: 16px;
    }
    .pro-features li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: .85rem;
      color: rgba(255,255,255,.7);
    }
    .pro-features li i { color: var(--mint); font-size: .78rem; }

    @media (max-width: 900px) {
      .widerspruch-inner { grid-template-columns: 1fr; gap: 48px; }
      .pricing-grid { grid-template-columns: 1fr 1fr; }
      .pricing-grid .pricing-card:nth-child(odd):last-child { grid-column: span 2; max-width: 420px; margin: 0 auto; width: 100%; }
      .pro-card { grid-template-columns: 1fr; }
    }

`

const LANDING_HTML = String.raw`
<!-- ── HEADER ────────────────────────────────────────────── -->

  <!-- ── HEADER ────────────────────────────────────────────── -->
  <header>
    <div class="container">
      <div class="header-inner">
        <a href="/" class="logo">MediRight<span class="logo-dot"></span></a>
        <div style="display:flex;gap:12px;align-items:center;">
          <a href="/demos" class="btn btn-outline" style="font-size:.82rem;">
            <i class="fa-solid fa-play"></i> Demo ansehen
          </a>
          <a href="/login" class="btn btn-primary" style="padding:10px 22px;font-size:.88rem;">Kostenlos starten</a>
        </div>
      </div>
    </div>
  </header>


  <!-- ── HERO ──────────────────────────────────────────────── -->
  <section class="hero">
    <div class="container">
      <div class="hero-inner">

        <!-- Left: Copy -->
        <div>
          <div class="hero-pre animate-fade-up">
            Für Privatversicherte &amp; Beihilfeberechtigte
          </div>
          <h1 class="animate-fade-up delay-1">
            Beihilfe kürzt, PKV stellt sich quer? <em>Bleiben Sie nicht auf Ihren Arztkosten sitzen.</em>
          </h1>
          <p class="hero-sub animate-fade-up delay-2">
            AXA, Signal, Debeka — jede Kasse hat eine Abteilung voller GOÄ-Spezialisten, die aktiv nach Kürzungsgründen suchen. Sie bekommen eine unleserliche PDF mit 15 Ziffern. MediRight dreht den Spieß um: Rechnung per WhatsApp weiterleiten, in Sekunden wissen was anfechtbar ist, und was Ihr Arzt systematisch zu viel berechnet.
          </p>
          <!-- WhatsApp Flow Pill -->
          <div class="animate-fade-up delay-3" style="margin-top:32px; display:flex; flex-direction:column; gap:10px; max-width:440px;">
            <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 18px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(37,211,102,.15);border:1px solid rgba(37,211,102,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem;">📄</div>
              <div style="font-size:.88rem;color:rgba(255,255,255,.8);">PDF aus dem AXA-Portal laden — <strong style="color:white;">2 Taps</strong></div>
            </div>
            <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 18px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(37,211,102,.15);border:1px solid rgba(37,211,102,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem;">💬</div>
              <div style="font-size:.88rem;color:rgba(255,255,255,.8);">An MediRight-WhatsApp weiterleiten — <strong style="color:white;">1 Tap</strong></div>
            </div>
            <div style="display:flex;align-items:center;gap:14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:14px;padding:14px 18px;">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,.2);border:1px solid rgba(16,185,129,.4);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem;">⚡</div>
              <div style="font-size:.88rem;color:rgba(255,255,255,.9);"><strong style="color:var(--mint);">Analyse in 60 Sekunden</strong> — was anfechtbar ist, was Ihr Arzt falsch berechnet</div>
            </div>
          </div>
        </div>

        <!-- Right: Card -->
        <div class="animate-fade-up delay-3">
          <div class="hero-card">
            <div class="hero-card-badge">
              <i class="fa-solid fa-circle-check"></i>
              Erste Arztrechnung kostenlos
            </div>
            <h3>Jetzt starten — Ergebnis in 60&nbsp;Sekunden.</h3>
            <p>Konto anlegen, PDF hochladen oder per WhatsApp weiterleiten — die KI prüft GOÄ-Ziffern, Faktoren und Erstattungen automatisch.</p>
            <a href="/login" class="btn btn-hero">
              <i class="fa-solid fa-arrow-right"></i>
              Kostenlos starten
            </a>
            <div class="trust-row">
              <div class="trust-item">
                <i class="fa-solid fa-lock" style="color:var(--mint)"></i>
                DSGVO-konform
              </div>
              <div class="trust-item">
                <span>🇩🇪</span>
                Server in Deutschland
              </div>
              <div class="trust-item">
                <i class="fa-solid fa-file-invoice" style="color:var(--mint)"></i>
                Arztrechnung gratis
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>


  <!-- ── PAIN / BENEFITS ───────────────────────────────────── -->
  <section class="pain-section">
    <div class="container">
      <div class="section-eyebrow">Warum MediRight?</div>
      <h2 class="section-title">Viele Fragen. Eine Lösung.</h2>

      <!-- 3×2 horizontal card grid — Zeile 1: Kasse, Zeile 2: Arzt -->
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:20px;">

        <!-- KASSE 1 -->
        <div class="pain-card" style="display:flex; flex-direction:row; gap:20px; align-items:flex-start; padding:26px 24px;">
          <div class="pain-icon" style="flex-shrink:0; margin-bottom:0; width:46px; height:46px; font-size:1.05rem;">
            <i class="fa-solid fa-ban"></i>
          </div>
          <div>
            <h3 style="font-size:1rem; margin-bottom:8px;">Lehnt Ihre Kasse einfach ab?</h3>
            <p style="font-size:.85rem;">MediRight prüft jede Ablehnung auf Anfechtbarkeit und bewertet die Erfolgswahrscheinlichkeit. Widerspruchsschreiben fertig zum Versand — rechtssicher, in Minuten.</p>
          </div>
        </div>

        <!-- KASSE 2 -->
        <div class="pain-card" style="display:flex; flex-direction:row; gap:20px; align-items:flex-start; padding:26px 24px;">
          <div class="pain-icon" style="flex-shrink:0; margin-bottom:0; width:46px; height:46px; font-size:1.05rem;">
            <i class="fa-solid fa-eye-slash"></i>
          </div>
          <div>
            <h3 style="font-size:1rem; margin-bottom:8px;">Zahlt Ihre Kasse alles, was sie schuldet?</h3>
            <p style="font-size:.85rem;">Keine Ablehnung, kein Brief — die Kasse überweist einfach still weniger. Nur wer Rechnung und Erstattungsbescheid systematisch abgleicht, bemerkt es. MediRight tut das automatisch.</p>
          </div>
        </div>

        <!-- KASSE 3 -->
        <div class="pain-card" style="display:flex; flex-direction:row; gap:20px; align-items:flex-start; padding:26px 24px;">
          <div class="pain-icon" style="flex-shrink:0; margin-bottom:0; width:46px; height:46px; font-size:1.05rem;">
            <i class="fa-solid fa-users"></i>
          </div>
          <div>
            <h3 style="font-size:1rem; margin-bottom:8px;">Erstattet Ihre Kasse weniger als andere?</h3>
            <p style="font-size:.85rem;">Andere AXA-Kunden erhalten im Schnitt 6&thinsp;% mehr erstattet als Sie? MediRight benchmarkt Ihre Erstattungsquote gegen Versicherte gleichen Tarifs — und zeigt wo die Abweichung herkommt.</p>
          </div>
        </div>

        <!-- ARZT 1 -->
        <div class="pain-card" style="display:flex; flex-direction:row; gap:20px; align-items:flex-start; padding:26px 24px;">
          <div class="pain-icon" style="flex-shrink:0; margin-bottom:0; width:46px; height:46px; font-size:1.05rem;">
            <i class="fa-solid fa-file-invoice"></i>
          </div>
          <div>
            <h3 style="font-size:1rem; margin-bottom:8px;">Rechnet Ihr Arzt zu viel ab?</h3>
            <p style="font-size:.85rem;">Über dem 2,3-fachen Schwellenwert ist nach §&thinsp;12 GOÄ eine schriftliche Begründung Pflicht. Fehlt sie, sind diese Positionen sofort anfechtbar. MediRight zeigt Ihnen welche — mit konkretem Rückforderungsbetrag.</p>
          </div>
        </div>

        <!-- ARZT 2 -->
        <div class="pain-card" style="display:flex; flex-direction:row; gap:20px; align-items:flex-start; padding:26px 24px;">
          <div class="pain-icon" style="flex-shrink:0; margin-bottom:0; width:46px; height:46px; font-size:1.05rem;">
            <i class="fa-solid fa-arrow-trend-up"></i>
          </div>
          <div>
            <h3 style="font-size:1rem; margin-bottom:8px;">Wird Ihr Arzt mit jedem Besuch teurer?</h3>
            <p style="font-size:.85rem;">Von 1,8× auf 3,5× über vier Besuche — ohne dass es auffällt. MediRight verfolgt die Faktor-Entwicklung über alle Termine und zeigt, ob Ihr Arzt systematisch über dem Fachgruppen-Durchschnitt liegt.</p>
          </div>
        </div>

        <!-- ARZT 3 / ÜBERBLICK -->
        <div class="pain-card" style="display:flex; flex-direction:row; gap:20px; align-items:flex-start; padding:26px 24px;">
          <div class="pain-icon" style="flex-shrink:0; margin-bottom:0; width:46px; height:46px; font-size:1.05rem;">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <div>
            <h3 style="font-size:1rem; margin-bottom:8px;">Wissen Sie, was noch offen ist?</h3>
            <p style="font-size:.85rem;">Was wurde eingereicht, was gekürzt, was ist anfechtbar? Ihr persönliches Dashboard zeigt alle Vorgänge mit Status auf einen Blick — kein Papierchaos, kein Nachfragen.</p>
          </div>
        </div>

      </div>

      <!-- Demo Link -->
      <div style="text-align:center; margin-top:44px;">
        <a href="demos.html" class="btn btn-outline" style="font-size:.92rem; padding:14px 28px;">
          <i class="fa-solid fa-play"></i> Interaktive Demo ansehen — so sieht Ihr Dashboard aus
        </a>
      </div>

    </div>
  </section>


  <!-- ── HOW IT WORKS ──────────────────────────────────────── -->
  <section class="steps-section">
    <div class="container">
      <div class="section-eyebrow">So einfach geht's</div>
      <h2 class="section-title">PDF weiterleiten. Fertig.</h2>

      <div class="steps-grid">
        <div class="steps-connector"></div>

        <div class="step-item">
          <div class="step-num">1</div>
          <div class="step-tag">Einmalig</div>
          <h3>Konto anlegen — kostenlos</h3>
          <p>E-Mail oder Google. PDF dann per Browser hochladen oder per WhatsApp weiterleiten — beides funktioniert.</p>
          <div class="step-pill"><i class="fa-solid fa-bolt"></i> 30 Sekunden Setup</div>
        </div>

        <div class="step-item">
          <div class="step-num">2</div>
          <div class="step-tag">Jede Rechnung</div>
          <h3>PDF aus dem Kassenportal weiterleiten</h3>
          <p>AXA, Signal, Debeka — alle schicken PDFs ins Kundenportal. 2 Taps: herunterladen, an MediRight weiterleiten.</p>
          <div class="step-pill"><i class="fa-solid fa-bolt"></i> 4 Taps total</div>
        </div>

        <div class="step-item">
          <div class="step-num">3</div>
          <div class="step-tag">Sofort</div>
          <h3>Analyse zurück in 60 Sekunden</h3>
          <p>GOÄ-Ziffern, Faktoren, §&thinsp;12-Verstöße, Benchmark gegen Fachgruppe — alles aufbereitet per WhatsApp-Antwort.</p>
          <div class="step-pill"><i class="fa-solid fa-circle-check"></i> Was anfechtbar ist</div>
        </div>

        <div class="step-item">
          <div class="step-num">4</div>
          <div class="step-tag">Mit der Zeit</div>
          <h3>Dashboard wächst automatisch</h3>
          <p>Jede Rechnung baut Ihr persönliches Profil auf: Arzt-Vergleiche, Ablehnungsraten, Jahrestotals — alles ohne Mehraufwand.</p>
          <div class="step-pill"><i class="fa-solid fa-chart-simple"></i> Kumuliert ohne Aufwand</div>
        </div>

      </div>
    </div>
  </section>


  <!-- ── DASHBOARD FEATURES ────────────────────────────────── -->
  <section class="urgency-section">
    <div class="container">
      <div class="urgency-inner">

        <!-- Left: Stats -->
        <div class="urgency-visual">
          <div class="urgency-stat">
            <div class="stat-number">83&nbsp;%</div>
            <div class="stat-label">erstattet — während andere AXA-Kunden im Schnitt 89&nbsp;% erhalten. 6 Prozentpunkte, die niemand angesprochen hat.</div>
          </div>
          <div class="urgency-stat">
            <div class="stat-number">3,5×</div>
            <div class="stat-label">Abrechnungsfaktor Ihres Internisten — Ø der Fachgruppe: 2,1×. Ohne §&thinsp;12-Begründung anfechtbar.</div>
          </div>
          <div class="urgency-stat">
            <div class="stat-number">€&thinsp;127</div>
            <div class="stat-label">stille Kürzungen kumuliert — nie abgelehnt, einfach still weniger überwiesen. Erscheint in keiner Statistik.</div>
          </div>
          <div class="urgency-stat">
            <div class="stat-number">~&thinsp;4.000&nbsp;€</div>
            <div class="stat-label">entgehen einem Durchschnittsversicherten über 10 Jahre, weil Widersprüche ausbleiben.</div>
          </div>
        </div>

        <!-- Right: Features -->
        <div>
          <div class="urgency-badge">
            <i class="fa-solid fa-chart-line"></i>
            Mehr als ein Widerspruch
          </div>
          <h2 class="section-title">Das vollständige Bild — nicht nur die einzelne Rechnung.</h2>
          <p class="urgency-text">MediRight akkumuliert mit jeder Einreichung mehr Wissen über Ihre persönliche Situation. Nach 3–4 Rechnungen haben Sie Einblicke, die kein anderes Tool bieten kann.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> Faktor-Entwicklung Ihres Arztes über alle Besuche — steigt er systematisch?</li>
            <li><i class="fa-solid fa-check"></i> Unplausible Ziffernkombinationen: was selten zusammen abgerechnet wird</li>
            <li><i class="fa-solid fa-check"></i> Ihre Ablehnungsrate im Trend — steigt sie? Bei welchen Arztgruppen?</li>
            <li><i class="fa-solid fa-check"></i> Benchmark: Sie vs. andere Kunden Ihrer Versicherung</li>
            <li><i class="fa-solid fa-check"></i> Neutrale Gesundheitschronik mit Vorsorge-Erinnerungen</li>
          </ul>

          <!-- Praxis-Beispiel -->
          <div style="margin-top:36px; background:var(--gray-100); border:1px solid var(--gray-200); border-radius:var(--radius-lg); padding:24px 28px;">
            <div style="font-size:.72rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--mint-dark); margin-bottom:14px;">
              <i class="fa-solid fa-flask" style="margin-right:6px;"></i>Praxis-Beispiel
            </div>
            <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:12px; align-items:center; font-size:.88rem;">
              <div style="background:var(--white); border:1px solid var(--gray-200); border-radius:var(--radius-sm); padding:14px 16px;">
                <div style="font-size:.72rem; font-weight:600; color:var(--gray-400); text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;">Arztrechnung</div>
                <div style="font-weight:600; color:var(--navy);">GOÄ Nr. 3 – Faktor 3,5×</div>
                <div style="color:var(--gray-600); font-size:.82rem; margin-top:4px;">Eingehende Untersuchung</div>
                <div style="font-weight:700; color:var(--navy); margin-top:8px;">84,40&nbsp;€</div>
              </div>
              <div style="text-align:center;">
                <i class="fa-solid fa-arrow-right" style="color:var(--mint); font-size:1rem;"></i>
                <div style="font-size:.72rem; color:var(--gray-400); margin-top:4px;">AXA kürzt</div>
              </div>
              <div style="background:var(--white); border:1.5px solid var(--mint-light); border-radius:var(--radius-sm); padding:14px 16px;">
                <div style="font-size:.72rem; font-weight:600; color:var(--mint-dark); text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;">MediRight erkennt</div>
                <div style="font-weight:600; color:var(--navy);">§&thinsp;12 GOÄ verletzt</div>
                <div style="color:var(--gray-600); font-size:.82rem; margin-top:4px;">Kein Begründungsschreiben · 4. Besuch in Folge über 2,3×</div>
                <div style="font-weight:700; color:var(--mint-dark); margin-top:8px;">+ 63,80&nbsp;€ zurück</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>




  <!-- ── WIDERSPRUCH FEATURE ──────────────────────────────────── -->
  <section class="widerspruch-section">
    <div class="container">
      <div class="widerspruch-inner">

        <!-- Left: Flow -->
        <div>
          <div class="section-eyebrow">Widerspruch leicht gemacht</div>
          <h2 class="section-title">Vom Kassenbescheid zum fertigen Widerspruchsbrief — in 2 Minuten.</h2>
          <p style="font-size:1rem; color:var(--gray-600); line-height:1.75; margin-bottom:36px;">
            Die Kasse kürzt — meist ohne Erklärung. MediRight analysiert jeden Bescheid automatisch,
            identifiziert anfechtbare Positionen und generiert einen rechtssicheren Widerspruchsbrief,
            den Sie nur noch absenden müssen.
          </p>

          <div class="widerspruch-flow">
            <div class="flow-step">
              <div class="flow-step-num">1</div>
              <div class="flow-step-body">
                <h4>Kassenbescheid hochladen (1 Credit)</h4>
                <p>PDF aus dem Kassenportal — per Browser oder WhatsApp. Die KI liest Einreichung, Erstattung und alle Ablehnungsposten.</p>
              </div>
            </div>
            <div class="flow-step">
              <div class="flow-step-num">2</div>
              <div class="flow-step-body">
                <h4>KI analysiert Ablehnungsgründe</h4>
                <p>Jede Kürzung wird gegen GOÄ-Recht, Ihre Versicherungsbedingungen und unsere Präzedenzfälle geprüft. Erfolgswahrscheinlichkeit inklusive.</p>
              </div>
            </div>
            <div class="flow-step">
              <div class="flow-step-num">3</div>
              <div class="flow-step-body">
                <h4>Widerspruchsbrief — fertig zum Versand</h4>
                <p>Personalisiert, rechtssicher, mit konkreten §-Bezügen. Kopieren, ausdrucken, absenden. Fertig.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Mock letter -->
        <div class="widerspruch-result">
          <div class="result-badge">
            <i class="fa-solid fa-file-lines"></i>
            KI-generierter Widerspruch
          </div>
          <div style="color:rgba(255,255,255,.5); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;">Widerspruch generiert in 48 Sek.</div>

          <div class="result-letter">
            <strong>Betreff: Widerspruch gegen Ihren Bescheid vom 12.03.2025,<br>Ref. AXA-2025-0391847</strong><br><br>
            Sehr geehrte Damen und Herren,<br><br>
            hiermit lege ich fristgerecht Widerspruch gegen die teilweise Ablehnung meiner Leistungsabrechnung ein.
            Die Ablehnung der <strong>GOÄ-Ziffer 3 (Faktor 3,5×)</strong> entbehrt einer rechtlichen Grundlage:
            Gemäß <strong>§ 12 Abs. 3 GOÄ</strong> ist eine Überschreitung des Schwellenwerts zulässig,
            sofern eine schriftliche Begründung vorliegt — diese wurde dem Bescheid beigefügt und
            wurde von Ihrer Seite nicht berücksichtigt…
          </div>

          <div class="result-meta">
            <div class="result-tag"><i class="fa-solid fa-scale-balanced"></i> §12 GOÄ referenziert</div>
            <div class="result-tag"><i class="fa-solid fa-chart-line"></i> 87% Erfolgsquote</div>
            <div class="result-tag"><i class="fa-solid fa-euro-sign"></i> 63,80 € zurückgefordert</div>
          </div>
        </div>

      </div>
    </div>
  </section>


  <!-- ── PRICING ───────────────────────────────────────────────── -->
  <section class="pricing-section">
    <div class="container">
      <div style="max-width:540px;">
        <div class="section-eyebrow">Transparent & fair</div>
        <h2 class="section-title">Kostenlos starten. Nur zahlen, wenn Sie mehr brauchen.</h2>
      </div>

      <div class="pricing-grid">

        <!-- Free -->
        <div class="pricing-card">
          <div class="pricing-name" style="color:var(--gray-600);">Kostenlos</div>
          <div class="pricing-price">€<span style="font-size:1.6rem;">0</span></div>
          <div class="pricing-sub">Für immer gratis</div>
          <div class="pricing-divider"></div>
          <ul class="pricing-features">
            <li><i class="fa-solid fa-check"></i> Arztrechnung-Analyse unbegrenzt</li>
            <li><i class="fa-solid fa-check"></i> GOÄ-Ziffern, Faktoren, §12-Prüfung</li>
            <li><i class="fa-solid fa-check"></i> Dashboard & Ärzte-Übersicht</li>
            <li><i class="fa-solid fa-check"></i> Ärzte-Benchmarking</li>
            <li style="color:var(--gray-400);"><i class="fa-solid fa-minus" style="color:var(--gray-400);"></i> Kein Kassenbescheid-Check</li>
            <li style="color:var(--gray-400);"><i class="fa-solid fa-minus" style="color:var(--gray-400);"></i> Kein Widerspruchsbrief</li>
          </ul>
          <a href="/login" class="pricing-cta outline">Kostenlos starten</a>
        </div>

        <!-- Starter -->
        <div class="pricing-card">
          <div class="pricing-name">Starter</div>
          <div class="pricing-price"><span>€</span>7,99</div>
          <div class="pricing-sub">3 Analyse-Credits</div>
          <div class="pricing-divider"></div>
          <ul class="pricing-features">
            <li><i class="fa-solid fa-check"></i> Kassenbescheid-Analyse (3×)</li>
            <li><i class="fa-solid fa-check"></i> Widerspruchsbrief-Entwurf</li>
            <li><i class="fa-solid fa-check"></i> Arztrechnung-Analyse unbegrenzt</li>
            <li><i class="fa-solid fa-check"></i> Dashboard & Ärzte-Übersicht</li>
          </ul>
          <a href="/login" class="pricing-cta outline">Starten</a>
        </div>

        <!-- Standard -->
        <div class="pricing-card featured">
          <div class="pricing-badge">Beliebteste Wahl</div>
          <div class="pricing-name">Standard</div>
          <div class="pricing-price"><span>€</span>24,99</div>
          <div class="pricing-sub">10 Analyse-Credits · 2,50&thinsp;€/Credit</div>
          <div class="pricing-divider"></div>
          <ul class="pricing-features">
            <li><i class="fa-solid fa-check"></i> Kassenbescheid-Analyse (10×)</li>
            <li><i class="fa-solid fa-check"></i> Widerspruchsbrief-Entwurf</li>
            <li><i class="fa-solid fa-check"></i> Arztrechnung-Analyse unbegrenzt</li>
            <li><i class="fa-solid fa-check"></i> Ärzte-Benchmarking</li>
            <li><i class="fa-solid fa-check"></i> Widerspruchs-Tracker</li>
          </ul>
          <a href="/login" class="pricing-cta primary">Jetzt starten</a>
        </div>

        <!-- Profi -->
        <div class="pricing-card">
          <div class="pricing-name">Profi</div>
          <div class="pricing-price"><span>€</span>54,99</div>
          <div class="pricing-sub">25 Analyse-Credits · 2,20&thinsp;€/Credit</div>
          <div class="pricing-divider"></div>
          <ul class="pricing-features">
            <li><i class="fa-solid fa-check"></i> Kassenbescheid-Analyse (25×)</li>
            <li><i class="fa-solid fa-check"></i> Widerspruchsbrief-Entwurf</li>
            <li><i class="fa-solid fa-check"></i> Arztrechnung-Analyse unbegrenzt</li>
            <li><i class="fa-solid fa-check"></i> Ärzte-Benchmarking & Verlauf</li>
            <li><i class="fa-solid fa-check"></i> KI-Chat-Assistent</li>
          </ul>
          <a href="/login" class="pricing-cta outline">Starten</a>
        </div>

      </div>

      <!-- PRO Annual -->
      <div class="pro-card">
        <div style="position:relative;z-index:1;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
            <div style="background:var(--mint);color:white;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 14px;border-radius:100px;">PRO Jahresabo</div>
            <div style="color:rgba(255,255,255,.5);font-size:.83rem;">Für regelmäßige Nutzer</div>
          </div>
          <div style="font-family:var(--font-serif);font-size:1.6rem;color:white;margin-bottom:8px;">Unlimitiert — für <span style="color:var(--mint);">€&thinsp;29/Jahr</span> <span style="font-family:var(--font-sans);font-size:1rem;color:rgba(255,255,255,.5);">= €&thinsp;2,41/Monat</span></div>
          <ul class="pro-features">
            <li><i class="fa-solid fa-check"></i> Unbegrenzte Kassenbescheid-Analysen</li>
            <li><i class="fa-solid fa-check"></i> Alle Widerspruchsbriefe inklusive</li>
            <li><i class="fa-solid fa-check"></i> KI-Chat-Assistent</li>
            <li><i class="fa-solid fa-check"></i> PDF-Export</li>
            <li><i class="fa-solid fa-check"></i> Früher Zugang zu neuen Features</li>
          </ul>
        </div>
        <div style="position:relative;z-index:1;flex-shrink:0;">
          <a href="/login" class="btn btn-primary" style="white-space:nowrap;padding:16px 32px;">PRO jetzt aktivieren</a>
        </div>
      </div>

    </div>
  </section>

  <!-- ── CTA ───────────────────────────────────────────────── -->
  <section class="cta-section" id="cta">
    <div class="container">
      <div class="cta-inner">

        <div class="cta-badge">
          <i class="fa-solid fa-circle-check"></i>
          Jetzt verfügbar
        </div>

        <h2>Ihre nächste Rechnung prüft sich von selbst.</h2>

        <p>Konto anlegen dauert 30 Sekunden. Die erste Arztrechnung-Analyse ist kostenlos. Kein Abo, kein Risiko.</p>

        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-bottom:20px;">
          <a href="/login" class="btn btn-footer">
            <i class="fa-solid fa-arrow-right"></i>
            Kostenlos starten
          </a>
          <a href="/demos" class="btn" style="background:rgba(255,255,255,.08); color:rgba(255,255,255,.8); padding:20px 32px; font-size:1rem; border-radius:100px; border:1.5px solid rgba(255,255,255,.15);">
            <i class="fa-solid fa-play"></i>
            Demo ansehen
          </a>
        </div>

        <div class="footer-links">
          <a href="/impressum">Impressum</a>
          <a href="/datenschutz">Datenschutz</a>
          <a href="/agb">AGB</a>
          <a href="/kontakt">Kontakt</a>
        </div>

        <div class="footer-copy">
          © 2025 MediRight GmbH · Kein Rechtsanwaltsverhältnis · Alle Angaben ohne Gewähr
        </div>

      </div>
    </div>
  </section>
`
