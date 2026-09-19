"""
Shravan
-------
A simple Tkinter GUI to view drones (devices) connected to this PC's Windows
Mobile Hotspot and disconnect (block) selected ones.

How "disconnect" works:
Windows does not expose an API to forcibly kick a client off Mobile Hotspot.
Instead, this tool blocks the selected drone's IP address at the Windows
Firewall (inbound + outbound), which cuts off its network/internet access
through your hotspot -- functionally disconnecting it. Drones stay listed
so you can "Unblock" them again at any time.

Requirements:
- Windows 10/11
- Run as Administrator (firewall rules require elevation)
- Python 3.8+ (standard library only, no extra packages needed)

Usage:
    Right-click hotspot_manager.py -> nothing special needed if double-clicked,
    but for firewall rules to apply you must run from an elevated terminal:

        python hotspot_manager.py

    (If not elevated, the app will warn you and offer to relaunch as admin.)
"""

import ctypes
import re
import socket
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox

RULE_PREFIX = "HotspotMgr_Block_"


def is_admin() -> bool:
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def relaunch_as_admin():
    params = " ".join(f'"{a}"' for a in sys.argv)
    ctypes.windll.shell32.ShellExecuteW(
        None, "runas", sys.executable, f'"{sys.argv[0]}" {params}', None, 1
    )
    sys.exit(0)


def run_cmd(args, timeout=15):
    """Run a command hidden (no console flash) and return stdout text."""
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        startupinfo=startupinfo,
    )
    return result.stdout


def get_hotspot_subnet_prefix():
    """
    Find the IPv4 subnet prefix (e.g. '192.168.137.') used by the Windows
    Mobile Hotspot / ICS virtual adapter, by scanning `ipconfig`.
    Falls back to the default Windows ICS subnet if not found.
    """
    try:
        out = run_cmd(["ipconfig"])
    except Exception:
        return "192.168.137."

    blocks = re.split(r"\r?\n\r?\n", out)
    for block in blocks:
        if "Local Area Connection" in block and ("*" in block.split("\n")[0]):
            m = re.search(r"IPv4 Address[.\s]*:\s*([\d.]+)", block)
            if m:
                ip = m.group(1)
                return ip.rsplit(".", 1)[0] + "."
    # Fallback: default subnet Windows uses for Mobile Hotspot / ICS
    return "192.168.137."


def get_own_ips():
    ips = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    return ips


def scan_arp_devices(subnet_prefix):
    """
    Parse `arp -a` output and return list of dicts: ip, mac, hostname
    for entries in the hotspot subnet.
    """
    try:
        out = run_cmd(["arp", "-a"])
    except Exception:
        return []

    own_ips = get_own_ips()
    devices = []
    for line in out.splitlines():
        line = line.strip()
        m = re.match(
            r"^(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F-]{17})\s+(\w+)", line
        )
        if not m:
            continue
        ip, mac, kind = m.group(1), m.group(2), m.group(3)
        if not ip.startswith(subnet_prefix):
            continue
        # Windows Mobile Hotspot lists connected clients as "static" ARP
        # entries, not "dynamic" -- so don't filter on kind. Instead skip
        # broadcast/multicast MACs and non-client addresses directly.
        mac_lower = mac.lower()
        if mac_lower == "ff-ff-ff-ff-ff-ff" or mac_lower.startswith("01-00-5e"):
            continue
        if ip in own_ips or ip.endswith(".255") or ip.endswith(".1") or ip.endswith(".0"):
            continue
        hostname = resolve_hostname(ip)
        devices.append({"ip": ip, "mac": mac.upper(), "hostname": hostname})
    return devices


