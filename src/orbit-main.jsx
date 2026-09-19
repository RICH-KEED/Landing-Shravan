import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import OrbitingCirclesGlobe from './OrbitingCirclesGlobe.jsx';
import './orbit.css';

createRoot(document.getElementById('orbit-root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/orbit.html">
      <Routes>
        <Route path="/" element={<main className="orbit-demo"><OrbitingCirclesGlobe /></main>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
