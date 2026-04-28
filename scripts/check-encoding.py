"""
check-encoding.py - guardrail against UTF-8 corruption (mojibake)

Run by the pre-commit hook. Scans staged source files for two failure
modes that have caused real outages on this project:

  1. Mojibake — byte sequence C3 XX C3 YY etc. that signals UTF-8 was
     decoded as Latin-1/Windows-1252 and re-encoded as UTF-8. Symptom
     in the rendered UI: every emoji becomes a 4-6 char garbage string
     like "AAEUR" or similar.

  2. Emoji loss — file has fewer multi-byte UTF-8 emoji bytes (F0 9F)
     than its last committed version. Catches the case where a tool
     "succeeded" but quietly stripped emoji.

Exits non-zero if anything looks wrong, with a clear message.
Skips deleted files, binary files, and anything outside the source tree.
"""

import os, subprocess, sys

# Filetypes that should always be UTF-8
WATCHED_EXTS = {".ts", ".tsx", ".js", ".jsx", ".md", ".json", ".css", ".html", ".sql", ".py"}

def staged_files():
    """Files staged for commit (added or modified, not deleted)."""
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        capture_output=True, text=True, check=True,
    )
    return [f.strip() for f in out.stdout.splitlines() if f.strip()]

def watched(path):
    return os.path.splitext(path)[1].lower() in WATCHED_EXTS

def count_mojibake(data):
    """Count C3 XX C3 YY sequences (UTF-8-decoded-as-Latin1-then-re-encoded)."""
    n = 0
    for i in range(len(data) - 4):
        if (data[i] == 0xC3 and 0x80 <= data[i+1] <= 0xBF
            and (data[i+2] == 0xC3 or data[i+2] == 0xC2)):
            n += 1
    return n

def count_emoji(data):
    """Count UTF-8 4-byte emoji starts (F0 9F XX XX, U+1F000-U+1FFFF)."""
    n = 0
    for i in range(len(data) - 4):
        if data[i] == 0xF0 and data[i+1] == 0x9F:
            n += 1
    return n

def staged_bytes(path):
    """Read the staged (index) version of a file as raw bytes."""
    out = subprocess.run(
        ["git", "show", f":{path}"],
        capture_output=True, check=True,
    )
    return out.stdout

def head_bytes(path):
    """Read the HEAD version of a file as raw bytes. Returns None if file is new."""
    try:
        out = subprocess.run(
            ["git", "show", f"HEAD:{path}"],
            capture_output=True, check=True,
        )
        return out.stdout
    except subprocess.CalledProcessError:
        return None

def main():
    try:
        files = staged_files()
    except subprocess.CalledProcessError as e:
        print(f"check-encoding: git error: {e}", file=sys.stderr)
        return 1

    files = [f for f in files if watched(f)]
    if not files:
        return 0

    bad = []
    for path in files:
        try:
            current = staged_bytes(path)
        except subprocess.CalledProcessError:
            continue

        # Mojibake check
        moji = count_mojibake(current)
        if moji > 0:
            bad.append((path, "mojibake",
                f"{moji} mojibake byte sequences (C3 XX C3 YY) — looks like UTF-8 was decoded as Latin-1 then re-encoded"))
            continue

        # Emoji-loss check (compare against HEAD)
        prev = head_bytes(path)
        if prev is not None:
            curr_emoji = count_emoji(current)
            prev_emoji = count_emoji(prev)
            if curr_emoji < prev_emoji:
                lost = prev_emoji - curr_emoji
                bad.append((path, "emoji loss",
                    f"emoji byte count dropped from {prev_emoji} to {curr_emoji} (lost {lost})"))

    if not bad:
        return 0

    print("", file=sys.stderr)
    print("=" * 70, file=sys.stderr)
    print("ENCODING CHECK FAILED", file=sys.stderr)
    print("=" * 70, file=sys.stderr)
    for path, kind, msg in bad:
        print(f"  [{kind}] {path}", file=sys.stderr)
        print(f"    {msg}", file=sys.stderr)
    print("", file=sys.stderr)
    print("Most likely cause: a PowerShell read+write loop using", file=sys.stderr)
    print("Get-Content -Raw + WriteAllText, which double-encodes UTF-8.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Fix: use Python (open(path, encoding='utf-8') etc.) for any", file=sys.stderr)
    print("read/write of files containing emoji or non-ASCII characters.", file=sys.stderr)
    print("", file=sys.stderr)
    print("To recover the affected files, run:", file=sys.stderr)
    for path, _, _ in bad:
        print(f"  git checkout HEAD -- {path}", file=sys.stderr)
    print("", file=sys.stderr)
    print("Bypass (NOT recommended): commit with --no-verify", file=sys.stderr)
    print("=" * 70, file=sys.stderr)
    return 1

if __name__ == "__main__":
    sys.exit(main())