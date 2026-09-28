#!/usr/bin/env python3
"""
Put DATABASE_URL into .env from the clipboard, without the secret ever
appearing in chat, in the terminal, or in shell history.

TiDB Cloud's Connect panel hands you the credential in several shapes
depending on which tab and "Connect With" option you are on, and only one of
them is the mysql:// URI the app wants. This accepts any of them:

  1. a mysql:// URI                      (Connection String tab, some drivers)
  2. the `mysql -u ... -h ... -p'...'`   command (Connection String > General)
  3. just the password                   (Parameters tab, after Reset Password)

For (3) the non-secret parts — host, port, user, database — are read from the
existing DATABASE_URL line in .env, so only the password needs copying.

Usage:  python3 scripts/set-database-url.py
"""

from __future__ import annotations

import getpass
import pathlib
import re
import shlex
import subprocess
import sys
from urllib.parse import quote, urlsplit

ENV_PATH = pathlib.Path(__file__).resolve().parent.parent / ".env"


def clipboard() -> str:
    try:
        return subprocess.run(["pbpaste"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        sys.exit(f"Could not read the clipboard: {exc}")


def existing_parts() -> dict[str, str]:
    """Host, port, user and database from whatever DATABASE_URL is there now."""
    if not ENV_PATH.exists():
        return {}
    for line in ENV_PATH.read_text().split("\n"):
        if line.startswith("DATABASE_URL=") and "mysql://" in line:
            try:
                u = urlsplit(line.split("=", 1)[1].strip())
                return {
                    "host": u.hostname or "",
                    "port": str(u.port or 4000),
                    "user": u.username or "",
                    "database": (u.path or "/").lstrip("/"),
                }
            except ValueError:
                return {}
    return {}


def from_cli_command(text: str) -> dict[str, str] | None:
    """Parse TiDB's `mysql --comments -u '..' -h .. -P .. -D .. -p'..'` form."""
    if "mysql" not in text or " -" not in text:
        return None
    try:
        tokens = shlex.split(text)
    except ValueError:
        return None

    parts: dict[str, str] = {}
    flags = {"-u": "user", "-h": "host", "-P": "port", "-D": "database"}
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in flags and index + 1 < len(tokens):
            parts[flags[token]] = tokens[index + 1]
            index += 2
            continue
        # -p is attached to its value: -p'secret'. A bare -p means "prompt me",
        # which carries no password at all.
        if token.startswith("-p") and len(token) > 2:
            parts["password"] = token[2:]
        index += 1
    return parts if parts.get("host") and parts.get("password") else None


def build(parts: dict[str, str]) -> str:
    missing = [k for k in ("host", "user", "password", "database") if not parts.get(k)]
    if missing:
        sys.exit(
            "Missing " + ", ".join(missing) + ".\n"
            "Copy the full connection string from TiDB Cloud > Connect > Connection String,\n"
            "or copy just the password if .env already has the other details."
        )
    # The password is generated and may contain characters that are not legal
    # in a URI unencoded.
    return (
        f"mysql://{quote(parts['user'], safe='')}:{quote(parts['password'], safe='')}"
        f"@{parts['host']}:{parts.get('port') or '4000'}/{parts['database']}"
    )


def write(url: str) -> None:
    if not ENV_PATH.exists():
        sys.exit(f"No .env at {ENV_PATH}. Run: cp .env.example .env")
    lines = ENV_PATH.read_text().split("\n")
    out, replaced = [], False
    for line in lines:
        if line.startswith("DATABASE_URL=") and not replaced:
            out.append("DATABASE_URL=" + url)
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append("DATABASE_URL=" + url)
    ENV_PATH.write_text("\n".join(out))


def prompt() -> str:
    """Ask for the value directly. Hidden input, so it never appears on screen
    and never reaches shell history — unlike typing it as an argument."""
    print("Paste the connection string (or just the password) and press Enter.")
    print("Nothing will appear as you paste — that is deliberate.")
    return getpass.getpass("> ").strip()


def _recognisable(text: str) -> bool:
    return text.startswith("mysql://") or from_cli_command(text) is not None or (
        re.fullmatch(r"\S+", text) is not None and len(text) < 200
    )


def main() -> None:
    # The clipboard is a guess; a prompt is not. Try the clipboard, but fall
    # back to asking rather than failing, because "could not recognise the
    # clipboard contents" leaves someone with nowhere to go.
    text = clipboard()
    if not text or not _recognisable(text):
        text = prompt()
    if not text:
        sys.exit("Nothing entered.")

    known = existing_parts()

    if text.startswith("mysql://"):
        url, shape = text, "a mysql:// URI"
    elif (cli := from_cli_command(text)) is not None:
        url, shape = build({**known, **cli}), "the mysql CLI command"
    elif re.fullmatch(r"\S+", text) and len(text) < 200:
        # Anything else that is a single token with no spaces: treat it as the
        # password and reuse the non-secret parts already in .env.
        if not known:
            sys.exit(
                "That looks like a password, but .env has no existing DATABASE_URL to take\n"
                "the host, user and database from. Copy the full connection string instead."
            )
        url, shape = build({**known, "password": text}), "a bare password"
    else:
        sys.exit(
            "Could not recognise that.\n"
            "Paste one of: the mysql:// URI, TiDB's `mysql -u ... -p'...'` command, or the password."
        )

    write(url)

    shown = urlsplit(url)
    print(f"Read {shape}.")
    print("Wrote DATABASE_URL to .env — the value itself was not displayed.")
    print(f"  host:     {shown.hostname}")
    print(f"  port:     {shown.port}")
    print(f"  user:     {shown.username}")
    print(f"  database: {(shown.path or '/').lstrip('/')}")
    print(f"  password: {len(shown.password or '')} characters")


if __name__ == "__main__":
    main()
