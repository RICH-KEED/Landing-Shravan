import React, { useEffect, useRef, useState } from 'react';
import './ProcessSection.css';

const steps = [
  {
    letter: 'A)',
    nav: 'DETECT THREATS',
    title: 'Detect Threats',
    tag: 'RADAR_APERTURE // ACTIVE',
    stage: '01_DETECT',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1Xw6p_bi9eotGsKZEGqlEfS84vbUtggOyFOyCvXryoZcdID1VySWzBJAmBq_MfQ3kdpWfxWuVCHYQ5Xpbz8SIy0_t5CFoc8ayeAFzBaH_Ph6BQeTTrcik_udQI_pFPDF5Dx0uZ2LctkoBiAwSd6qkdHwgXvlto770btS8WqzRO2dzLEGq_LYorV4HIJq4hbJW44iuJPjoCBxrcjx6UhnTyq9H2PvyOkeBZGfFBKMHOMcO44bbJISTvBWFM',
    alt: 'Advanced cyber threat detection scanner base',
    features: [
      'Continuous network monitoring, 24/7',
      'AI-driven anomaly detection across endpoints',
      'Real-time alerts routed to your SOC',
      'Zero false-positive fatigue',
    ],
  },
  {
    letter: 'B)',
    nav: 'CONTAIN & ISOLATE',
    title: 'Contain & Isolate',
    tag: 'FORCEFIELD_GRID // ARMED',
    stage: '02_CONTAIN',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1XZA2H8MMDDE0sCkoaaTfAIjSvhngDOFrFmA7VjbE25-joaO4n8w6awwscZE3gTv2QmxhaxSlMdWg0yogRvpQiJFG0F4LuF-3O47AShzp-3fwuk7TEGpGNXp5_Wxxh_WqVm2rk48zSyPbYmZaBM8-zeM7buO2Sq6dKhgjn1IEv3ysE5hcc7p7eJK5DfaF_5o0nhpStw5qtEqV33bDsx9xwCAbkkhdmCjGjyigJ7bdsnJyrlGflVmmuh4ME',
    alt: 'Automated containment matrix with floating energy forcefield cube',
    features: [
      'Automated endpoint quarantine',
      'Instant credential revocation',
      'Network segmentation on trigger',
      'Playbook-driven incident response',
    ],
  },
  {
    letter: 'C)',
    nav: 'REPORT & COMPLY',
    title: 'Report & Comply',
    tag: 'AUDIT_VAULT // CERTIFIED',
    stage: '03_REPORT',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1X-LZTk7s4beW79iP6ly7Hi7KA-Xc1IYCIoLrzBqTxUZgR3aXQgaG6RHszcv-ZxWmm3BQLH_eEjBxGtrnkib3ubZKQGO97WM6sByq0zOhalRqYtOaw3nG8NT-PapvXvxZKgy5_vyRReyyBrbOjvCUJHvc2qZgupOsDVHwc0m2bd5o_snM-eprYsBoMW6wrzaHCASF-A9uRl8Bcz1Av3ZCZ7sY-xONPeUWb3tQuP7wFnBVEUYt1KZkRDj24',
    alt: 'Cybersecurity compliance cryptographic tower',
    features: [
      'Audit-ready compliance logs',
      'SOC 2, ISO 27001, GDPR mapping',
      'Executive-level threat summaries',
    ],
  },
];

export default function ProcessSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [beaconY, setBeaconY] = useState(0);
  const rowsRef = useRef([]);
  const railRef = useRef(null);
  const activeRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    const rows = rowsRef.current;

    function updateBeacon(index = activeRef.current) {
      const rail = railRef.current;
      const row = rows[index];
      if (!rail || !row) return;
      const railRect = rail.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const center = rowRect.top + rowRect.height / 2 - railRect.top;
      setBeaconY(Math.max(16, Math.min(railRect.height - 16, center)));
    }

    function activate(index) {
      if (index < 0 || index >= rows.length) return;
      activeRef.current = index;
      setActiveIndex(index);
      updateBeacon(index);
    }

    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewportCenter = window.innerHeight / 2;
        let closest = 0;
        let minDistance = Infinity;
        rows.forEach((row, index) => {
          if (!row) return;
          const rect = row.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
          if (distance < minDistance) {
            minDistance = distance;
            closest = index;
          }
        });
        activate(closest);
      });
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= .45) {
          activate(Number(entry.target.dataset.step));
        }
      }
    }, { threshold: [.2, .45, .7] });

    rows.forEach((row) => row && observer.observe(row));
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    timer = window.setTimeout(() => updateBeacon(0), 120);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  function goToStep(index) {
    const target = rowsRef.current[index];
    if (!target) return;
    activeRef.current = index;
    setActiveIndex(index);
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  return (
    <section className="process-section" aria-label="Threat Shield process">
      <div className="process-inner">
        <header className="process-header">
          <div className="process-header-left">
            <span className="process-number">03</span>
            <div className="process-header-copy">
              <div className="process-kicker"><span>//</span><span>PROCESS</span></div>
              <p>From first signal to full remediation — our process is built to move faster than the attacker, with zero guesswork for your team.</p>
            </div>
          </div>
          <div className="process-crosshair" aria-hidden="true"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25"><path d="M7 1v12M1 7h12" strokeLinecap="round" /></svg></div>
        </header>

        <div className="process-grid">
          <aside className="process-aside" aria-label="Process steps">
            <div className="process-aside-sticky">
              <nav className="process-nav" aria-label="Process steps navigation">
                {steps.map((step, index) => (
                  <button className={`process-nav-step ${activeIndex === index ? 'is-current' : ''}`} type="button" key={step.stage} onClick={() => goToStep(index)} aria-current={activeIndex === index ? 'step' : undefined}>
                    <span>{step.letter}</span><span>{step.nav}</span>
                  </button>
                ))}
              </nav>
              <div className="process-telemetry">
                <div><span className="process-telemetry-dot" /> <span>TELEMETRY // SYNCED</span></div>
                <span>STG: <span>{steps[activeIndex].stage}</span></span>
              </div>
            </div>
            <div className="process-rail" ref={railRef} aria-hidden="true">
              <div className="process-rail-progress" style={{ height: beaconY }} />
              <span className="process-beacon" style={{ top: beaconY }} />
            </div>
            <button className="process-beacon-button" type="button" style={{ top: beaconY }} onClick={() => goToStep((activeIndex + 1) % steps.length)} aria-label="Go to next process step" />
          </aside>

          <div className="process-rows">
            {steps.map((step, index) => (
              <article className={`process-row ${activeIndex === index ? 'is-active' : 'is-inactive'}`} data-step={index} ref={(element) => { rowsRef.current[index] = element; }} key={step.stage}>
                <div className="process-row-title">
                  <span className="process-stage-tag">// STAGE 0{index + 1}</span>
                  <h2>{step.title}</h2>
                  <p>{step.tag}</p>
                </div>
                <div className="process-image-wrap"><img src={step.image} alt={step.alt} loading={index === 0 ? 'eager' : 'lazy'} /></div>
                <ul className="process-features">
                  {step.features.map((feature) => <li key={feature}><span className="process-feature-box" aria-hidden="true">✓</span><span>{feature}</span></li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>

        <footer className="process-footer"><span>// SEC_OPS_PROTOCOL_v4.2</span><span>ZERO_GUESSWORK_PIPELINE</span><span>READY</span></footer>
      </div>
    </section>
  );
}
