"""Host-side Docker sandbox bridge for gdpval-video.

This module is the agent integration surface. Provider tool handlers should call
``Sandbox`` methods only — see ``harness/README.md``. No LLM / agent-loop code
belongs here.
"""

from __future__ import annotations

import base64
import json
import os
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_DIR = REPO_ROOT / "env"
COMPOSE_FILE = ENV_DIR / "compose.yaml"
DEFAULT_IMAGE = os.environ.get("GDPVAL_IMAGE", "gdpval-video:local")
WORKSPACE = "/workspace"
STOCK_API_ENV_KEYS = ("PEXELS_API_KEY", "PIXABAY_API_KEY")


def _load_repo_dotenv(env: dict[str, str]) -> None:
    """Fill missing keys from repo-root .env (does not override existing env)."""
    path = REPO_ROOT / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key or env.get(key):
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in {'"', "'"}:
            val = val[1:-1]
        env[key] = val


def _compose_env(*, project_name: str, reference_dir: Path, deliverable_dir: Path, scratch_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    _load_repo_dotenv(env)
    env["REFERENCE_DIR"] = str(reference_dir.resolve())
    env["DELIVERABLE_DIR"] = str(deliverable_dir.resolve())
    env["SCRATCH_DIR"] = str(scratch_dir.resolve())
    env["COMPOSE_PROJECT_NAME"] = project_name
    return env


@dataclass
class ExecResult:
    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False

    @property
    def ok(self) -> bool:
        return self.exit_code == 0 and not self.timed_out


@dataclass
class MediaInspection:
    path: str
    ffprobe: dict[str, Any]
    frames: list[tuple[float, bytes]]  # (time_sec, jpeg_bytes)


@dataclass
class WebResult:
    url: str
    ok: bool
    status_code: int | None
    path: str | None
    error: str | None = None
    bytes_written: int = 0


@dataclass
class Sandbox:
    """Long-lived container accessed via docker exec / docker cp."""

    image: str = DEFAULT_IMAGE
    project_name: str | None = None
    container_id: str | None = None
    mem: str = "16g"
    cpus: int = 8
    _tmpdir: Path | None = field(default=None, repr=False)
    _reference_dir: Path | None = field(default=None, repr=False)
    _deliverable_dir: Path | None = field(default=None, repr=False)
    _scratch_dir: Path | None = field(default=None, repr=False)

    def start(self, *, reference_dir: Path | None = None, mem: str | None = None, cpus: int | None = None) -> str:
        if self.container_id:
            raise RuntimeError("Sandbox already started")

        if mem is not None:
            self.mem = mem
        if cpus is not None:
            self.cpus = cpus

        self.project_name = self.project_name or f"gdpval-{uuid.uuid4().hex[:10]}"
        self._tmpdir = Path(tempfile.mkdtemp(prefix="gdpval-sandbox-"))
        self._reference_dir = Path(reference_dir) if reference_dir else self._tmpdir / "reference_files"
        self._reference_dir.mkdir(parents=True, exist_ok=True)
        self._deliverable_dir = self._tmpdir / "deliverable_files"
        self._scratch_dir = self._tmpdir / "scratch"
        self._deliverable_dir.mkdir(parents=True, exist_ok=True)
        (self._scratch_dir / "downloads").mkdir(parents=True, exist_ok=True)
        (self._scratch_dir / "frames").mkdir(parents=True, exist_ok=True)

        env = _compose_env(
            project_name=self.project_name,
            reference_dir=self._reference_dir,
            deliverable_dir=self._deliverable_dir,
            scratch_dir=self._scratch_dir,
        )

        # Ensure proxy image exists (cheap if already built).
        subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "build", "proxy"],
            cwd=str(ENV_DIR),
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

        subprocess.run(
            [
                "docker",
                "compose",
                "-f",
                str(COMPOSE_FILE),
                "up",
                "-d",
                "--no-build",
                "proxy",
                "sandbox",
            ],
            cwd=str(ENV_DIR),
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

        # Resolve sandbox container id for this project.
        probe = subprocess.run(
            [
                "docker",
                "compose",
                "-f",
                str(COMPOSE_FILE),
                "ps",
                "-q",
                "sandbox",
            ],
            cwd=str(ENV_DIR),
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        cid = probe.stdout.strip().splitlines()[-1].strip() if probe.stdout.strip() else ""
        if not cid:
            raise RuntimeError("Failed to start sandbox container")
        self.container_id = cid

        # Wait until exec works.
        deadline = time.time() + 60
        while time.time() < deadline:
            r = self.bash("true", timeout=10)
            if r.ok:
                break
            time.sleep(1)
        else:
            self.stop()
            raise RuntimeError("Sandbox container did not become ready")

        # Ensure workspace dirs exist and are writable (bind mounts may be root-owned).
        self.bash(
            "mkdir -p /workspace/deliverable_files /workspace/scratch/downloads "
            "/workspace/scratch/frames /workspace/reference_files && "
            "chmod -R u+rwX /workspace/deliverable_files /workspace/scratch || true",
            timeout=30,
        )
        return self.container_id

    def stop(self) -> None:
        if self.project_name:
            ref = self._reference_dir or Path("/tmp")
            deliv = self._deliverable_dir or Path("/tmp")
            scratch = self._scratch_dir or Path("/tmp")
            env = _compose_env(
                project_name=self.project_name,
                reference_dir=ref,
                deliverable_dir=deliv,
                scratch_dir=scratch,
            )
            subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE_FILE), "down", "-v", "--remove-orphans"],
                cwd=str(ENV_DIR),
                env=env,
                capture_output=True,
                text=True,
            )
        self.container_id = None
        self.project_name = None
        if self._tmpdir and self._tmpdir.exists():
            shutil.rmtree(self._tmpdir, ignore_errors=True)
        self._tmpdir = None

    def __enter__(self) -> Sandbox:
        return self

    def __exit__(self, *exc: object) -> None:
        self.stop()

    def _require_running(self) -> str:
        if not self.container_id:
            raise RuntimeError("Sandbox is not running; call start() first")
        return self.container_id

    @staticmethod
    def _normalize_workspace_path(path: str) -> str:
        p = path if path.startswith("/") else f"{WORKSPACE}/{path.lstrip('./')}"
        resolved = str(Path(p).as_posix())
        if resolved != WORKSPACE and not resolved.startswith(WORKSPACE + "/"):
            raise ValueError(f"path escapes {WORKSPACE}: {path}")
        # Block .. after normalization
        parts = Path(resolved).parts
        if ".." in parts:
            raise ValueError(f"path escapes {WORKSPACE}: {path}")
        return resolved

    def bash(self, cmd: str, timeout: int = 180) -> ExecResult:
        cid = self._require_running()
        try:
            proc = subprocess.run(
                [
                    "docker",
                    "exec",
                    "-u",
                    "appuser",
                    "-w",
                    WORKSPACE,
                    cid,
                    "bash",
                    "-lc",
                    cmd,
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return ExecResult(proc.returncode, proc.stdout, proc.stderr, timed_out=False)
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
            return ExecResult(124, stdout, stderr + "\n[timed out]", timed_out=True)

    def python(self, code: str, timeout: int = 180) -> ExecResult:
        # Write code to a temp file inside the container to avoid shell quoting issues.
        b64 = base64.b64encode(code.encode()).decode()
        script = (
            "mkdir -p /workspace/scratch && "
            f"echo {shlex.quote(b64)} | base64 -d > /workspace/scratch/_run.py && "
            "python /workspace/scratch/_run.py"
        )
        return self.bash(script, timeout=timeout)

    def read_file(self, path: str, binary: bool = False) -> bytes | str:
        cid = self._require_running()
        path = self._normalize_workspace_path(path)
        if binary:
            proc = subprocess.run(
                ["docker", "exec", "-u", "appuser", cid, "base64", path],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode != 0:
                raise FileNotFoundError(proc.stderr.strip() or f"read failed: {path}")
            return base64.b64decode(proc.stdout.encode())
        proc = subprocess.run(
            ["docker", "exec", "-u", "appuser", cid, "cat", path],
            capture_output=True,
            timeout=120,
        )
        if proc.returncode != 0:
            raise FileNotFoundError(proc.stderr.decode(errors="replace").strip() or f"read failed: {path}")
        return proc.stdout if binary else proc.stdout.decode()

    def write_file(self, path: str, data: bytes | str) -> None:
        cid = self._require_running()
        path = self._normalize_workspace_path(path)
        raw = data if isinstance(data, bytes) else data.encode()
        b64 = base64.b64encode(raw).decode()
        parent = str(Path(path).parent)
        r = self.bash(
            f"mkdir -p {shlex.quote(parent)} && echo {shlex.quote(b64)} | base64 -d > {shlex.quote(path)}",
            timeout=120,
        )
        if not r.ok:
            raise OSError(f"write_file failed: {r.stderr}")

    def inspect_media(self, path: str, times: list[float] | None = None) -> MediaInspection:
        path = self._normalize_workspace_path(path)
        times = times if times is not None else [0.0]
        probe = self.bash(
            f"ffprobe -v error -print_format json -show_format -show_streams {shlex.quote(path)}",
            timeout=120,
        )
        if not probe.ok:
            raise RuntimeError(f"ffprobe failed: {probe.stderr}")
        info = json.loads(probe.stdout)

        frames: list[tuple[float, bytes]] = []
        for t in times:
            out = f"/workspace/scratch/frames/frame_{t:.3f}.jpg"
            r = self.bash(
                f"ffmpeg -y -ss {t} -i {shlex.quote(path)} -frames:v 1 -q:v 2 {shlex.quote(out)}",
                timeout=120,
            )
            if not r.ok:
                raise RuntimeError(f"frame extract at t={t} failed: {r.stderr}")
            frames.append((t, self.read_file(out, binary=True)))  # type: ignore[arg-type]
        return MediaInspection(path=path, ffprobe=info, frames=frames)

    def web_get(self, url: str, dest: str | None = None) -> WebResult:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return WebResult(url=url, ok=False, status_code=None, path=None, error="only http/https")
        if not dest:
            name = Path(parsed.path).name or "download.bin"
            dest = f"/workspace/scratch/downloads/{name}"
        dest = self._normalize_workspace_path(dest)
        # Prefer curl with proxy env already set in the container.
        # Do not use curl -f: allowlisted origins may return 403/404 to bots;
        # success means the proxy reached the host and wrote a response.
        r = self.bash(
            f"mkdir -p $(dirname {shlex.quote(dest)}) && "
            f"curl -sS -L --max-time 120 -o {shlex.quote(dest)} -w '%{{http_code}}' {shlex.quote(url)}",
            timeout=150,
        )
        if r.timed_out or (r.exit_code != 0 and not r.stdout.strip()):
            return WebResult(
                url=url,
                ok=False,
                status_code=None,
                path=None,
                error=(r.stderr or r.stdout or "download failed").strip(),
            )
        # curl -w writes status to stdout; file is on disk even for HTTP error codes.
        try:
            status = int(r.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            status = None
        if status is None and r.exit_code != 0:
            return WebResult(
                url=url,
                ok=False,
                status_code=None,
                path=None,
                error=(r.stderr or r.stdout or "download failed").strip(),
            )
        size_r = self.bash(f"wc -c < {shlex.quote(dest)}", timeout=30)
        nbytes = int(size_r.stdout.strip() or "0") if size_r.ok else 0
        # Append URL log for sources.json
        self.bash(
            f"printf '%s\\n' {shlex.quote(url)} >> /workspace/scratch/downloads/sources.log",
            timeout=15,
        )
        # Proxy forbid usually yields empty/failed curl; treat 000/no status as fail.
        ok = status is not None and status > 0
        return WebResult(
            url=url,
            ok=ok,
            status_code=status,
            path=dest if ok else None,
            bytes_written=nbytes,
            error=None if ok else (r.stderr or f"http {status}"),
        )

    def collect_deliverables(self, dest: Path) -> list[Path]:
        dest = Path(dest)
        dest.mkdir(parents=True, exist_ok=True)
        self._require_running()
        # Prefer host bind mount (compose maps deliverable_files).
        src = self._deliverable_dir
        if src is None or not src.exists():
            cid = self.container_id
            assert cid is not None
            with tempfile.TemporaryDirectory(prefix="gdpval-collect-") as td:
                local = Path(td) / "out"
                local.mkdir()
                subprocess.run(
                    ["docker", "cp", f"{cid}:/workspace/deliverable_files/.", str(local)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                src = local
        copied: list[Path] = []
        for p in src.rglob("*"):
            if p.is_file() and p.name != ".keep":
                rel = p.relative_to(src)
                out = dest / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, out)
                copied.append(out)
        return sorted(copied)


__all__ = [
    "Sandbox",
    "ExecResult",
    "MediaInspection",
    "WebResult",
    "REPO_ROOT",
    "ENV_DIR",
    "STOCK_API_ENV_KEYS",
]
