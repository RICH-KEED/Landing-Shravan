import React from 'react';
import ThreatParticleGlobe from './ThreatParticleGlobe.jsx';
import './CapabilitiesSection.css';

const cards = [
  {
    title: 'Threat Intelligence',
    description: 'Real-time global threat feeds mapped directly to your infrastructure.',
    alt: 'Threat Intelligence 3D holographic radar globe',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1XMDjvVypp4Eh7Zatl0K3k1mPfcz80lV7TmBQUvMYYxwjxxY0eI73irICB0Xcgowu6bvuEDCE8k6AMROFrILubrIEuuujOPuDLj4GniooAuUQ6YDoaXVWeRfEsVZesYW3A3A1_d1KG1GJbg5CzOQEwvttESlSJMjQumXUKviXcrHmgnahSwdEAAk6GNP2m7eMXMPH34NIagpRpOixLhRh-bPwPibI8lN_1vFeaZoeJWMUJbV1IqCycZPIA',
    pixels: [
      { top: -12, left: 32, size: 16, color: '#0ea5e9', glow: '0 0 8px rgba(56,189,248,.4)' },
      { top: -20, left: 80, size: 20, color: '#2563eb', glow: '0 0 10px rgba(37,99,235,.4)' },
      { top: -10, right: 56, size: 10, color: '#d4d4d4' },
      { top: -14, right: 16, size: 14, color: '#525252' },
      { top: -8, left: 176, size: 12, color: '#22d3ee' },
      { top: 80, left: -10, size: 12, color: '#38bdf8' },
      { top: 160, right: -12, size: 16, color: '#3b82f6' },
      { bottom: -12, left: 32, size: 14, color: '#2563eb' },
      { bottom: -18, left: 96, size: 20, color: '#38bdf8', glow: '0 0 12px rgba(56,189,248,.5)' },
      { bottom: -10, left: 176, size: 10, color: '#a3a3a3' },
      { bottom: -16, right: 40, size: 16, color: '#fff', glow: '0 0 8px rgba(255,255,255,.4)' },
      { bottom: -8, right: 96, size: 12, color: '#06b6d4' },
    ],
  },
  {
    title: 'Automated Response',
    description: 'Contain breaches in milliseconds, not hours — no manual intervention required.',
    alt: 'Automated Response 3D cyber shield breach emblem',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1VZWZ836UtTDpOH5GkHdaoVUoP_Drw2IMiDhcao2XFeWHjrYPdmC07intkwkJuRcte0knIn1Z0I2pzu4IEkRVqcHnwPwt4cuVKJ_svXgd35PKS-mxuXWaVPbDRmtGu64kx3Q66UemcnzHM_w9suq-nJHx_tjxnaKoEbhLLSc5krAvgylYude_bibGL1GvlnOAbPRSF6PUMjfSR8axYiA9gTgGvlyL1Hcn2hjTcQWiYDSjD6ot_1STs4VBE',
    cursor: true,
    pixels: [
      { top: -16, left: 24, size: 20, color: '#2563eb', glow: '0 0 12px rgba(37,99,235,.4)' },
      { top: -20, left: 80, size: 20, color: '#38bdf8', glow: '0 0 12px rgba(56,189,248,.5)' },
      { top: -14, left: 144, size: 12, color: '#525252' },
      { top: -16, right: 56, size: 16, color: '#404040' },
      { top: -20, right: 24, size: 20, color: '#e5e5e5' },
      { top: -10, right: -8, size: 14, color: '#1e40af' },
      { top: 128, left: -10, size: 14, color: '#22d3ee' },
      { top: 96, right: -12, size: 16, color: '#0ea5e9' },
      { bottom: -20, left: 40, size: 20, color: '#e5e5e5' },
      { bottom: -12, left: 96, size: 16, color: '#38bdf8', glow: '0 0 8px rgba(56,189,248,.4)' },
      { bottom: -16, left: 144, size: 12, color: '#404040' },
      { bottom: -18, right: 64, size: 20, color: '#1e3a8a', border: '1px solid rgba(56,189,248,.2)' },
      { bottom: -16, right: 20, size: 16, color: '#38bdf8', glow: '0 0 10px rgba(56,189,248,.5)' },
      { bottom: -8, left: -6, size: 10, color: '#3b82f6' },
    ],
  },
  {
    title: 'Compliance Engine',
    description: 'Audit-ready reporting for SOC 2, ISO 27001, and GDPR, generated automatically.',
    alt: 'Compliance Engine 3D cryptographic isometric cubes',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1V6PPKQcMUiA7auf_k2sPaQF5JWoAlxQAF0XDJFfI8X_vrqJkDrv67IYDiPb6VE-9wl68kMWAbwtAqhkJ_bde-21WSt3dr-nYdY1FuQOuGZVNrLmccRwsPOtZp-Z9_F5vnlx8WrjTM6pfb9Jo1M480VlOj_vcQs2derYODFADqtHHPwdAEAul29XflkW6_mK0kKRQ8wAWnhaZi0vSRCklThkioJJxPHlcLoMRcuxLl0x79vZ1fwXGjqxOw',
    pixels: [
      { top: -16, left: 40, size: 16, color: '#38bdf8', glow: '0 0 10px rgba(56,189,248,.4)' },
      { top: -20, left: 96, size: 20, color: '#2563eb', glow: '0 0 12px rgba(37,99,235,.4)' },
      { top: -10, right: 48, size: 10, color: '#a3a3a3' },
      { top: -16, right: 16, size: 16, color: '#e5e5e5' },
      { top: 112, left: -12, size: 16, color: '#38bdf8' },
      { top: '50%', right: -10, size: 14, color: '#1e3a8a', border: '1px solid rgba(56,189,248,.2)' },
      { top: '75%', left: -8, size: 12, color: '#3b82f6' },
      { bottom: -12, left: 40, size: 14, color: '#38bdf8' },
      { bottom: -20, left: '33.333%', size: 20, color: '#2563eb', glow: '0 0 12px rgba(37,99,235,.4)' },
      { bottom: -16, right: 40, size: 16, color: '#e5e5e5' },
      { bottom: -10, right: 96, size: 12, color: '#22d3ee' },
      { bottom: -14, right: -8, size: 14, color: '#0ea5e9' },
    ],
  },
];

