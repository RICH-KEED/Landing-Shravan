import React, { useState } from 'react';
import './TrustedByTheBest.css';

const defaultTestimonials = [
  {
    name: 'HAYSRE',
    role: 'CEO AT STACK3D LAB',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD-MkdBcGp5pqPQzUak4LR3OJvQL5YoE-Z5kMUic0yJyfyvUBu1IadixRjoA6vhxAdOc33X3Pvb0nWs-eepLQzUtUP1crM6NtNQd6jLy8ewb0nrYily8ZlgmdQ1aLl9yGUs4mOYDE6qeu4KimA8ZxMFTPRZSW3tmRrWqVIKZUZHQa9dx7to5uQMihm2MgrurYDKjDT8QD_F_Vog4MQkdtIEx8UGHFKbCZvrf6BgMP3ksrT4ecSY0cul',
    quote: "Before Threat Shield, our security team was reactive — chasing alerts after the damage was already done. Now threats get contained in seconds, and our compliance reports are audit-ready without weeks of manual prep. It's the first platform our CISO actually trusts to run unattended overnight.",
  },
];

function PartnerLogo({ name }) {
  switch (name) {
    case 'stack':
      return <div className="trusted-logo trusted-logo-stack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
        </svg>
        <span>Stack&amp;d Lab</span>
      </div>;
    case 'ubs':
      return <div className="trusted-logo trusted-logo-ubs">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 14a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4zm-5-3a2 2 0 100-4 2 2 0 000 4zM11 11h2v8h-2zm-5 3h2v5H6zm10 0h2v5h-2z" />
          <circle cx="12" cy="7" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="7" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="17" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span>UBS</span>
      </div>;
    case 'barclays':
      return <div className="trusted-logo trusted-logo-barclays">BARCLAYS</div>;
    case 'tesla':
      return <div className="trusted-logo trusted-logo-tesla">T E S L A</div>;
    case 'nestle':
      return <div className="trusted-logo trusted-logo-nestle">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 13c1-2 4-5 9-5 6 0 9 3 9 5s-3 4-9 4-8-2-9-4zm13-2c-.5-1-2-1.5-4-1.5-2.5 0-4 .8-4.5 1.5h8.5z" />
          <circle cx="10" cy="7" r="2" />
        </svg>
        <span>Nestlé</span>
      </div>;
    case 'stripe':
      return <div className="trusted-logo trusted-logo-stripe">stripe</div>;
    default:
      return null;
  }
}

const partners = ['stack', 'ubs', 'barclays', 'tesla', 'nestle', 'stripe'];

export default function TrustedByTheBest({ testimonials = defaultTestimonials }) {
  const [index, setIndex] = useState(0);
  const items = testimonials.length ? testimonials : defaultTestimonials;
  const current = items[index % items.length];
  const canNavigate = items.length > 1;

  function move(step) {
    setIndex((previous) => (previous + step + items.length) % items.length);
  }

  return (
    <section className="trusted-section" aria-label="Trusted by the best">
      <header className="trusted-header">
        <div className="trusted-tag"><span>05</span><span className="trusted-tag-slash">//</span><span>TRUSTED BY THE BEST</span></div>
        <div className="trusted-header-line" aria-hidden="true" />
      </header>

      <div className="trusted-main">
        <div className="trusted-content">
          <div className="trusted-profile">
            <div className="trusted-avatar"><img src={current.avatar} alt={`${current.name} - ${current.role}`} /></div>
            <div className="trusted-profile-copy">
              <h3>{current.name}</h3>
              <p>{current.role}</p>
            </div>
          </div>
          <div className="trusted-quote-row">
            <span className="trusted-quote-mark" aria-hidden="true">“</span>
            <blockquote>{current.quote}</blockquote>
          </div>
        </div>

        <div className="trusted-controls">
          <button type="button" aria-label="Previous quote" onClick={() => move(-1)} disabled={!canNavigate}>[&lt;]</button>
          <button type="button" aria-label="Next quote" onClick={() => move(1)} disabled={!canNavigate}>[&gt;]</button>
        </div>
      </div>

      <footer className="trusted-footer" aria-label="Partner logos">
        <div className="trusted-marquee">
          {[0, 1].map((copy) => (
            <div className="trusted-logo-sequence" key={copy} aria-hidden={copy === 1}>
              {partners.map((name) => <PartnerLogo name={name} key={name} />)}
            </div>
          ))}
        </div>
      </footer>
    </section>
  );
}
