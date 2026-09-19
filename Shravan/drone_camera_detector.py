"""
Drone Camera Detector
-----------------------
Reads a live video feed from a camera source (a phone acting as an IP
camera, a USB/wired webcam or phone-as-webcam app, or a laptop's built-in
camera) and runs a YOLOv8 object-detection model (via the `ultralytics`
package) on each frame, flagging any detected drones.

By default this uses a custom-trained model (drone_yolov8x_best.pt) with
a single dedicated "drone" class -- trained on the public "YOLO Drone
Detection Dataset" (Kaggle), sourced from
https://github.com/doguilmak/Drone-Detection-YOLOv8x (MIT licensed),
weights hosted at
https://huggingface.co/doguilmak/Drone-Detection-YOLOv8x .
This is a real drone classifier, not a heuristic -- unlike the stock
COCO-trained yolov8n.pt (which has NO "drone" class at all).

Trade-off: this is the YOLOv8x (extra-large) variant, which is far more
accurate than the default "nano" model but noticeably slower per frame
on CPU. If detection feels laggy, pass --model yolov8n.pt --classes
airplane bird kite frisbee to fall back to the fast stock model (with
the caveat that it can only flag "aerial-object-shaped" classes, not
actually recognize a drone).

Setup -- camera source options:
  A) DroidCam (DEFAULT, --url droidcam): install DroidCam on the phone and
     the Windows client, connect (USB or Wi-Fi) and press Start in the
     client. The script finds the "DroidCam Source" virtual camera BY NAME
     (via pygrabber / DirectShow), so it never accidentally opens the
     laptop's built-in webcam. If DroidCam isn't found it keeps retrying
     rather than falling back to another camera.
  B) Android phone over Wi-Fi via "IP Webcam": pass its URL with --url
     (e.g. http://192.168.137.5:8080/video).
  C) An explicit camera index (--url 0, --url 1, ...) if you really want a
     specific DirectShow device.

Requirements:
    pip install ultralytics opencv-python pygrabber
    (pygrabber is only needed for the default --url droidcam name lookup)

Usage:
    python drone_camera_detector.py                       # DroidCam, auto-found by name
    python drone_camera_detector.py --serve 8090          # DroidCam + web console feed
    python drone_camera_detector.py --url http://192.168.137.5:8080/video
    python drone_camera_detector.py --url 1 --model yolov8n.pt --classes airplane bird kite frisbee
    python drone_camera_detector.py --url 1 --no-display --log detections.csv
    python drone_camera_detector.py --url 1 --conf 0.25 --debug
    python drone_camera_detector.py --url 1 --serve 8090   # also stream to the web console

--serve PORT starts a tiny local HTTP server (stdlib only) exposing:
    /video            MJPEG stream of the ANNOTATED frames (boxes drawn)
    /detections.json  recent flagged detections + running stats
    /status           model / class / uptime info
so the SHRAVAN field console (console.html) can mirror the live feed.
"""

import argparse
import collections
import csv
import datetime
import json
import logging
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_MODEL = "drone_yolov8x_best.pt"
DEFAULT_TARGET_CLASSES = ["drone"]
DEFAULT_SOURCE = "droidcam"
DROIDCAM_NAME_HINT = "droidcam"


def list_dshow_cameras():
    """Return DirectShow camera names in index order (same order OpenCV's
    CAP_DSHOW backend uses), or None if pygrabber isn't installed."""
    try:
        from pygrabber.dshow_graph import FilterGraph
    except ImportError:
        return None
    try:
        return FilterGraph().get_input_devices()
    except Exception:
        return []


def find_droidcam_indices(logger=None):
    """DirectShow indices of every device whose name contains 'DroidCam'
    (the client registers more than one, and not all of them open), or an
    empty list if none are present / enumerable."""
    names = list_dshow_cameras()
    if names is None:
        if logger:
            logger.error(
                "pygrabber is not installed, so the DroidCam device can't be located by name. "
                "Run:  pip install pygrabber   (or pass an explicit --url)."
            )
        return []
    found = [(i, n) for i, n in enumerate(names) if DROIDCAM_NAME_HINT in n.lower()]
    if not found and logger:
        logger.warning(
            f"No DroidCam device found. Cameras present: {names or '[]'}. "
            "Open the DroidCam Windows client, connect the phone and press Start."
        )
    return found


