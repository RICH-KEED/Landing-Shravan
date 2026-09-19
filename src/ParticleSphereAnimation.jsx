import React, { useEffect, useMemo, useRef } from 'react';

const PARTICLE_COUNT = 9000;
const RADIUS = 275;
const SIZE = 575;
const COLORS = [
  '#ea580c',
  '#d97706',
  '#84cc16',
  '#f1f5f9',
  '#94a3b8',
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#f97316',
];

function generateSpherePoints(count) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const z = Math.random() * 2 - 1;
    const theta = Math.random() * 2 * Math.PI;
    const radiusAtZ = Math.sqrt(1 - z * z);
    const radius = RADIUS * (0.97 + Math.random() * 0.06);
    const x = radius * radiusAtZ * Math.cos(theta);
    const y = radius * radiusAtZ * Math.sin(theta);
    const pointZ = radius * z;
    const yFactor = (y + RADIUS) / (2 * RADIUS);
    let colorIndex;

    if (Math.random() > 0.9) colorIndex = 7;
    else if (yFactor > 0.6) colorIndex = Math.floor(Math.random() * 3);
    else if (yFactor < 0.4) colorIndex = 3 + Math.floor(Math.random() * 3);
    else colorIndex = Math.floor(Math.random() * COLORS.length);

    points.push({ x, y, z: pointZ, color: COLORS[colorIndex] });
  }
  return points;
}

export default function ParticleSphereAnimation() {
  const canvasRef = useRef(null);
  const points = useMemo(() => generateSpherePoints(PARTICLE_COUNT), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: true });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rotation = 0;
    let frame;

    canvas.width = SIZE;
    canvas.height = SIZE;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const draw = () => {
      context.clearRect(0, 0, SIZE, SIZE);
      rotation += 0.003;
      context.save();
      context.translate(SIZE / 2, SIZE / 2);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      const rotatedPoints = points.map((point) => {
        const x = point.x * cos - point.z * sin;
        const z = point.x * sin + point.z * cos;
        const scale = (z + RADIUS) / (2 * RADIUS);
        const distance = Math.sqrt(x * x + point.y * point.y);
        const rimFactor = Math.min(distance / RADIUS, 1);
        const opacity = Math.max(0.1, Math.pow(rimFactor, 3) * 0.8) * (0.4 + 0.6 * scale);
        const size = (0.4 + 0.8 * scale) * 1.5;
        return { x, y: point.y, z, color: point.color, opacity, size };
      });

      rotatedPoints.sort((a, b) => a.z - b.z);
      for (const point of rotatedPoints) {
        context.beginPath();
        context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        context.fillStyle = point.color;
        context.globalAlpha = point.opacity;
        context.fill();
      }
      context.globalAlpha = 1;
      context.restore();
      if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
    };

    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      draw();
    };
    reducedMotion.addEventListener('change', onMotionChange);
    draw();

    return () => {
      cancelAnimationFrame(frame);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, [points]);

  return <canvas ref={canvasRef} className="orbit-globe-canvas" width={SIZE} height={SIZE} aria-hidden="true" />;
}
