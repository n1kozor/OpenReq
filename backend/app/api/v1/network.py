import asyncio
import logging
import platform
import re
import socket
import subprocess
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.network import (
    DnsResolveRequest,
    DnsResolveResponse,
    DnsRecord,
    PingRequest,
    PingResponse,
    PingResult,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _sanitize_hostname(raw: str) -> str:
    """Extract hostname from a possibly-URL input."""
    raw = raw.strip()
    if "://" in raw:
        parsed = urlparse(raw)
        host = parsed.hostname
        if host:
            return host
    if ":" in raw:
        raw = raw.split(":")[0]
    if "/" in raw:
        raw = raw.split("/")[0]
    return raw


@router.post("/dns", response_model=DnsResolveResponse)
async def dns_resolve(
    payload: DnsResolveRequest,
    current_user: User = Depends(get_current_user),
):
    hostname = _sanitize_hostname(payload.hostname)
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid hostname")

    logger.info("DNS resolve | user=%s hostname=%s", current_user.id, hostname)

    try:
        start = time.perf_counter()
        results = await asyncio.to_thread(
            socket.getaddrinfo, hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM
        )
        elapsed = (time.perf_counter() - start) * 1000
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail=f"DNS resolution failed: {exc}")

    seen = set()
    records: list[DnsRecord] = []
    for family, _type, _proto, _canonname, sockaddr in results:
        ip = sockaddr[0]
        if ip in seen:
            continue
        seen.add(ip)
        family_name = "IPv4" if family == socket.AF_INET else "IPv6"
        records.append(DnsRecord(ip=ip, family=family_name))

    return DnsResolveResponse(
        hostname=hostname,
        records=records,
        elapsed_ms=round(elapsed, 2),
    )


@router.post("/ping", response_model=PingResponse)
async def ping(
    payload: PingRequest,
    current_user: User = Depends(get_current_user),
):
    hostname = _sanitize_hostname(payload.hostname)
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid hostname")

    logger.info("Ping | user=%s hostname=%s count=%d", current_user.id, hostname, payload.count)

    is_windows = platform.system().lower() == "windows"
    count_flag = "-n" if is_windows else "-c"
    cmd = ["ping", count_flag, str(payload.count), hostname]
    timeout_secs = payload.count * 5 + 5

    def _run_ping() -> tuple[str, float]:
        s = time.perf_counter()
        kwargs: dict = {"capture_output": True, "timeout": timeout_secs}
        # Suppress console window popup on Windows; attribute doesn't exist on Linux
        if is_windows and hasattr(subprocess, "CREATE_NO_WINDOW"):
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        result = subprocess.run(cmd, **kwargs)
        e = (time.perf_counter() - s) * 1000
        # On Windows, ping output uses the OEM codepage (e.g. cp437 / cp850)
        encoding = "cp850" if is_windows else "utf-8"
        out = result.stdout.decode(encoding, errors="replace")
        if not out and result.stderr:
            out = result.stderr.decode(encoding, errors="replace")
        return out, e

    try:
        output, elapsed = await asyncio.to_thread(_run_ping)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Ping timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Ping command not available on this system")
    except Exception as exc:
        logger.exception("Ping failed for hostname=%s", hostname)
        raise HTTPException(status_code=500, detail=f"Ping failed: {type(exc).__name__}: {exc}")

    results, resolved_ip, stats = _parse_ping_output(output, is_windows, payload.count)

    return PingResponse(
        hostname=hostname,
        resolved_ip=resolved_ip,
        results=results,
        min_ms=stats.get("min"),
        avg_ms=stats.get("avg"),
        max_ms=stats.get("max"),
        packet_loss_percent=stats.get("loss", 100.0),
        elapsed_ms=round(elapsed, 2),
    )