def open_droidcam(cv2, logger=None):
    """Open the first DroidCam DirectShow device that actually yields a frame.
    Never falls back to a non-DroidCam camera."""
    for idx, name in find_droidcam_indices(logger):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        if cap.isOpened() and cap.read()[0]:
            if logger:
                logger.info(f"DroidCam opened: '{name}' (DirectShow index {idx})")
            return cap
        cap.release()
        if logger:
            logger.debug(f"'{name}' (index {idx}) did not deliver frames, trying next")
    return None


class MjpegStream:
    """
    Reads a raw MJPEG-over-HTTP feed (as served by apps like Android's
    "IP Webcam") by hand: pull bytes off the socket and split out each
    JPEG frame on its start/end-of-image markers.

    cv2.VideoCapture(url) is unreliable against this kind of stream --
    it frequently just hangs forever without erroring, because OpenCV's
    FFMPEG backend doesn't cleanly handle the multipart/x-mixed-replace
    content type these apps use. Reading and decoding the JPEGs directly
    sidesteps that entirely and is the standard workaround for this exact
    class of IP camera app.
    """

    def __init__(self, url, timeout=10, chunk_size=4096):
        self.url = url
        self.timeout = timeout
        self.chunk_size = chunk_size
        self._response = None
        self._buffer = b""

    def open(self):
        self._response = urllib.request.urlopen(self.url, timeout=self.timeout)
        self._buffer = b""

    def close(self):
        if self._response is not None:
            try:
                self._response.close()
            except Exception:
                pass
            self._response = None

    def read(self):
        """Return the next decoded JPEG frame as raw bytes, or None on stream end/error."""
        if self._response is None:
            return None

        while True:
            start = self._buffer.find(JPEG_SOI)
            if start != -1:
                end = self._buffer.find(JPEG_EOI, start + 2)
                if end != -1:
                    frame = self._buffer[start:end + 2]
                    self._buffer = self._buffer[end + 2:]
                    return frame

            chunk = self._response.read(self.chunk_size)
            if not chunk:
                return None
            self._buffer += chunk

            # Avoid unbounded growth if we never find a marker (corrupt stream).
            if len(self._buffer) > 5_000_000:
                self._buffer = self._buffer[-1_000_000:]


