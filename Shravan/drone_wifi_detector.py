"""
Drone Wi-Fi Detector
---------------------
Passively scans for nearby Wi-Fi access points using Windows' built-in
Wi-Fi scanning (`netsh wlan show networks`) and flags ones that look
unusual -- i.e. don't match the naming conventions of everyday devices
(phones, home routers/ISPs, printers, smart TVs, laptops).

Rather than hardcoding a drone brand list (which misses unbranded or
generic devices, e.g. an SSID that's just "IOT"), classification works
by exclusion:

  1. NORMAL_SSID_PATTERNS -- naming patterns of common non-drone devices.
     Anything matching these is treated as ordinary background noise.
  2. STRONG_KEYWORDS -- generic tech/drone-ish keywords (iot, uav, fpv,
     drone, quad, plus known drone brand names) that raise confidence
     when present in an SSID that also isn't a normal-device match.
  3. Known drone-vendor MAC OUI prefixes (best-effort list).

Anything that doesn't match a normal-device pattern is reported as
UNUSUAL (low confidence). Anything unusual that also matches a strong
keyword or known drone OUI is reported as HIGH CONFIDENCE.

This is 100% passive/receive-only -- it never transmits anything beyond
what your Wi-Fi adapter already does for normal scanning, so it is legal
everywhere Wi-Fi scanning itself is legal (i.e. everywhere).

Limitations:
  - Only detects devices that expose a Wi-Fi access point or Wi-Fi client
    interface (many companion-app or FPV-goggle links do; a pure
    long-range RF control link like DJI OcuSync/Lightbridge does NOT
    show up here -- that's a separate radio system entirely).
  - Pattern lists are best-effort and not exhaustive -- tune them for
    your environment. Anything genuinely unfamiliar (a new IoT gadget,
    an unusual router) will also show up as "unusual"; treat the output
    as a shortlist to investigate, not a certain verdict.

Requirements:
  - Windows 10/11, Python 3.8+, stdlib only.

Usage:
    python drone_wifi_detector.py                  # scan once
    python drone_wifi_detector.py --watch           # scan every 5s until Ctrl+C
    python drone_wifi_detector.py --watch --interval 2
    python drone_wifi_detector.py --log detections.csv
    python drone_wifi_detector.py --verbose
"""

import argparse
import csv
import ctypes
import datetime
import logging
import re
import subprocess
import sys
import time

# SSID naming patterns of ordinary, everyday devices. Anything matching
# one of these is treated as normal background noise and NOT flagged,
# regardless of how "unusual" its name might otherwise look.
NORMAL_SSID_PATTERNS = [
    # phone personal hotspots
    r"\biphone\b", r"\bandroidap\b", r"\bgalaxy\b", r"\bredmi\b", r"\bpoco\b",
    r"\boneplus\b", r"\bpixel\b", r"\brealme\b", r"\bvivo\b", r"\boppo\b",
    r"\bhonor\b", r"\bnokia\b", r"\bxiaomi\b", r"\bmi\s?\d",
    # ISPs / home routers / carrier default SSIDs
    r"\bjio\b", r"\bairtel\b", r"\bbsnl\b", r"\bact\b", r"\bvodafone\b",
    r"\bvi\b", r"\bidea\b", r"\btp-?link\b", r"\bnetgear\b", r"\bd-?link\b",
    r"\basus\b", r"\blinksys\b", r"\bbelkin\b", r"\bcisco\b", r"\bmercusys\b",
    r"\btenda\b", r"\bhathway\b", r"\bexcitel\b", r"\bhome[-_]?wifi\b",
    r"[-_]?5g$", r"[-_]?2\.?4g$", r"\brouter\b", r"\bhotspot\b",
    r"^cu_event", r"\bmywifi\b", r"\bmynetwork\b",
    # printers / smart-home / entertainment devices
    r"\bhp[-_]?print\b", r"\bepson\b", r"\bcanon\b", r"\bbrother\b",
    r"\bsamsung\b", r"\blg[-_]?webos\b", r"\broku\b", r"\bfiretv\b",
    r"\bchromecast\b", r"\bsmart[-_]?tv\b", r"\bsonos\b", r"\becho\b",
    r"\bgoogle[-_]?home\b", r"\bnest\b",
    # laptops / desktops / generic computer hostnames used as SSID
    r"\bdesktop[-_]", r"\blaptop[-_]", r"\bdell[-_]", r"\bmsi[-_]",
    r"\blenovo[-_]", r"\bhp[-_]?laptop\b",
]

