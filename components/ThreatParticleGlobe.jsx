import React, { useEffect, useMemo, useRef } from 'react';

const SIZE = 240;
const RADIUS = 102;
const POINT_COUNT = 2800;
const PALETTE = ['#0284c7', '#2563eb', '#38bdf8', '#67e8f9', '#e2e8f0'];

function makePoints() {
  return Array.from({ length: POINT_COUNT }, () => {
    const y = Math.random() * 2 - 1;
    const longitude = Math.random() * Math.PI * 2;
    const atY = Math.sqrt(1 - y * y);
    const radius = RADIUS * (0.97 + Math.random() * 0.06);
    return {
      x: Math.cos(longitude) * atY * radius,
      y: y * radius,
      z: Math.sin(longitude) * atY * radius,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      highlight: Math.sin(longitude * 2 + y * 3) > 0.7 ? 1.6 : 1,
    };
  });
}

export default function ThreatParticleGlobe() {
  const canvasRef = useRef(null);
  const points = useMemo(makePoints, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: true });
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let rotation = 0;
    let previousTime = 0;
    let frame;

    const render = (time = 0) => {
      if (previousTime && time) rotation += Math.min(time - previousTime, 50) * 0.00065;
      previousTime = time;
      context.clearRect(0, 0, SIZE, SIZE);
      context.save();
      context.translate(SIZE / 2, SIZE / 2);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rotated = points.map((point) => {
        const x = point.x * cos - point.z * sin;
        const z = point.x * sin + point.z * cos;
        const depth = (z + RADIUS) / (2 * RADIUS);
        const rim = Math.min(Math.hypot(x, point.y) / RADIUS, 1);
        return {
          x,
          y: point.y,
          z,
          color: point.color,
          size: 0.45 + depth * 1.25,
          opacity: Math.min(1, (0.16 + Math.pow(rim, 2) * 0.7) * (0.45 + depth * 0.55) * point.highlight),
        };
      }).sort((a, b) => a.z - b.z);

      for (const point of rotated) {
        context.beginPath();
        context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        context.fillStyle = point.color;
        context.globalAlpha = point.opacity;
        context.fill();
      }
      context.globalAlpha = 1;
      context.restore();
      if (!reducedMotion.matches) frame = requestAnimationFrame(render);
    };

    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      previousTime = 0;
      render();
    };
    reducedMotion.addEventListener('change', onMotionChange);
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, [points]);

  return <canvas className="capability-particle-globe" ref={canvasRef} width={SIZE} height={SIZE} role="img" aria-label="Rotating particle globe for threat intelligence" />;
}