class ConsoleServer:
    """
    Minimal threaded HTTP server that publishes the latest annotated JPEG as an
    MJPEG stream plus a JSON view of recent detections. Receive-only in the RF
    sense: it only listens on localhost (or the interface you bind) so a browser
    on this machine / hotspot can watch what the detector sees.
    """

    def __init__(self, port, host="0.0.0.0", max_recent=200):
        self.port = port
        self.host = host
        self.frame = None            # latest annotated JPEG bytes
        self.frame_lock = threading.Condition()
        self.recent = collections.deque(maxlen=max_recent)
        self.total = 0
        self.frames = 0
        self.started = time.time()
        self.info = {}
        self._server = None

    # -- called from the detector loop --------------------------------
    def push_frame(self, jpg_bytes):
        with self.frame_lock:
            self.frame = jpg_bytes
            self.frames += 1
            self.frame_lock.notify_all()

    def push_detection(self, class_name, confidence, box):
        self.total += 1
        self.recent.appendleft({
            "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
            "class": class_name,
            "confidence": round(confidence, 3),
            "box_xyxy": box,
        })

    def snapshot(self):
        confs = [d["confidence"] for d in self.recent]
        return {
            "total": self.total,
            "frames": self.frames,
            "uptime_s": round(time.time() - self.started, 1),
            "avg_conf": round(sum(confs) / len(confs), 3) if confs else None,
            "peak_conf": max(confs) if confs else None,
            "last": self.recent[0] if self.recent else None,
            "recent": list(self.recent),
            **self.info,
        }

    # -- HTTP -----------------------------------------------------------
    def start(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass  # keep the detector's console output clean

            def _cors(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")

            def do_OPTIONS(self):
                self.send_response(204)
                self._cors()
                self.end_headers()

            def do_GET(self):
                path = self.path.split("?", 1)[0]
                if path == "/video":
                    self._stream()
                elif path == "/detections.json":
                    self._json(server.snapshot())
                elif path == "/status":
                    snap = server.snapshot()
                    snap.pop("recent", None)
                    self._json(snap)
                else:
                    self.send_response(404)
                    self._cors()
                    self.end_headers()

            def _json(self, payload):
                body = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _stream(self):
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.end_headers()
                last_id = -1
                try:
                    while True:
                        with server.frame_lock:
                            server.frame_lock.wait(timeout=1.0)
                            frame, fid = server.frame, server.frames
                        if frame is None or fid == last_id:
                            continue
                        last_id = fid
                        self.wfile.write(b"--frame\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(frame)}\r\n\r\n".encode())
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

        self._server = ThreadingHTTPServer((self.host, self.port), Handler)
        self._server.daemon_threads = True
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def stop(self):
        if self._server:
            self._server.shutdown()


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Run live object detection on a phone-camera video feed to flag "
                     "possible aerial objects (candidate drone sightings)."
    )
    parser.add_argument(
        "--url", default=DEFAULT_SOURCE,
        help=f"Video source (default: '{DEFAULT_SOURCE}' = locate the DroidCam virtual camera by name). "
             "Or an MJPEG URL such as http://192.168.137.5:8080/video, or an explicit camera index."
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        help=f"Ultralytics YOLO model/weights to use (default: {DEFAULT_MODEL}, a custom drone-only "
             f"model). Pass yolov8n.pt for the faster stock COCO model instead."
    )
    parser.add_argument(
        "--classes", nargs="+", default=DEFAULT_TARGET_CLASSES,
        help=f"Class names to flag (default: {DEFAULT_TARGET_CLASSES}). With the stock yolov8n.pt "
             f"model, use COCO classes instead, e.g. airplane bird kite frisbee."
    )
    parser.add_argument(
        "--conf", type=float, default=0.35,
        help="Minimum detection confidence to report (0-1, default: 0.35)."
    )
    parser.add_argument(
        "--imgsz", type=int, default=320,
        help="Inference resolution in pixels (default: 320). Lower is much faster on CPU but "
             "can miss small/distant objects; 640 is the model's native training resolution."
    )
    parser.add_argument(
        "--infer-every", type=int, default=3,
        help="Only run detection on every Nth captured frame (default: 3); every frame is still "
             "displayed, using the most recent detection boxes, so the video itself stays smooth "
             "even though a slow model can't keep up with every frame."
    )
    parser.add_argument(
        "--no-display", action="store_true",
        help="Don't open a live preview window -- just log detections to the console/CSV."
    )
    parser.add_argument(
        "--log", metavar="PATH",
        help="Append flagged detections to this CSV file."
    )
    parser.add_argument(
        "--reconnect-delay", type=float, default=3.0,
        help="Seconds to wait before retrying the stream if it drops (default: 3)."
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Enable debug logging."
    )
    parser.add_argument(
        "--serve", type=int, metavar="PORT",
        help="Also serve the annotated feed + detections over HTTP on this port "
             "(e.g. 8090) for the SHRAVAN field console: /video, /detections.json, /status."
    )
    parser.add_argument(
        "--serve-host", default="0.0.0.0",
        help="Interface to bind --serve to (default: 0.0.0.0 = all; use 127.0.0.1 for local only)."
    )
    return parser


def write_log_row(log_path, class_name, confidence, box):
    file_exists = False
    try:
        with open(log_path, "r", encoding="utf-8"):
            file_exists = True
    except FileNotFoundError:
        pass

    with open(log_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "class", "confidence", "box_xyxy"])
        writer.writerow([
            datetime.datetime.now().isoformat(timespec="seconds"),
            class_name,
            f"{confidence:.3f}",
            box,
        ])