# Generic tech / drone-ish keywords, plus known drone brand names. Raises
# confidence to HIGH when found in an SSID that ISN'T already excluded
# by NORMAL_SSID_PATTERNS above.
STRONG_KEYWORDS = [
    r"\biot\b", r"\buav\b", r"\bfpv\b", r"\bdrone\b", r"\bquad(copter)?\b",
    r"\bmavic\b", r"\bphantom\b", r"\bspark\b", r"\bdji\b",
    r"\btello\b", r"\bryze\b",
    r"\bparrot\b", r"\banafi\b", r"\bbebop\b",
    r"\bautel\b", r"\bevo[-_]", r"\bx-star\b",
    r"\byuneec\b", r"\btyphoon\b",
    r"\bholy[-_]?stone\b", r"\bhs\d{3}\b",
    r"\bskydio\b", r"\bfimi\b",
]

# Best-effort drone-vendor Wi-Fi MAC OUI prefixes (first 3 octets,
# colon-separated, uppercase). Not exhaustive -- extend as needed.
KNOWN_DRONE_OUIS = {
    "60:60:1F": "DJI",
    "34:D2:62": "DJI",
    "A0:14:3D": "DJI",
    "48:1C:B9": "DJI",
    "00:12:1C": "Parrot",
    "90:03:B7": "Parrot",
    "00:26:7E": "Parrot",
    "A0:CD:F3": "Yuneec",
}

NORMAL_REGEX = re.compile("|".join(NORMAL_SSID_PATTERNS), re.IGNORECASE)
STRONG_REGEX = re.compile("|".join(STRONG_KEYWORDS), re.IGNORECASE)


# ---------------------------------------------------------------------------
# Native WLAN API scan trigger.
#
# `netsh wlan show networks` only ever returns Windows' cached BSS list --
# it does NOT force a fresh over-the-air scan. Windows itself only rescans
# periodically (and much less often while already connected to a network),
# so repeatedly polling netsh can return the exact same stale list for
# minutes at a time, silently missing devices that are actually present.
# WlanScan (from wlanapi.dll) asks the driver to perform a real scan right
# now, without disconnecting from the current network.
# ---------------------------------------------------------------------------

class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class _WLAN_INTERFACE_INFO(ctypes.Structure):
    _fields_ = [
        ("InterfaceGuid", _GUID),
        ("strInterfaceDescription", ctypes.c_wchar * 256),
        ("isState", ctypes.c_uint),
    ]


class _WLAN_INTERFACE_INFO_LIST(ctypes.Structure):
    _fields_ = [
        ("dwNumberOfItems", ctypes.c_ulong),
        ("dwIndex", ctypes.c_ulong),
        ("InterfaceInfo", _WLAN_INTERFACE_INFO * 1),
    ]


def _get_wlanapi():
    try:
        wlanapi = ctypes.windll.wlanapi
    except (OSError, AttributeError):
        return None

    wlanapi.WlanOpenHandle.argtypes = [
        ctypes.c_ulong, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_void_p),
    ]
    wlanapi.WlanOpenHandle.restype = ctypes.c_ulong

    wlanapi.WlanCloseHandle.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    wlanapi.WlanCloseHandle.restype = ctypes.c_ulong

    wlanapi.WlanEnumInterfaces.argtypes = [
        ctypes.c_void_p, ctypes.c_void_p,
        ctypes.POINTER(ctypes.POINTER(_WLAN_INTERFACE_INFO_LIST)),
    ]
    wlanapi.WlanEnumInterfaces.restype = ctypes.c_ulong

    wlanapi.WlanScan.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(_GUID),
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
    ]
    wlanapi.WlanScan.restype = ctypes.c_ulong

    wlanapi.WlanFreeMemory.argtypes = [ctypes.c_void_p]
    wlanapi.WlanFreeMemory.restype = None
    return wlanapi


