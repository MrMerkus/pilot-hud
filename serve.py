#!/usr/bin/env python3
"""Pilot HUD yerel sunucusu.

Neden gerekli: tarayicilar konum ve pusula sensorlerini yalnizca guvenli
baglantida (HTTPS) veya localhost'ta veriyor. Telefonu bilgisayara yerel agdan
duz HTTP ile baglarsan sensorler calismaz. Bu script kendinden imzali bir
sertifika uretip HTTPS sunar; telefon "guvenli degil" uyarisi gosterir,
"yine de devam et" dedikten sonra sensorler acilir.

Kullanim:
    python3 serve.py            # https://<bilgisayarin-ip>:8443
    python3 serve.py --port 9000
"""

import argparse
import http.server
import functools
import ipaddress
import os
import socket
import ssl
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT = ROOT / ".cert" / "hud.pem"


def local_ip() -> str:
    """Yerel agdaki IP adresini bulur. Disari paket gondermez, sadece
    hangi arayuzun kullanilacagini isletim sistemine sordurur."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert(ip: str) -> Path:
    """Sertifika yoksa uretir. IP'yi SAN alanina yazar, aksi halde tarayici
    sertifikayi adresle eslestiremez."""
    if CERT.exists():
        return CERT
    CERT.parent.mkdir(exist_ok=True)
    print("Sertifika uretiliyor...")
    try:
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
             "-keyout", str(CERT), "-out", str(CERT), "-days", "825",
             "-subj", "/CN=pilot-hud",
             "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost"],
            check=True, capture_output=True)
    except FileNotFoundError:
        sys.exit("openssl bulunamadi. Kur: sudo pacman -S openssl")
    except subprocess.CalledProcessError as e:
        sys.exit("Sertifika uretilemedi:\n" + e.stderr.decode(errors="replace"))
    CERT.chmod(0o600)
    return CERT


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()

    ip = local_ip()
    cert = ensure_cert(ip)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), handler)

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    print()
    print("  PILOT HUD yayinda")
    print(f"  Bu bilgisayar : https://localhost:{args.port}")
    print(f"  Telefondan    : https://{ip}:{args.port}")
    print()
    print("  Telefonda 'baglanti guvenli degil' uyarisi cikacak.")
    print("  Gelismis -> Yine de devam et. Kendi bilgisayarin, sorun yok.")
    print("  Durdurmak icin Ctrl+C")
    print()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nkapatildi")


if __name__ == "__main__":
    main()