def main():
    args = build_arg_parser().parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    logger = logging.getLogger("drone_camera_detector")

    try:
        import cv2
        import numpy as np
    except ImportError:
        print(
            "ERROR: opencv-python is not installed. Run:\n"
            "    pip install ultralytics opencv-python",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print(
            "ERROR: ultralytics is not installed. Run:\n"
            "    pip install ultralytics opencv-python",
            file=sys.stderr,
        )
        sys.exit(1)

    logger.info(f"Loading model {args.model} (first run downloads the weights file)...")
    model = YOLO(args.model)

    target_classes = {c.lower() for c in args.classes}
    logger.info(f"Flagging classes: {sorted(target_classes)} at confidence >= {args.conf}")

    model_classes = {name.lower() for name in model.names.values()}
    unknown_classes = target_classes - model_classes
    if unknown_classes:
        print(
            f"WARNING: {sorted(unknown_classes)} not in this model's label set "
            f"({args.model} only knows: {sorted(model_classes)}). Detections for "
            f"{'these classes' if len(unknown_classes) > 1 else 'this class'} will NEVER fire "
            f"unless you pass a custom-trained --model with that class.",
            file=sys.stderr,
        )

    console = None
    if args.serve:
        console = ConsoleServer(args.serve, host=args.serve_host)
        console.info = {
            "model": args.model,
            "classes": sorted(target_classes),
            "conf": args.conf,
            "imgsz": args.imgsz,
            "source": args.url,
        }
        console.start()
        logger.info(
            f"Console server on http://{args.serve_host}:{args.serve}/  "
            f"(/video, /detections.json, /status)"
        )

    window_name = "Drone Camera Detector (press q to quit)"
    use_mjpeg = args.url.lower().startswith(("http://", "https://"))

    def frame_source():
        """Yields decoded BGR frames (numpy arrays) from either an MJPEG-over-HTTP
        stream or a regular OpenCV-capturable source (webcam index / rtsp)."""
        if use_mjpeg:
            stream = MjpegStream(args.url)
            stream.open()
            try:
                while True:
                    jpg_bytes = stream.read()
                    if jpg_bytes is None:
                        return
                    frame = cv2.imdecode(np.frombuffer(jpg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None:
                        yield frame
            finally:
                stream.close()
        else:
            if args.url.lower() == DEFAULT_SOURCE:
                # Resolve DroidCam by device name on EVERY (re)connect, so a
                # re-plugged phone or shuffled camera order is picked up, and
                # we never silently open the built-in webcam instead.
                cap = open_droidcam(cv2, logger)
                if cap is None:
                    logger.warning("DroidCam present but no device delivered frames -- "
                                   "is the phone connected and streaming in the DroidCam client?")
                    return
            elif args.url.isdigit():
                cap = cv2.VideoCapture(int(args.url), cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(args.url)
            if not cap.isOpened():
                return
            try:
                while True:
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        return
                    yield frame
            finally:
                cap.release()

    try:
        while True:
            logger.info(f"Connecting to stream: {args.url}")
            got_any_frame = False
            frame_count = 0
            last_result = None

            for frame in frame_source():
                got_any_frame = True
                frame_count += 1

                # Only run the (slow) model every Nth frame; every frame still
                # gets displayed immediately using the most recent detection
                # boxes, so the video itself doesn't stall waiting on inference.
                if frame_count % args.infer_every == 1 or args.infer_every <= 1:
                    results = model.predict(frame, conf=args.conf, imgsz=args.imgsz, verbose=False)
                    last_result = results[0]

                    for box in last_result.boxes:
                        class_id = int(box.cls[0])
                        class_name = model.names.get(class_id, str(class_id))
                        confidence = float(box.conf[0])

                        if class_name.lower() not in target_classes:
                            continue

                        xyxy = [round(v, 1) for v in box.xyxy[0].tolist()]
                        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        label = "DRONE DETECTED" if class_name.lower() == "drone" else "AERIAL OBJECT DETECTED"
                        print(
                            f"[{now}] *** {label}: {class_name} "
                            f"(confidence {confidence:.2f}, box {xyxy}) ***"
                        )
                        if args.log:
                            write_log_row(args.log, class_name, confidence, xyxy)
                        if console:
                            console.push_detection(class_name, confidence, xyxy)

                if not args.no_display or console:
                    # Re-plot the most recent detection result's boxes onto the
                    # CURRENT frame, so the video stays live even between
                    # inference passes.
                    if last_result is not None:
                        annotated = last_result.plot(img=frame)
                    else:
                        annotated = frame

                    if console:
                        ok, jpg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        if ok:
                            console.push_frame(jpg.tobytes())

                    if not args.no_display:
                        cv2.imshow(window_name, annotated)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            return

            if not got_any_frame:
                logger.warning("Could not open stream. Retrying...")
            else:
                logger.warning("Stream ended -- reconnecting...")

            time.sleep(args.reconnect_delay)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if console:
            console.stop()
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass


if __name__ == "__main__":
    main()
