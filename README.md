# SHRAVAN — Smart Hunt for Radar Activity via Adaptive Narrowband Scan

Landing page + field console for **SIH26055 — "Smart Scan Strategy for Electronic Warfare"**.

SHRAVAN replaces a blind, fixed frequency sweep with a closed
**Remember → Predict → Decide → Listen → Update** loop for a narrowband receiver that can
only listen to one slice of the spectrum at a time. This repo holds the web front-end
(landing page + live field console) and the passive sensing scripts used in the physical
evaluator scenario (Wi-Fi drone detection + YOLOv8 camera detection).

---

## Repository layout

```
.
├── index.html            Landing page (Problem → Closed Loop → Process → Capabilities)
├── console.html          Field console: Wi-Fi detector + YOLOv8 camera detector, side by side
├── console.css / .js     Console styling and data layer
├── style.css / script.js Landing page styling + interactions (hero, nav pill, sections)
├── components/*.css      Section styles for the landing page
├── public/data/
│   └── detections.csv    Snapshot Wi-Fi detection log shown by the console (channel 01)
├── assets/               Images, stack icons, satellite/aircraft art
├── Shravan/              Field sensing scripts (Python, Windows)
│   ├── drone_wifi_detector.py     Passive Wi-Fi beacon scanner (netsh), flags unusual SSIDs/OUIs
│   ├── drone_camera_detector.py   YOLOv8 drone detector with --serve HTTP output for the console
│   ├── hotspot_manager.py         Tkinter view of devices joined to the laptop's Mobile Hotspot
│   ├── detections.csv             Example log produced by drone_wifi_detector.py --log
│   └── requirements.txt
├── orbit.html, src/      Standalone React demo of the orbiting-stack globe (not linked)
└── vite.config.js
```

---

## 1. Web front-end (landing page + console)

```powershell
npm install
npm run dev          # http://127.0.0.1:5173/
npm run build        # production build → dist/  (index, console and orbit pages)
```

- **Landing page** — `http://127.0.0.1:5173/`. The **Open Console** button in the header
  navigates to the field console.
- **Field console** — `http://127.0.0.1:5173/console.html`
  - **01 Wi-Fi Detector** reads a CSV written by `drone_wifi_detector.py --log`.
    Default source is `data/detections.csv` (the committed snapshot). Point the *LOG SOURCE*
    field at a live-written file and toggle **AUTO 5s** to poll it during a demo.
    Click a row to see the detector's reason string.
  - **02 Camera Detector** connects to a running `drone_camera_detector.py --serve <port>`.
    It shows the **annotated** MJPEG feed (YOLO boxes drawn), live fps, hit counters and the
    detection log. Default *DETECTOR URL* is `http://127.0.0.1:8090`; change it to the IP of
    whichever laptop runs the detector.

---

## 2. Field detectors (`Shravan/`)

All three scripts are **passive / receive-only** in the RF sense — nothing is transmitted.

### 2.1 Install

```powershell
cd Shravan
# GPU laptop (RTX 5070 = Blackwell → needs CUDA 12.8 wheels):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

### 2.2 Model weights (not in git)

`*.pt` files are git-ignored (the custom model is 137 MB, over GitHub's 100 MB limit).
Download and place them in `Shravan/`:

| File | Source | Notes |
|---|---|---|
| `drone_yolov8x_best.pt` | https://huggingface.co/doguilmak/Drone-Detection-YOLOv8x (MIT) | Single `drone` class, trained on the Kaggle YOLO Drone Detection dataset. **Default.** |
| `yolov8n.pt` | auto-downloaded by ultralytics on first use | Stock COCO model, **no drone class** — fallback only (`--classes airplane bird kite frisbee`). |

### 2.3 `drone_camera_detector.py` — YOLOv8 camera detector

Default source is **DroidCam**: install the DroidCam app on the phone and the Windows
client on the laptop, connect (USB or Wi-Fi), press *Start* in the client. The script finds
the `DroidCam Source *` virtual camera **by device name** (via `pygrabber`/DirectShow), tries
each DroidCam device until one delivers frames, and **never falls back to the built-in
webcam** — if DroidCam isn't running it keeps retrying.

```powershell
# GPU laptop — full resolution, infer every frame, stream to the console on :8090
python drone_camera_detector.py --serve 8090 --imgsz 640 --infer-every 1 --conf 0.5

