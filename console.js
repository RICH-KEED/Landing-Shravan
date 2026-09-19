/**
 * SHRAVAN — Field Console
 * Renders two passive sensing channels:
 *   01  Wi-Fi beacon detector  (drone_wifi_detector.py --log  → timestamp,confidence,ssid,bssid,signal_pct,reasons)
 *   02  YOLOv8 camera detector (drone_camera_detector.py --serve PORT → /video MJPEG + /detections.json)
 * Channel 01 reads a CSV log (static snapshot or a live-written file); channel 02 talks to the running detector.
 */
(function initConsole() {
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');

  const tickClock = () => {
    const now = new Date();
    const el = $('consoleClock');
    if (el) el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };
  setInterval(tickClock, 1000);
  tickClock();

  // Minimal CSV parser (handles quoted fields with commas).
  const parseCSV = (text) => {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQ = false;
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  };

  const fetchCSV = async (src) => {
    const url = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return parseCSV(await res.text());
  };

  const timeOnly = (ts) => (ts && ts.includes('T') ? ts.split('T')[1].slice(0, 8) : ts || '—');
  const setLive = (dot, label, state, text) => {
    dot.classList.toggle('is-live', state === 'live');
    dot.classList.toggle('is-err', state === 'err');
    label.textContent = text;
  };

  // ---------------------------------------------------------------
  // 01 — Wi-Fi detector
  // ---------------------------------------------------------------
  const wifi = {
    rows: [],
    filter: 'all',
    selectedKey: null,
    autoTimer: null,
  };

  const wifiDot = $('wifiLiveDot');
  const wifiLabel = $('wifiLiveLabel');

  const aggregateWifi = (rows) => {
    // One entry per BSSID (fallback SSID), keeping the latest sighting + hit count.
    const byKey = new Map();
    for (const r of rows) {
      const key = r.bssid || r.ssid;
      const cur = byKey.get(key);
      if (!cur) byKey.set(key, { ...r, hits: 1, first: r.timestamp });
      else {
        cur.hits += 1;
        if (r.timestamp >= cur.timestamp) Object.assign(cur, r, { hits: cur.hits, first: cur.first });
        if (r.confidence === 'high') cur.confidence = 'high';
      }
    }
    return [...byKey.values()].sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
      return b.timestamp.localeCompare(a.timestamp);
    });
  };

  const drawWifiChart = (rows) => {
    const canvas = $('wifiChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 400, H = 72;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // Bucket by scan timestamp.
    const scans = new Map();
    for (const r of rows) {
      const s = scans.get(r.timestamp) || { high: 0, unusual: 0 };
      s[r.confidence === 'high' ? 'high' : 'unusual'] += 1;
      scans.set(r.timestamp, s);
    }
    const keys = [...scans.keys()].sort();
    $('wifiT0').textContent = keys.length ? timeOnly(keys[0]) : '—';
    $('wifiT1').textContent = keys.length ? timeOnly(keys[keys.length - 1]) : '—';
    if (!keys.length) return;

    const max = Math.max(1, ...keys.map((k) => scans.get(k).high + scans.get(k).unusual));
    const gap = 1;
    const bw = Math.max(1, (W - gap * (keys.length - 1)) / keys.length);

    // Baseline grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 3; y++) {
      const yy = H - 1 - (y / 3) * (H - 8);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }

    keys.forEach((k, i) => {
      const s = scans.get(k);
      const x = i * (bw + gap);
      const hU = (s.unusual / max) * (H - 8);
      const hH = (s.high / max) * (H - 8);
      ctx.fillStyle = 'rgba(245,158,11,0.75)';
      ctx.fillRect(x, H - hU, bw, hU);
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(x, H - hU - hH, bw, hH);
    });
  };

  const renderWifi = () => {
    const rows = wifi.rows;
    const scans = new Set(rows.map((r) => r.timestamp));
    const agg = aggregateWifi(rows);

    $('wifiScans').textContent = scans.size;
    $('wifiHigh').textContent = agg.filter((r) => r.confidence === 'high').length;
    $('wifiUnusual').textContent = agg.filter((r) => r.confidence !== 'high').length;
    $('wifiUnique').textContent = agg.length;

    const latest = rows.length ? rows.map((r) => r.timestamp).sort().at(-1) : null;
    $('wifiLatest').textContent = `latest scan: ${latest ? latest.replace('T', ' ') : '—'}`;

    drawWifiChart(rows);

    const tbody = $('wifiTbody');
    tbody.innerHTML = '';
    const visible = agg.filter((r) => wifi.filter === 'all' || r.confidence === wifi.filter);
    $('wifiEmpty').hidden = visible.length > 0;

    for (const r of visible) {
      const tr = document.createElement('tr');
      const key = r.bssid || r.ssid;
      tr.dataset.key = key;
      const conf = r.confidence === 'high' ? 'high' : 'unusual';
      const sig = Math.max(0, Math.min(100, parseInt(r.signal_pct, 10) || 0));
      const isLatest = r.timestamp === latest;
      tr.innerHTML = `
        <td><span class="conf-tag ${conf}">${conf.toUpperCase()}</span></td>
        <td class="ssid" title="${r.ssid}">${r.ssid || '(hidden)'}</td>
        <td class="dim">${r.bssid || '—'}</td>
        <td><span class="sig-bar"><span class="sig-track"><span class="sig-fill" style="width:${sig}%"></span></span>${sig}%</span></td>
        <td class="${isLatest ? '' : 'dim'}">${timeOnly(r.timestamp)}</td>
        <td class="dim">${r.hits}</td>`;
      if (key === wifi.selectedKey) tr.classList.add('is-selected');
      tr.addEventListener('click', () => {
        wifi.selectedKey = key;
        tbody.querySelectorAll('tr').forEach((x) => x.classList.toggle('is-selected', x === tr));
        $('wifiReason').textContent = `${r.ssid || '(hidden)'} · ${r.bssid} — ${r.reasons || 'no reason recorded'}`;
      });
      tbody.appendChild(tr);
    }
  };

  const loadWifi = async () => {
    const src = $('wifiSrc').value.trim();
    try {
      wifi.rows = await fetchCSV(src);
      renderWifi();
      setLive(wifiDot, wifiLabel, wifi.autoTimer ? 'live' : 'idle', wifi.autoTimer ? 'LIVE · POLLING' : 'STATIC LOG');
    } catch (err) {
      wifi.rows = [];
      renderWifi();
      setLive(wifiDot, wifiLabel, 'err', `LOAD FAILED · ${err.message}`);
    }
  };

  $('wifiReload').addEventListener('click', loadWifi);
  $('wifiSrc').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadWifi(); });

  $('wifiAuto').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (wifi.autoTimer) {
      clearInterval(wifi.autoTimer);
      wifi.autoTimer = null;
      btn.setAttribute('aria-pressed', 'false');
      setLive(wifiDot, wifiLabel, 'idle', 'STATIC LOG');
    } else {
      wifi.autoTimer = setInterval(loadWifi, 5000);
      btn.setAttribute('aria-pressed', 'true');
      loadWifi();
    }
  });

  $('wifiFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    wifi.filter = btn.dataset.filter;
    $('wifiFilters').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    renderWifi();
  });

  window.addEventListener('resize', () => drawWifiChart(wifi.rows));
  loadWifi();

  // ---------------------------------------------------------------
  // 02 — Camera detector (talks to drone_camera_detector.py --serve PORT)
  //   GET <base>/video            → MJPEG of annotated frames
  //   GET <base>/detections.json  → { total, avg_conf, peak_conf, last, recent[], model, ... }
  // ---------------------------------------------------------------
  const camDot = $('camLiveDot');
  const camLabel = $('camLiveLabel');
  const feedImg = $('feedImg');
  const feedPlaceholder = $('feedPlaceholder');
  const cam = { base: '', pollTimer: null, connected: false, lastFrames: 0, lastPoll: 0 };

  const baseUrl = () => {
    let u = $('camUrl').value.trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/video$/i, '').replace(/\/detections\.json$/i, '');
  };

  const renderCam = (snap) => {
    const rows = (snap && snap.recent) || [];
    const tbody = $('camTbody');
    tbody.innerHTML = '';
    $('camEmpty').hidden = rows.length > 0;

    $('camCount').textContent = snap && snap.total ? snap.total : '—';
    $('camAvg').textContent = snap && snap.avg_conf != null ? snap.avg_conf.toFixed(2) : '—';
    $('camPeak').textContent = snap && snap.peak_conf != null ? snap.peak_conf.toFixed(2) : '—';

    const last = snap && snap.last;
    $('camLatest').textContent = last ? `${snap.total} hits · last ${last.timestamp.replace('T', ' ')}` : '—';
    $('feedLast').textContent = `last hit: ${last ? timeOnly(last.timestamp) : '—'}`;

    if (snap && snap.model) {
      $('feedInfo').textContent = `SRC: ${snap.source ?? '—'} · ${snap.model}`;
    }

    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${timeOnly(r.timestamp)}</td>
        <td><span class="conf-tag high">${(r.class || 'drone').toUpperCase()}</span></td>
        <td>${Number(r.confidence).toFixed(2)}</td>
        <td class="dim">${Array.isArray(r.box_xyxy) ? r.box_xyxy.join(' ') : (r.box_xyxy || '—')}</td>`;
      tbody.appendChild(tr);
    }
  };

  const pollCam = async () => {
    if (!cam.base) return;
    try {
      const res = await fetch(`${cam.base}/detections.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const snap = await res.json();
      renderCam(snap);

      // Rough FPS from the server's frame counter between polls.
      const now = performance.now();
      if (cam.lastPoll && snap.frames != null) {
        const fps = ((snap.frames - cam.lastFrames) / ((now - cam.lastPoll) / 1000));
        $('feedFps').textContent = fps > 0 ? `${fps.toFixed(1)} fps` : 'MJPEG';
      }
      cam.lastFrames = snap.frames ?? 0;
      cam.lastPoll = now;

      if (!cam.connected) {
        cam.connected = true;
        setLive(camDot, camLabel, 'live', snap.total ? `LIVE · ${snap.total} HITS` : 'LIVE · SCANNING');
      } else if (snap.total) {
        camLabel.textContent = `LIVE · ${snap.total} HITS`;
      }
    } catch (err) {
      cam.connected = false;
      setLive(camDot, camLabel, 'err', 'DETECTOR UNREACHABLE');
      $('feedFps').textContent = '—';
    }
  };

  const connectFeed = () => {
    cam.base = baseUrl();
    if (!cam.base) return;
    setLive(camDot, camLabel, 'idle', 'CONNECTING…');
    $('feedInfo').textContent = `SRC: ${cam.base}`;
    feedImg.hidden = false;
    feedImg.src = `${cam.base}/video?t=${Date.now()}`;
    if (cam.pollTimer) clearInterval(cam.pollTimer);
    cam.pollTimer = setInterval(pollCam, 1000);
    pollCam();
  };

  const disconnectFeed = () => {
    if (cam.pollTimer) clearInterval(cam.pollTimer);
    cam.pollTimer = null;
    cam.base = '';
    cam.connected = false;
    feedImg.src = '';
    feedImg.hidden = true;
    feedPlaceholder.hidden = false;
    setLive(camDot, camLabel, 'idle', 'NO FEED');
    $('feedFps').textContent = '—';
  };

  feedImg.addEventListener('load', () => { feedPlaceholder.hidden = true; });
  feedImg.addEventListener('error', () => {
    if (!cam.base) return;
    feedImg.hidden = true;
    feedPlaceholder.hidden = false;
    setLive(camDot, camLabel, 'err', 'FEED UNREACHABLE');
  });

  $('camConnect').addEventListener('click', connectFeed);
  $('camDisconnect').addEventListener('click', disconnectFeed);
  $('camUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectFeed(); });

  // Try once on load — harmless if the detector isn't running yet.
  connectFeed();
})();
