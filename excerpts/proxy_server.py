# Excerpt from Pesca Garraf (not the complete source).
# Local server: disk-cached proxy for the Open-Meteo APIs (30 min TTL) so reloads do not burn the free quota.

import hashlib, http.server, json, os, time, urllib.parse, urllib.request
TTL = 30 * 60
ALLOW = ("api.open-meteo.com", "marine-api.open-meteo.com", "flood-api.open-meteo.com")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache"); os.makedirs(CACHE, exist_ok=True)

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        if p.path != "/proxy": return super().do_GET()
        u = urllib.parse.parse_qs(p.query).get("u", [""])[0]
        if urllib.parse.urlparse(u).hostname not in ALLOW: self.send_error(403); return
        f = os.path.join(CACHE, hashlib.sha1(u.encode()).hexdigest())
        body, code = None, 200
        if os.path.exists(f) and time.time() - os.path.getmtime(f) < TTL: body = open(f, "rb").read()
        else:
            for i in range(4):
                try:
                    body = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "pesca-garraf"}), timeout=60).read(); open(f, "wb").write(body); break
                except urllib.error.HTTPError as e:
                    if e.code == 429: time.sleep(3 * (i + 1)); continue
                    body, code = e.read(), e.code; break
                except Exception: time.sleep(2)
            if body is None:
                body = open(f, "rb").read() if os.path.exists(f) else json.dumps({"error": True, "reason": "sin conexión con Open-Meteo"}).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

# Background refresh: each data job re-runs only when its output file is older than its max age.
import subprocess, sys
def extras(here, jobs):  # jobs = [(output_json, script, max_age_minutes), ...]
    while True:
        for job in jobs:
            out, script = job[0], job[1]; maxmin = job[2] if len(job) > 2 else 90
            f = os.path.join(here, "datos_extra", out)
            if not os.path.exists(f) or time.time() - os.path.getmtime(f) > maxmin * 60:
                try: subprocess.run([sys.executable, os.path.join(here, "calib", script)], capture_output=True, timeout=900)
                except Exception: pass
        time.sleep(600)