function pixelStyle(pixel) {
  const position = {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (pixel[side] !== undefined) position[side] = typeof pixel[side] === 'number' ? `${pixel[side]}px` : pixel[side];
  }
  return { ...position, width: pixel.size, height: pixel.size, background: pixel.color, boxShadow: pixel.glow, border: pixel.border };
}

export default function CapabilitiesSection({ learnMoreHref = '#learn-more' }) {
  return (
    <section className="capabilities-section" aria-labelledby="capabilities-heading">
      <div className="capabilities-inner">
        <header className="capabilities-header">
          <div className="capabilities-tag"><span>04</span><span>//</span><span>CAPABILITIES</span></div>
          <a className="capabilities-learn" href={learnMoreHref}>Learn More <span aria-hidden="true">↗</span></a>
        </header>

        <div className="capabilities-intro">
          <h2 id="capabilities-heading">Built to stop what legacy security tools miss. Threat intelligence, automated response, and compliance reporting — unified in one platform your team actually trusts.</h2>
        </div>

        <div className="capabilities-grid">
          {cards.map((card) => (
            <article className="capability-card" key={card.title}>
              <div className="capability-pixels" aria-hidden="true">
                {card.pixels.map((pixel, index) => <span className="capability-pixel" key={index} style={pixelStyle(pixel)} />)}
              </div>
              <h3>{card.title}</h3>
              <div className="capability-image-wrap">
                {card.title === 'Threat Intelligence'
                  ? <ThreatParticleGlobe />
                  : <img src={card.image} alt={card.alt} />}
              </div>
              {card.cursor && <svg className="capability-cursor" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1 1L6 14L8.5 9L13.5 6.5L1 1Z" fill="white" stroke="#000" strokeLinejoin="round" strokeWidth="1.2" /></svg>}
              <p>{card.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
