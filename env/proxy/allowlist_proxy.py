#!/usr/bin/env python3
"""Minimal HTTP(S) forward proxy: allowlisted hosts, GET/HEAD (+ CONNECT) only, disk cache."""

from __future__ import annotations

import argparse
import hashlib
import os
import select
import socket
import socketserver
import threading
import urllib.parse
from http.client import HTTPConnection, HTTPSConnection
from pathlib import Path

ALLOWED_METHODS = {"GET", "HEAD"}
CONNECT_METHOD = "CONNECT"
BUFFER = 65536


def load_allowlist(path: Path) -> set[str]:
    hosts: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        hosts.add(line.lower().rstrip("."))
    return hosts


def host_allowed(host: str, allowlist: set[str]) -> bool:
    host = host.lower().split(":")[0].rstrip(".")
    if host in allowlist:
        return True
    return any(host == a or host.endswith("." + a) for a in allowlist)


class ProxyHandler(socketserver.StreamRequestHandler):
    allowlist: set[str] = set()
    cache_dir: Path | None = None

    def handle(self) -> None:
        try:
            raw = self.rfile.readline(65536)
            if not raw:
                return
            request_line = raw.decode("iso-8859-1", errors="replace").strip()
            if not request_line:
                return
            parts = request_line.split()
            if len(parts) < 2:
                self._reply(400, b"Bad Request")
                return
            method, target = parts[0].upper(), parts[1]

            headers: dict[str, str] = {}
            while True:
                line = self.rfile.readline(65536)
                if not line or line in (b"\r\n", b"\n"):
                    break
                try:
                    key, val = line.decode("iso-8859-1").split(":", 1)
                    headers[key.strip().lower()] = val.strip()
                except ValueError:
                    continue

            if method == CONNECT_METHOD:
                self._handle_connect(target)
                return

            if method not in ALLOWED_METHODS:
                self._reply(405, b"Method Not Allowed (GET/HEAD only)")
                return

            self._handle_http(method, target, headers)
        except Exception as exc:  # noqa: BLE001 — keep proxy alive
            try:
                self._reply(502, f"Proxy error: {exc}".encode())
            except OSError:
                pass

    def _handle_connect(self, target: str) -> None:
        host, _, port_s = target.partition(":")
        port = int(port_s or "443")
        if not host_allowed(host, self.allowlist):
            self._reply(403, f"Host not allowlisted: {host}".encode())
            return
        try:
            upstream = socket.create_connection((host, port), timeout=30)
        except OSError as exc:
            self._reply(502, f"CONNECT failed: {exc}".encode())
            return
        self.wfile.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        self.wfile.flush()
        self._tunnel(self.connection, upstream)

    def _handle_http(self, method: str, target: str, headers: dict[str, str]) -> None:
        if target.startswith("http://") or target.startswith("https://"):
            parsed = urllib.parse.urlparse(target)
            scheme = parsed.scheme
            host = parsed.hostname or ""
            port = parsed.port or (443 if scheme == "https" else 80)
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query
        else:
            # Origin-form should not appear for forward proxy; treat as relative with Host
            host_hdr = headers.get("host", "")
            host, _, port_s = host_hdr.partition(":")
            port = int(port_s) if port_s else 80
            scheme = "http"
            path = target

        if not host or not host_allowed(host, self.allowlist):
            self._reply(403, f"Host not allowlisted: {host}".encode())
            return

        cache_key = None
        cache_path = None
        if self.cache_dir and method == "GET":
            cache_key = hashlib.sha256(f"{scheme}://{host}:{port}{path}".encode()).hexdigest()
            cache_path = self.cache_dir / cache_key
            meta = cache_path.with_suffix(".meta")
            if cache_path.exists() and meta.exists():
                status_line = meta.read_bytes()
                body = cache_path.read_bytes()
                self.wfile.write(status_line)
                self.wfile.write(b"X-Proxy-Cache: HIT\r\n\r\n")
                self.wfile.write(body)
                self.wfile.flush()
                return

        conn: HTTPConnection | HTTPSConnection
        if scheme == "https":
            conn = HTTPSConnection(host, port, timeout=60)
        else:
            conn = HTTPConnection(host, port, timeout=60)

        fwd = {
            k: v
            for k, v in headers.items()
            if k not in {"proxy-connection", "connection", "proxy-authorization", "host"}
        }
        fwd["host"] = host if (scheme == "http" and port == 80) or (scheme == "https" and port == 443) else f"{host}:{port}"
        try:
            conn.request(method, path, headers=fwd)
            resp = conn.getresponse()
            body = resp.read()
            status = f"HTTP/1.1 {resp.status} {resp.reason}\r\n".encode()
            hdr_bytes = b"".join(
                f"{k}: {v}\r\n".encode()
                for k, v in resp.getheaders()
                if k.lower() not in {"transfer-encoding", "connection", "proxy-connection"}
            )
            hdr_bytes += b"X-Proxy-Cache: MISS\r\n"
            self.wfile.write(status + hdr_bytes + b"\r\n" + body)
            self.wfile.flush()
            if cache_path is not None and resp.status == 200 and method == "GET":
                cache_path.write_bytes(body)
                cache_path.with_suffix(".meta").write_bytes(status + hdr_bytes)
        finally:
            conn.close()

    def _tunnel(self, client: socket.socket, upstream: socket.socket) -> None:
        sockets = [client, upstream]
        try:
            while True:
                readable, _, errored = select.select(sockets, [], sockets, 60)
                if errored or not readable:
                    break
                for sock in readable:
                    other = upstream if sock is client else client
                    data = sock.recv(BUFFER)
                    if not data:
                        return
                    other.sendall(data)
        finally:
            upstream.close()

    def _reply(self, code: int, body: bytes) -> None:
        reason = {
            400: "Bad Request",
            403: "Forbidden",
            405: "Method Not Allowed",
            502: "Bad Gateway",
        }.get(code, "Error")
        self.wfile.write(
            f"HTTP/1.1 {code} {reason}\r\nContent-Type: text/plain\r\n"
            f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
            + body
        )
        self.wfile.flush()


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listen", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=3128)
    parser.add_argument(
        "--allowlist",
        default=os.environ.get("ALLOWLIST_PATH", "/etc/proxy/allowlist.txt"),
    )
    parser.add_argument(
        "--cache-dir",
        default=os.environ.get("CACHE_DIR", "/var/cache/gdpval-proxy"),
    )
    args = parser.parse_args()

    allowlist = load_allowlist(Path(args.allowlist))
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    ProxyHandler.allowlist = allowlist
    ProxyHandler.cache_dir = cache_dir

    server = ThreadedTCPServer((args.listen, args.port), ProxyHandler)
    print(
        f"allowlist proxy on {args.listen}:{args.port} "
        f"({len(allowlist)} hosts, cache={cache_dir})",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