# CPU-only laptop — lighter settings
python drone_camera_detector.py --serve 8090 --imgsz 320 --infer-every 5

# Other sources
python drone_camera_detector.py --url http://192.168.137.5:8080/video   # IP Webcam app
python drone_camera_detector.py --url 2                                 # explicit DirectShow index
```

`--serve PORT` starts a stdlib HTTP server exposing:

| Endpoint | Content |
|---|---|
| `/video` | MJPEG stream of annotated frames |
| `/detections.json` | totals, avg/peak confidence, last hit, 200 most recent detections, model info |
| `/status` | same without the `recent` list |

CORS is open so the console can read it from another origin/laptop. `--serve-host 127.0.0.1`
restricts it to localhost. Press `q` in the OpenCV window (or add `--no-display`) to stop.

**Performance reference** (measured):

| Hardware | Model @ imgsz | ms / inference |
|---|---|---|
| i3-1215U, CPU | yolov8x @ 320 | ~1000 ms (≈1 fps) |
| i3-1215U, CPU | yolov8x @ 640 | ~2350 ms |
| i3-1215U, CPU | yolov8n @ 320 | ~180 ms |
| RTX 5070 | yolov8x @ 640 | real-time |

### 2.4 `drone_wifi_detector.py` — passive Wi-Fi beacon scanner

Uses `netsh wlan show networks mode=bssid`. Classifies by **exclusion**: SSIDs that match
everyday device patterns (phones, ISP routers, printers, TVs) are ignored; anything else is
`unusual`; `unusual` + a drone/IoT keyword or a known drone-vendor MAC OUI is `high`.

```powershell
python drone_wifi_detector.py                     # scan once
python drone_wifi_detector.py --watch --interval 3 --log detections.csv
# to feed the console live:
python drone_wifi_detector.py --watch --log ..\public\data\detections.csv
```

CSV columns: `timestamp,confidence,ssid,bssid,signal_pct,reasons`.

### 2.5 `hotspot_manager.py` — hotspot client viewer

Tkinter GUI that lists devices joined to the laptop's Windows Mobile Hotspot (reads the ARP
table — passive). The optional *Disconnect* button adds a **local** Windows Firewall rule for
that client's IP (needs admin); nothing is sent over the air.

---

## 3. Demo setup (two laptops)

```
[phone: DroidCam] ──USB/Wi-Fi──► [GPU laptop]  drone_camera_detector.py --serve 8090
                                       │
                                  hotspot / LAN
                                       │
                               [any laptop]  npm run dev  →  console.html
                                             DETECTOR URL = http://<gpu-laptop-ip>:8090
```

1. GPU laptop: start DroidCam client, then the detector with `--serve 8090`.
2. Allow Python through Windows Firewall on private networks (or
   `netsh advfirewall firewall add rule name=SHRAVAN dir=in action=allow protocol=TCP localport=8090`).
3. Open the console, enter the GPU laptop's IPv4 in *DETECTOR URL*, click **CONNECT**.
4. Optionally run `drone_wifi_detector.py --watch --log public/data/detections.csv` on the
   laptop serving the site and toggle **AUTO 5s** in panel 01.

> A Wi-Fi peak alone is never labelled "the drone" — the camera channel is the confirmation.

---

## Stack

Vite 7 · vanilla HTML/CSS/JS (landing + console) · Three.js (globe) · React 19 (orbit demo)
· Python 3.12 · Ultralytics YOLOv8 · OpenCV · pygrabber