def _parse_ping_output(
    output: str, is_windows: bool, count: int
) -> tuple[list[PingResult], str | None, dict]:
    results: list[PingResult] = []
    resolved_ip: str | None = None
    stats: dict = {}

    lines = output.splitlines()

    # Extract resolved IP from header — look for IP inside brackets [1.2.3.4] or (1.2.3.4)
    header = lines[0] if lines else ""
    ip_match = re.search(r"[\[\(](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\]\)]", header)
    if ip_match:
        resolved_ip = ip_match.group(1)
    else:
        # Fallback: search entire output for the first bracketed IP
        ip_match = re.search(r"[\[\(](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\]\)]", output)
        if ip_match:
            resolved_ip = ip_match.group(1)

    if is_windows:
        # Language-agnostic Windows parsing.
        # EN: "Reply from 1.2.3.4: bytes=32 time=12ms TTL=117"
        # HU: "Válasz a következőtől: 1.2.3.4: bájtok=32 idő=24ms TTL=52"
        # DE: "Antwort von 1.2.3.4: Bytes=32 Zeit=24ms TTL=52"
        # Common: an IP address followed by some text containing <digits>ms and TTL
        seq = 0
        for line in lines:
            line_stripped = line.strip()
            # Match any reply line: contains IP + time in ms + TTL
            reply_match = re.search(
                r"(\d+\.\d+\.\d+\.\d+).*?[=<](\d+)\s*ms.*TTL", line_stripped, re.IGNORECASE
            )
            if reply_match:
                seq += 1
                t = float(reply_match.group(2))
                results.append(PingResult(seq=seq, time_ms=t, timeout=False))
                continue
            # Timeout: EN "Request timed out" / HU "Kérés túllépte" / DE "Zeitüberschreitung"
            # Also catch "Destination host unreachable" / "A célállomás" / "Zielhost"
            low = line_stripped.lower()
            if any(kw in low for kw in [
                "timed out", "időtúllépés", "túllépte", "zeitüberschreitung",
                "destination", "célállomás", "zielhost", "nicht erreichbar",
            ]):
                seq += 1
                results.append(PingResult(seq=seq, time_ms=None, timeout=True))
                continue

        # Stats — look for 3 numbers with ms (Minimum/Maximum/Average or localized)
        stat_match = re.search(
            r"=\s*(\d+)\s*ms.*=\s*(\d+)\s*ms.*=\s*(\d+)\s*ms",
            output, re.IGNORECASE
        )
        if stat_match:
            stats["min"] = float(stat_match.group(1))
            stats["max"] = float(stat_match.group(2))
            stats["avg"] = float(stat_match.group(3))

        # Packet loss: "(0% loss)" / "(0% Verlust)" / "(0% veszteség)"
        loss_match = re.search(r"\((\d+)%", output)
        if loss_match:
            stats["loss"] = float(loss_match.group(1))
        else:
            sent = len(results)
            received = sum(1 for r in results if not r.timeout)
            stats["loss"] = ((sent - received) / sent * 100) if sent > 0 else 100.0

    else:
        # Linux/Mac: "64 bytes from 142.250.186.78: icmp_seq=1 ttl=117 time=12.3 ms"
        for line in lines:
            line_stripped = line.strip()
            reply_match = re.match(
                r"\d+ bytes from .+: icmp_seq=(\d+).+time=([\d.]+)\s*ms",
                line_stripped, re.IGNORECASE
            )
            if reply_match:
                seq = int(reply_match.group(1))
                t = float(reply_match.group(2))
                results.append(PingResult(seq=seq, time_ms=t, timeout=False))
                continue

        # Fill in timeouts for missing sequences
        received_seqs = {r.seq for r in results}
        for i in range(1, count + 1):
            if i not in received_seqs:
                results.append(PingResult(seq=i, time_ms=None, timeout=True))
        results.sort(key=lambda r: r.seq)

        # Stats: "rtt min/avg/max/mdev = 11.123/12.456/14.789/1.234 ms"
        stat_match = re.search(
            r"rtt min/avg/max/\w+\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)", output
        )
        if stat_match:
            stats["min"] = float(stat_match.group(1))
            stats["avg"] = float(stat_match.group(2))
            stats["max"] = float(stat_match.group(3))

        # Packet loss: "0% packet loss"
        loss_match = re.search(r"(\d+)%\s*packet loss", output, re.IGNORECASE)
        if loss_match:
            stats["loss"] = float(loss_match.group(1))
        else:
            sent = len(results)
            received = sum(1 for r in results if not r.timeout)
            stats["loss"] = ((sent - received) / sent * 100) if sent > 0 else 100.0

    return results, resolved_ip, stats
