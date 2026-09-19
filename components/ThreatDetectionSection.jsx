import React, { useState } from 'react';
import './ThreatDetectionSection.css';

const threats = [
  { title: 'Ransomware Attempt', status: 'Blocked in 0.3s' },
  { title: 'Credential Phishing', status: 'Isolated Endpoint' },
  { title: 'Insider Anomaly', status: 'Flagged for Review' },
  { title: 'DDoS Surge', status: 'Auto-Mitigated' },
];

export default function ThreatDetectionSection() {
  const [activeIndex, setActiveIndex] = useState(1);

  return (
    <section className="threat-detection-section" aria-label="Threat detection system">
      <div className="threat-detection-inner">
        <div className="threat-statement">
          <div className="threat-statement-label"><span>01</span><span>//</span><span>STATEMENT</span></div>
          <div className="threat-statement-copy">
            <span className="threat-statement-plus" aria-hidden="true">+</span>
            <h2>Every second of exposure costs more than the breach itself. Our platform detects, contains, and neutralizes threats before they reach your infrastructure — with full visibility for your security team, always on.</h2>
          </div>
        </div>

        <div className="threat-flow">
          <div className="threat-flow-heading"><span>02</span><h3>How threat detection<br className="threat-heading-break" />protects you</h3></div>

          <div className="threat-tracks">
            <div className="threat-track-dash" aria-hidden="true" />
            <div className="threat-track-dash" aria-hidden="true" />
            <div className="threat-track-dash" aria-hidden="true" />

            <div className="threat-cards">
              {threats.map((threat, index) => (
                <button
                  className={`threat-card threat-card-seq-${index + 1} ${activeIndex === index ? 'is-active' : ''}`}
                  key={threat.title}
                  type="button"
                  aria-pressed={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => setActiveIndex(index)}
                >
                  <span className="threat-card-line"><span className="threat-card-top-bar" /><span className="threat-card-pip" /></span>
                  <span className="threat-card-body">
                    <span className="threat-card-glow" />
                    <span className="threat-card-log-tag">THREAT LOG</span>
                    <span className="threat-card-title"><span aria-hidden="true">+</span>{threat.title}</span>
                    <span className="threat-card-sub"><span aria-hidden="true">☐</span>{threat.status}</span>
                  </span>
                  <svg className="threat-card-cursor" width="19" height="24" viewBox="0 0 19 24" fill="none" aria-hidden="true">
                    <path d="M1.5 1.5L7.5 21.5L11.5 14.5L18 12.5L1.5 1.5Z" fill="#ffffff" stroke="#000000" strokeLinejoin="round" strokeWidth="1.2" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
