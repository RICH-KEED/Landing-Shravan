/**
 * SHRAVAN — Field Console
 * Renders two passive sensing channels:
 *   01  Wi-Fi beacon detector  (drone_wifi_detector.py --serve PORT → /detections.json; CSV snapshot as fallback)
 *   02  YOLOv8 camera detector (drone_camera_detector.py --serve PORT → /video MJPEG + /detections.json)
 * Both panels poll their running detector over HTTP; panel 01 shows the committed CSV snapshot until one is reachable.
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
  //   Live:     drone_wifi_detector.py --serve PORT → GET <base>/detections.json
  //             { scan_count, last_scan, networks_now, devices[], history[] }
  //   Fallback: the committed CSV snapshot (data/detections.csv) until a
  //             detector is reachable.
  // ---------------------------------------------------------------
  const SNAPSHOT_CSV = 'data/detections.csv';
  const emptyWifiModel = () => ({ devices: [], history: [], scanCount: 0, lastScan: null, networksNow: null });
  const wifi = {
    model: emptyWifiModel(),
    filter: 'all',
    selectedKey: null,
    base: '',
    pollTimer: null,
    connected: false,
  };

  const wifiDot = $('wifiLiveDot');
  const wifiLabel = $('wifiLiveLabel');

  // CSV rows → same shape the live endpoint returns.
  const modelFromCSV = (rows) => {
    const byKey = new Map();
    const scans = new Map();
    for (const r of rows) {
      const key = r.bssid || r.ssid;
      const conf = r.confidence === 'high' ? 'high' : 'unusual';
      const cur = byKey.get(key);
      if (!cur) {
        byKey.set(key, { ...r, confidence: conf, hits: 1, first_seen: r.timestamp, last_seen: r.timestamp });
      } else {
        cur.hits += 1;
        if (r.timestamp >= cur.last_seen) {
          Object.assign(cur, { ssid: r.ssid, signal_pct: r.signal_pct, reasons: r.reasons, last_seen: r.timestamp });
        }
        if (conf === 'high') cur.confidence = 'high';
      }
      const sc = scans.get(r.timestamp) || { timestamp: r.timestamp, high: 0, unusual: 0 };
      sc[conf] += 1;
      scans.set(r.timestamp, sc);
    }
    const history = [...scans.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return {
      devices: [...byKey.values()],
      history,
      scanCount: history.length,
      lastScan: history.length ? history[history.length - 1].timestamp : null,
      networksNow: null,
    };
  };

  const modelFromLive = (snap) => ({
    devices: (snap.devices || []).map((d) => ({
      ...d,
      confidence: d.confidence === 'high' ? 'high' : 'unusual',
      reasons: Array.isArray(d.reasons) ? d.reasons.join('; ') : (d.reasons || ''),
    })),
    history: snap.history || [],
    scanCount: snap.scan_count || 0,
    lastScan: snap.last_scan || null,
    networksNow: snap.networks_now ?? null,
  });

  const drawWifiChart = (history) => {
    const canvas = $('wifiChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 400, H = 72;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    $('wifiT0').textContent = history.length ? timeOnly(history[0].timestamp) : '—';
    $('wifiT1').textContent = history.length ? timeOnly(history[history.length - 1].timestamp) : '—';
    if (!history.length) return;

    const max = Math.max(1, ...history.map((h) => h.high + h.unusual));
    const gap = 1;
    const bw = Math.max(1, (W - gap * (history.length - 1)) / history.length);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 3; y++) {
      const yy = H - 1 - (y / 3) * (H - 8);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }

    history.forEach((h, i) => {
      const x = i * (bw + gap);
      const hU = (h.unusual / max) * (H - 8);
      const hH = (h.high / max) * (H - 8);
      ctx.fillStyle = 'rgba(245,158,11,0.75)';
      ctx.fillRect(x, H - hU, bw, hU);
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(x, H - hU - hH, bw, hH);
    });
  };

  const reasonText = (d) => `${d.ssid || '(hidden)'} · ${d.bssid} — ${d.reasons || 'no reason recorded'}`;

  const renderWifi = () => {
    const m = wifi.model;
    const devices = [...m.devices].sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
      return (b.last_seen || '').localeCompare(a.last_seen || '');
    });

    $('wifiScans').textContent = m.scanCount || '—';
    $('wifiHigh').textContent = devices.filter((d) => d.confidence === 'high').length;
    $('wifiUnusual').textContent = devices.filter((d) => d.confidence !== 'high').length;
    $('wifiUnique').textContent = devices.length;

    const netInfo = m.networksNow != null ? ` · ${m.networksNow} networks in range` : '';
    $('wifiLatest').textContent = `latest scan: ${m.lastScan ? m.lastScan.replace('T', ' ') : '—'}${netInfo}`;

    drawWifiChart(m.history);

    const tbody = $('wifiTbody');
    tbody.innerHTML = '';
    const visible = devices.filter((d) => wifi.filter === 'all' || d.confidence === wifi.filter);
    $('wifiEmpty').hidden = visible.length > 0;

    for (const d of visible) {
      const tr = document.createElement('tr');
      const key = d.bssid || d.ssid;
      const sig = Math.max(0, Math.min(100, parseInt(d.signal_pct, 10) || 0));
      const isLatest = d.last_seen === m.lastScan;
      tr.innerHTML = `
        <td><span class="conf-tag ${d.confidence}">${d.confidence.toUpperCase()}</span></td>
        <td class="ssid" title="${d.ssid}">${d.ssid || '(hidden)'}</td>
        <td class="dim">${d.bssid || '—'}</td>
        <td><span class="sig-bar"><span class="sig-track"><span class="sig-fill" style="width:${sig}%"></span></span>${sig}%</span></td>
        <td class="${isLatest ? '' : 'dim'}">${timeOnly(d.last_seen)}</td>
        <td class="dim">${d.hits}</td>`;
      if (key === wifi.selectedKey) tr.classList.add('is-selected');
      tr.addEventListener('click', () => {
        wifi.selectedKey = key;
        tbody.querySelectorAll('tr').forEach((x) => x.classList.toggle('is-selected', x === tr));
        $('wifiReason').textContent = reasonText(d);
      });
      tbody.appendChild(tr);
    }

    // Keep the reason strip in sync with the selected device as scans update it.
    if (wifi.selectedKey) {
      const sel = devices.find((d) => (d.bssid || d.ssid) === wifi.selectedKey);
      if (sel) $('wifiReason').textContent = reasonText(sel);
    }
  };

  const loadWifiSnapshot = async () => {
    try {
      wifi.model = modelFromCSV(await fetchCSV(SNAPSHOT_CSV));
    } catch {
      wifi.model = emptyWifiModel();
    }
    renderWifi();
  };

  const wifiBaseUrl = () => {
    let u = $('wifiUrl').value.trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/detections\.json$/i, '');
  };

  const pollWifi = async () => {
    if (!wifi.base) return;
    try {
      const res = await fetch(`${wifi.base}/detections.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const snap = await res.json();
      wifi.model = modelFromLive(snap);
      wifi.connected = true;
      renderWifi();
      setLive(wifiDot, wifiLabel, 'live', `LIVE · SCAN ${snap.scan_count || 0}`);
    } catch {
      // Keep whatever is on screen (last live data, or the snapshot) and flag the state.
      setLive(wifiDot, wifiLabel, 'err', wifi.connected ? 'DETECTOR LOST · RETRYING' : 'DETECTOR UNREACHABLE · SNAPSHOT');
    }
  };

  const connectWifi = () => {
    wifi.base = wifiBaseUrl();
    if (!wifi.base) return;
    setLive(wifiDot, wifiLabel, 'idle', 'CONNECTING…');
    if (wifi.pollTimer) clearInterval(wifi.pollTimer);
    wifi.pollTimer = setInterval(pollWifi, 2000);
    pollWifi();
  };

  const disconnectWifi = async () => {
    if (wifi.pollTimer) clearInterval(wifi.pollTimer);
    wifi.pollTimer = null;
    wifi.base = '';
    wifi.connected = false;
    await loadWifiSnapshot();
    setLive(wifiDot, wifiLabel, 'idle', 'SNAPSHOT');
  };

  $('wifiConnect').addEventListener('click', connectWifi);
  $('wifiDisconnect').addEventListener('click', disconnectWifi);
  $('wifiUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectWifi(); });

  $('wifiFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    wifi.filter = btn.dataset.filter;
    $('wifiFilters').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    renderWifi();
  });

  window.addEventListener('resize', () => drawWifiChart(wifi.model.history));

  // Show the snapshot immediately, then try the live detector.
  loadWifiSnapshot().then(connectWifi);

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