_wlanapi = _get_wlanapi()


def trigger_wlan_scan(logger):
    """
    Ask Windows to perform a real, active Wi-Fi scan right now, for every
    WLAN interface. Best-effort: any failure is logged at debug level and
    swallowed, so callers just fall back to whatever netsh already has.
    """
    if _wlanapi is None:
        logger.debug("wlanapi.dll not available; skipping active scan trigger.")
        return

    handle = ctypes.c_void_p()
    negotiated_version = ctypes.c_ulong()
    result = _wlanapi.WlanOpenHandle(2, None, ctypes.byref(negotiated_version), ctypes.byref(handle))
    if result != 0:
        logger.debug(f"WlanOpenHandle failed: {result}")
        return

    try:
        p_list = ctypes.POINTER(_WLAN_INTERFACE_INFO_LIST)()
        result = _wlanapi.WlanEnumInterfaces(handle, None, ctypes.byref(p_list))
        if result != 0:
            logger.debug(f"WlanEnumInterfaces failed: {result}")
            return

        try:
            info_list = p_list.contents
            count = info_list.dwNumberOfItems
            if count == 0:
                return
            interfaces = ctypes.cast(
                ctypes.addressof(info_list.InterfaceInfo),
                ctypes.POINTER(_WLAN_INTERFACE_INFO * count),
            ).contents

            for iface in interfaces:
                scan_result = _wlanapi.WlanScan(
                    handle, ctypes.byref(iface.InterfaceGuid), None, None, None
                )
                if scan_result != 0:
                    logger.debug(f"WlanScan failed for an interface: {scan_result}")
        finally:
            _wlanapi.WlanFreeMemory(p_list)
    finally:
        _wlanapi.WlanCloseHandle(handle, None)


def run_netsh_scan():
    """Run `netsh wlan show networks mode=bssid` and return raw stdout text."""
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "networks", "mode=bssid"],
            capture_output=True,
            text=True,
            timeout=20,
            startupinfo=startupinfo,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "netsh not found -- this tool requires Windows with the WLAN AutoConfig service."
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("netsh scan timed out.")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RuntimeError(
            f"netsh scan failed (exit {result.returncode}): {stderr or 'no Wi-Fi adapter or Wi-Fi is off'}"
        )
    return result.stdout


def parse_networks(raw_output):
    """
    Parse `netsh wlan show networks mode=bssid` output into a list of dicts:
    {ssid, bssid, signal_pct, auth, radio_type}
    One entry per BSSID (an SSID can have multiple BSSIDs/APs).
    """
    networks = []
    current_ssid = None
    current_bssid = None
    current_signal = None
    current_auth = None
    current_radio = None

    for raw_line in raw_output.splitlines():
        line = raw_line.strip()

        m = re.match(r"^SSID\s+\d+\s*:\s*(.*)$", line)
        if m:
            current_ssid = m.group(1).strip()
            continue

        m = re.match(r"^Authentication\s*:\s*(.*)$", line)
        if m:
            current_auth = m.group(1).strip()
            continue

        m = re.match(r"^Radio type\s*:\s*(.*)$", line)
        if m:
            current_radio = m.group(1).strip()
            continue

        m = re.match(r"^BSSID\s+\d+\s*:\s*([0-9a-fA-F:]{17})$", line)
        if m:
            current_bssid = m.group(1).upper()
            current_signal = None
            continue

        m = re.match(r"^Signal\s*:\s*(\d+)%$", line)
        if m and current_bssid:
            current_signal = int(m.group(1))
            networks.append({
                "ssid": current_ssid or "(hidden)",
                "bssid": current_bssid,
                "signal_pct": current_signal,
                "auth": current_auth,
                "radio_type": current_radio,
            })
            current_bssid = None
            continue

    return networks


