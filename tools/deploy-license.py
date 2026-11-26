#!/usr/bin/env python3
"""Novora license-server deployment over SFTP.

The server has no shell access, so this only uploads files. Starting or
restarting the Node process still has to happen in the hosting panel.

Credentials are read from the user's local access file at runtime and are
never written into this repository. Only the host/port and a summary are
printed; the password stays in memory.
"""
from __future__ import annotations

import argparse
import os
import posixpath
import re
import stat
import sys
from pathlib import Path

import paramiko

DEFAULT_CREDS = Path(os.path.expanduser("~")) / "Desktop" / "zugang Streamdeck Server.txt"
SKIP_DIRS = {"test", ".git", "__pycache__", "keys", "node_modules"}
SKIP_FILES = {"config.json"}


def read_credentials(path: Path) -> tuple[str, str, str, int]:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"sftp://([^:]+):([^@]+)@([^:]+):(\d+)", text)
    if not match:
        raise SystemExit(f"Kein sftp://-Eintrag in {path}")
    user, password, host, port = match.groups()
    return user, password, host, int(port)


def ensure_dir(sftp: paramiko.SFTPClient, remote: str) -> None:
    parts = [p for p in remote.split("/") if p]
    current = "/" if remote.startswith("/") else ""
    for part in parts:
        current = posixpath.join(current, part) if current else part
        try:
            sftp.stat(current)
        except IOError:
            sftp.mkdir(current)


def upload_tree(sftp: paramiko.SFTPClient, local: Path, remote: str, dry_run: bool) -> tuple[int, int]:
    files = 0
    total = 0
    ensure_dir(sftp, remote)
    for entry in sorted(local.iterdir(), key=lambda p: (p.is_dir(), p.name.lower())):
        name = entry.name
        if entry.is_dir():
            if name in SKIP_DIRS:
                continue
            f, b = upload_tree(sftp, entry, posixpath.join(remote, name), dry_run)
            files += f
            total += b
            continue
        if name in SKIP_FILES:
            continue
        if not entry.is_file():
            continue
        target = posixpath.join(remote, name)
        size = entry.stat().st_size
        print(f"  {target} ({size} B)")
        if not dry_run:
            sftp.put(str(entry), target, confirm=True)
            sftp.chmod(target, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
        files += 1
        total += size
    return files, total


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload license-server/ to the Novora server via SFTP")
    parser.add_argument("--local", default="license-server", help="local directory (default: license-server)")
    parser.add_argument("--remote", default="/", help="remote directory (default: /)")
    parser.add_argument("--creds", default=str(DEFAULT_CREDS), help="access file with sftp:// URL")
    parser.add_argument("--config", default="", help="optional local config.json to upload as <remote>/config.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--download-pub", action="store_true", help="download keys/license.pub.pem after upload")
    args = parser.parse_args()

    local = Path(args.local)
    if not local.is_dir():
        raise SystemExit(f"Lokaler Ordner fehlt: {local}")

    user, password, host, port = read_credentials(Path(args.creds))
    print(f"SFTP {host}:{port} als {user} -> {args.remote}")
    transport = paramiko.Transport((host, port))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    try:
        files, total = upload_tree(sftp, local, args.remote, args.dry_run)
        if args.config:
            config = Path(args.config)
            if not config.is_file():
                raise SystemExit(f"Config fehlt: {config}")
            target = posixpath.join(args.remote, "config.json")
            print(f"  {target} (config, 600)")
            if not args.dry_run:
                sftp.put(str(config), target, confirm=True)
                sftp.chmod(target, stat.S_IRUSR | stat.S_IWUSR)
        if args.download_pub and not args.dry_run:
            remote_pub = posixpath.join(args.remote, "keys", "license.pub.pem")
            out = local / "keys" / "license.pub.pem"
            out.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(remote_pub, str(out))
            print(f"  public key -> {out}")
        print(f"{'DRY-RUN ' if args.dry_run else ''}{files} Dateien, {total} Bytes")
    finally:
        sftp.close()
        transport.close()

    print("Hinweis: Der Node-Prozess muss im Hosting-Panel gestartet/neu gestartet werden.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