def resolve_hostname(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return "Unknown"


def get_blocked_ips():
    """Return set of IPs currently blocked by our firewall rules."""
    try:
        out = run_cmd(
            ["netsh", "advfirewall", "firewall", "show", "rule",
             "name=all", "verbose"],
            timeout=25,
        )
    except Exception:
        return set()

    blocked = set()
    current_name = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Rule Name:"):
            current_name = line.split(":", 1)[1].strip()
        elif line.startswith("RemoteIP:") and current_name and current_name.startswith(RULE_PREFIX):
            ip = line.split(":", 1)[1].strip()
            if ip and ip != "Any":
                blocked.add(ip.split("/")[0])
    return blocked


def block_ip(ip):
    name = f"{RULE_PREFIX}{ip}"
    for direction in ("in", "out"):
        run_cmd([
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={name}_{direction}",
            f"dir={direction}",
            "action=block",
            f"remoteip={ip}",
            "enable=yes",
        ])


def unblock_ip(ip):
    name = f"{RULE_PREFIX}{ip}"
    run_cmd([
        "netsh", "advfirewall", "firewall", "delete", "rule",
        f"name={name}_in",
    ])
    run_cmd([
        "netsh", "advfirewall", "firewall", "delete", "rule",
        f"name={name}_out",
    ])


class HotspotManagerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Shravan")
        self.geometry("640x420")
        self.minsize(560, 360)

        self.devices = []
        self.blocked_ips = set()
        self.subnet_prefix = get_hotspot_subnet_prefix()

        self._build_ui()
        self.after(200, self.refresh_devices)

    def _build_ui(self):
        top = ttk.Frame(self, padding=10)
        top.pack(fill="x")

        ttk.Label(
            top, text="Drones connected to your hotspot", font=("Segoe UI", 12, "bold")
        ).pack(side="left")

        self.status_var = tk.StringVar(value="")
        ttk.Label(top, textvariable=self.status_var, foreground="#555").pack(
            side="right"
        )

        columns = ("ip", "mac", "hostname", "status")
        self.tree = ttk.Treeview(
            self, columns=columns, show="headings", selectmode="extended"
        )
        for col, label, width in (
            ("ip", "IP Address", 130),
            ("mac", "MAC Address", 160),
            ("hostname", "Drone Name", 200),
            ("status", "Status", 100),
        ):
            self.tree.heading(col, text=label)
            self.tree.column(col, width=width, anchor="w")
        self.tree.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        btn_frame = ttk.Frame(self, padding=(10, 0, 10, 10))
        btn_frame.pack(fill="x")

        ttk.Button(btn_frame, text="Refresh", command=self.refresh_devices).pack(
            side="left"
        )
        ttk.Button(
            btn_frame, text="Disconnect Selected", command=self.disconnect_selected
        ).pack(side="left", padx=6)
        ttk.Button(
            btn_frame, text="Reconnect Selected", command=self.reconnect_selected
        ).pack(side="left")

        if not is_admin():
            warn = ttk.Label(
                self,
                text="⚠ Not running as Administrator — blocking/unblocking will fail. "
                     "Close this and run as admin.",
                foreground="#b30000",
            )
            warn.pack(fill="x", padx=10, pady=(0, 8))

    def set_status(self, text):
        self.status_var.set(text)
        self.update_idletasks()

    def refresh_devices(self):
        self.set_status("Scanning...")
        threading.Thread(target=self._refresh_worker, daemon=True).start()

    def _refresh_worker(self):
        devices = scan_arp_devices(self.subnet_prefix)
        blocked = get_blocked_ips()
        self.after(0, lambda: self._populate(devices, blocked))

    def _populate(self, devices, blocked):
        self.devices = devices
        self.blocked_ips = blocked
        self.tree.delete(*self.tree.get_children())
        for d in devices:
            status = "Blocked" if d["ip"] in blocked else "Connected"
            self.tree.insert(
                "", "end", iid=d["ip"],
                values=(d["ip"], d["mac"], d["hostname"], status),
            )
        self.set_status(
            f"{len(devices)} drone(s) found on {self.subnet_prefix}0/24"
        )

    def _selected_ips(self):
        return list(self.tree.selection())

    def disconnect_selected(self):
        ips = self._selected_ips()
        if not ips:
            messagebox.showinfo("No selection", "Select one or more drones first.")
            return
        if not is_admin():
            messagebox.showerror(
                "Administrator required",
                "Run this program as Administrator to block drones.",
            )
            return
        if not messagebox.askyesno(
            "Confirm disconnect",
            f"Disconnect {len(ips)} drone(s) from the hotspot?\n\n" + "\n".join(ips),
        ):
            return
        self.set_status("Blocking...")
        threading.Thread(target=self._block_worker, args=(ips,), daemon=True).start()

    def _block_worker(self, ips):
        for ip in ips:
            block_ip(ip)
        self.after(0, self.refresh_devices)

    def reconnect_selected(self):
        ips = self._selected_ips()
        if not ips:
            messagebox.showinfo("No selection", "Select one or more drones first.")
            return
        if not is_admin():
            messagebox.showerror(
                "Administrator required",
                "Run this program as Administrator to unblock drones.",
            )
            return
        self.set_status("Unblocking...")
        threading.Thread(target=self._unblock_worker, args=(ips,), daemon=True).start()

    def _unblock_worker(self, ips):
        for ip in ips:
            unblock_ip(ip)
        self.after(0, self.refresh_devices)


def main():
    app = HotspotManagerApp()
    app.mainloop()


if __name__ == "__main__":
    main()