def classify(network):
    """
    Return (confidence, reasons) for a parsed network entry, where
    confidence is one of "normal", "unusual", "high".

    Logic (by exclusion, not a drone-name whitelist):
      - SSID matches a known everyday-device pattern -> "normal", not flagged.
      - Otherwise it's "unusual" (doesn't look like a phone/router/printer/
        TV/laptop) -- worth a second look.
      - "unusual" is upgraded to "high" if the SSID also contains a
        generic tech/drone keyword (iot, uav, fpv, drone, ...) or a known
        drone brand name, or the MAC OUI belongs to a known drone vendor.
    """
    reasons = []
    ssid = network["ssid"]
    bssid = network["bssid"]
    oui = bssid[:8] if len(bssid) >= 8 else bssid  # "XX:XX:XX"

    if ssid and ssid != "(hidden)" and NORMAL_REGEX.search(ssid):
        return "normal", reasons

    reasons.append("SSID does not match common phone/router/printer/TV/laptop naming patterns")

    vendor = KNOWN_DRONE_OUIS.get(oui)
    strong_match = bool(ssid and STRONG_REGEX.search(ssid))

    if strong_match:
        reasons.append(f"SSID contains a drone/IoT-style keyword ({ssid!r})")
    if vendor:
        reasons.append(f"MAC OUI {oui} registered to known drone vendor: {vendor}")

    confidence = "high" if (strong_match or vendor) else "unusual"
    return confidence, reasons


def scan_once(logger, active_scan=True, scan_wait=2.5):
    if active_scan:
        logger.debug("Triggering active WLAN scan...")
        trigger_wlan_scan(logger)
        time.sleep(scan_wait)  # give the driver time to complete the scan

    logger.debug("Running netsh wlan scan...")
    raw = run_netsh_scan()
    networks = parse_networks(raw)
    logger.debug(f"Parsed {len(networks)} BSSID entries from scan.")
    return networks


class NetworkTracker:
    """
    Windows only refreshes its Wi-Fi scan cache periodically (roughly
    every 30-60s); a single `netsh wlan show networks` call just returns
    whatever's currently cached, so a real, steady device can silently
    drop out of one poll and reappear in the next. This tracker keeps a
    rolling union of every BSSID seen within `stale_after` seconds, so
    transient cache misses don't make a device disappear from the report.
    """

    def __init__(self, stale_after_seconds):
        self.stale_after = stale_after_seconds
        self.seen = {}  # bssid -> {ssid, signal_pct, auth, radio_type, last_seen, first_seen, hit_count}

    def update(self, networks):
        """Merge a fresh scan snapshot in. Returns set of BSSIDs seen for the first time."""
        now = time.monotonic()
        new_bssids = set()
        for net in networks:
            bssid = net["bssid"]
            if bssid not in self.seen:
                new_bssids.add(bssid)
                self.seen[bssid] = {**net, "first_seen": now, "hit_count": 0}
            else:
                self.seen[bssid].update(net)
            self.seen[bssid]["last_seen"] = now
            self.seen[bssid]["hit_count"] += 1

        stale = [b for b, entry in self.seen.items() if now - entry["last_seen"] > self.stale_after]
        for b in stale:
            del self.seen[b]

        return new_bssids

    def hit_count(self, bssid):
        entry = self.seen.get(bssid)
        return entry["hit_count"] if entry else 0

    def current_networks(self):
        return [
            {
                "ssid": e["ssid"],
                "bssid": bssid,
                "signal_pct": e["signal_pct"],
                "auth": e["auth"],
                "radio_type": e["radio_type"],
            }
            for bssid, e in self.seen.items()
        ]


