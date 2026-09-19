import React from 'react';
import ParticleSphereAnimation from './ParticleSphereAnimation.jsx';
import reactIcon from '../assets/stack-icons/react.png';
import viteIcon from '../assets/stack-icons/vite.png';
import reactRouterIcon from '../assets/stack-icons/react-router.png';
import echartsIcon from '../assets/stack-icons/echarts.png';
import cssIcon from '../assets/stack-icons/css.png';
import pythonIcon from '../assets/stack-icons/python.png';
import fastapiIcon from '../assets/stack-icons/fastapi.png';
import pydanticIcon from '../assets/stack-icons/pydantic.png';
import numpyIcon from '../assets/stack-icons/numpy.png';
import uvicornIcon from '../assets/stack-icons/uvicorn.png';
import './orbit.css';

const orbits = [
  {
    duration: 18,
    icons: [
      { src: reactIcon, alt: 'React', angle: -60 },
      { src: viteIcon, alt: 'Vite', angle: 0 },
      { src: reactRouterIcon, alt: 'React Router', angle: 60 },
    ],
  },
  {
    duration: 24,
    icons: [
      { src: echartsIcon, alt: 'Apache ECharts', angle: -60 },
      { src: cssIcon, alt: 'CSS', angle: 0 },
      { src: pythonIcon, alt: 'Python', angle: 60 },
    ],
  },
  {
    duration: 30,
    icons: [
      { src: fastapiIcon, alt: 'FastAPI', angle: -67.5 },
      { src: pydanticIcon, alt: 'Pydantic', angle: -22.5 },
      { src: numpyIcon, alt: 'NumPy', angle: 22.5 },
      { src: uvicornIcon, alt: 'Uvicorn', angle: 67.5 },
    ],
  },
];

export default function OrbitingCirclesGlobe() {
  return (
    <div className="orbit-scene" role="img" aria-label="The React, Vite, React Router, Apache ECharts, CSS, Python, FastAPI, Pydantic, NumPy, and Uvicorn stack orbiting a particle sphere">
      <div className="orbit-globe">
        <ParticleSphereAnimation />
      </div>

      {orbits.map((orbit, index) => {
        const clockwise = index % 2 === 0;
        const icons = [
          ...orbit.icons,
          ...orbit.icons.map((icon) => ({ ...icon, angle: icon.angle + 180 })),
        ];

        return (
          <div className={`orbit-ring orbit-ring-${index + 1}`} key={index} aria-hidden="true">
            {icons.map((icon, iconIndex) => (
              <div
                className={`orbit-position ${clockwise ? 'orbit-cw' : 'orbit-ccw'}`}
                key={`${icon.alt}-${iconIndex}`}
                style={{ '--start-angle': `${icon.angle}deg`, '--counter-offset': `${-icon.angle}deg`, '--duration': `${orbit.duration}s` }}
              >
                <div className={`orbit-icon ${clockwise ? 'counter-cw' : 'counter-ccw'}`}>
                  <img src={icon.src} alt={icon.alt} width="32" height="32" loading="eager" draggable="false" />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
