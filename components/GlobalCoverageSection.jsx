import React, { useState } from 'react';
import OrbitingCirclesGlobe from '../src/OrbitingCirclesGlobe.jsx';
import './GlobalCoverageSection.css';

const steps = [['A)', 'DETECT THREATS'], ['B)', 'CONTAIN & ISOLATE'], ['C)', 'REPORT & COMPLY']];
const statuses = ['LOW THREAT', 'ACTIVE THREAT', 'VULNERABLE', 'STATUS'];
const sensors = [
  { top: 260, right: 172, number: '42' }, { top: 320, right: 320, number: '18' },
  { top: 490, right: 400, number: '09' }, { top: 505, right: 92, number: '88' },
  { top: 425, right: 258, number: '31' }, { top: 330, right: 135, number: '64' },
];

export default function GlobalCoverageSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [activeStatus, setActiveStatus] = useState(1);

  return (
    <section className="global-coverage-section" aria-labelledby="global-coverage-heading">
      <header className="global-coverage-header" data-purpose="global-section-indicator">
        <div className="global-coverage-kicker"><span>04</span><span>//</span><span>GLOBAL COVERAGE</span></div>
        <div className="global-coverage-heading-row">
          <h2 id="global-coverage-heading">24/7 threat visibility. Monitor attacks across all regions, endpoints, and cloud environments in real time from one command center.</h2>
          <a className="global-coverage-link" href="#learn-more" data-purpose="action-button">Learn More <span aria-hidden="true">↗</span></a>
        </div>
      </header>
      <div className="global-coverage-stage" data-purpose="command-center-stage">
        <div className="global-coverage-dashboard">
          <div className="global-coverage-copy-panel" data-purpose="pipeline-indicators">
            <div className="global-coverage-steps" aria-label="Security workflow">
              {steps.map(([letter, label], index) => (
                <button key={letter} type="button" className={activeStep === index ? 'is-current' : ''} onClick={() => setActiveStep(index)} aria-pressed={activeStep === index}>
                  <span>{letter}</span><span>{label}</span>
                </button>
              ))}
            </div>
            <div className="global-coverage-copy-bottom">
              <h3>To clone patterns anomalies digital culture. Language synergy.</h3>
              <p>Our global sensor network tracks emerging threats the moment they surface, correlating signals across continents before they reach your perimeter.</p>
            </div>
          </div>
          <div className="global-coverage-visual-panel" data-purpose="telemetry-display-container">
            <div className="global-coverage-grid" aria-hidden="true" />
            <div className="global-coverage-horizon" aria-hidden="true" />
            <div className="global-coverage-status" data-purpose="status-filters" aria-label="Threat status filter">
              {statuses.map((status, index) => (
                <button key={status} type="button" className={activeStatus === index ? 'is-current' : ''} onClick={() => setActiveStatus(index)} aria-pressed={activeStatus === index}>{status}</button>
              ))}
            </div>
            <div className="global-coverage-window-marks" aria-hidden="true"><i /><i /><i /></div>
            <div className="global-coverage-graphic">
              <div className="global-coverage-orbit"><OrbitingCirclesGlobe /></div>
              {sensors.map(({ top, right, number }) => (
                <div key={number} className="global-coverage-sensor" style={{ top, right }} title={`Telemetry Sensor Station #${number}`} tabIndex={0} aria-label={`Telemetry Sensor Station #${number}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