def classify_networks(networks):
    hits = []
    for net in networks:
        confidence, reasons = classify(net)
        if confidence != "normal":
            hits.append((net, confidence, reasons))
    # High confidence first, then unusual.
    hits.sort(key=lambda h: 0 if h[1] == "high" else 1)
    return hits


def print_report(networks, hits, verbose):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    high = [h for h in hits if h[1] == "high"]
    unusual = [h for h in hits if h[1] == "unusual"]

    if not hits:
        print(f"[{now}] Scanned {len(networks)} network(s). Nothing unusual detected.")
    else:
        print(
            f"[{now}] Scanned {len(networks)} network(s). "
            f"{len(high)} HIGH-CONFIDENCE, {len(unusual)} unusual/unclassified:"
        )
        for net, confidence, reasons in hits:
            tag = "HIGH" if confidence == "high" else "unusual"
            print(f"  -> [{tag}] SSID={net['ssid']!r}  BSSID={net['bssid']}  Signal={net['signal_pct']}%")
            for r in reasons:
                print(f"       - {r}")

        if high:
            names = ", ".join(f"{net['ssid']!r}" for net, _, _ in high)
            print(f"\n  *** DRONE DETECTED: {names} ***")

    if verbose and networks:
        print("  All networks seen this scan:")
        for net in networks:
            print(f"    {net['bssid']}  {net['signal_pct']:>3}%  {net['ssid']}")


def write_log_row(log_path, net, confidence, reasons):
    file_exists = False
    try:
        with open(log_path, "r", encoding="utf-8"):
            file_exists = True
    except FileNotFoundError:
        pass

    with open(log_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "confidence", "ssid", "bssid", "signal_pct", "reasons"])
        writer.writerow([
            datetime.datetime.now().isoformat(timespec="seconds"),
            confidence,
            net["ssid"],
            net["bssid"],
            net["signal_pct"],
            "; ".join(reasons),
        ])


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Passively flag unusual nearby Wi-Fi devices (by exclusion of normal device "
                     "naming patterns) that may be drones/controllers/IoT devices."
    )
    parser.add_argument(
        "--watch", action="store_true",
        help="Keep scanning repeatedly until Ctrl+C (default: scan once and exit)."
    )
    parser.add_argument(
        "--interval", type=float, default=5.0,
        help="Seconds between scans in --watch mode (default: 5)."
    )
    parser.add_argument(
        "--log", metavar="PATH",
        help="Append detected drone-like devices to this CSV file."
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Print every network seen, not just drone-like matches."
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Enable debug logging."
    )
    parser.add_argument(
        "--stale-after", type=float, default=30.0,
        help="Seconds a previously-seen network is kept in the rolling view after it stops "
             "appearing in fresh scans, to smooth over Windows' Wi-Fi scan-cache gaps (default: 30)."
    )
    parser.add_argument(
        "--no-active-scan", action="store_true",
        help="Don't trigger a real over-the-air WLAN scan before each poll -- just read "
             "whatever netsh already has cached (faster, but may miss devices for minutes)."
    )
    parser.add_argument(
        "--scan-wait", type=float, default=2.5,
        help="Seconds to wait after triggering an active scan before reading results (default: 2.5)."
    )
    return parser


def main():
    args = build_arg_parser().parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.WARNING,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    logger = logging.getLogger("drone_wifi_detector")
    tracker = NetworkTracker(args.stale_after)

    try:
        while True:
            try:
                snapshot = scan_once(logger, active_scan=not args.no_active_scan, scan_wait=args.scan_wait)
            except RuntimeError as e:
                print(f"ERROR: {e}", file=sys.stderr)
                if not args.watch:
                    sys.exit(1)
                time.sleep(args.interval)
                continue

            new_bssids = tracker.update(snapshot)
            networks = tracker.current_networks()
            hits = classify_networks(networks)

            print_report(networks, hits, args.verbose)

            if args.log:
                for net, confidence, reasons in hits:
                    if net["bssid"] in new_bssids:
                        write_log_row(args.log, net, confidence, reasons)

            if not args.watch:
                break

            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
