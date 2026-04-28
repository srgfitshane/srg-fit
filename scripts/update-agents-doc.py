"""
update-agents-doc.py - patch AGENTS.md / CLAUDE.md / GEMINI.md (mirrored)
"""
import os, io

PATHS = [
    r"C:\Users\Shane\OneDrive\Desktop\srg-fit\AGENTS.md",
    r"C:\Users\Shane\OneDrive\Desktop\srg-fit\CLAUDE.md",
    r"C:\Users\Shane\OneDrive\Desktop\srg-fit\GEMINI.md",
]

OLD_STEP_3 = "3. `npx tsc --noEmit` (takes ~30s-3min depending on scope)"
NEW_STEP_3 = """3. **`scripts\\verify.cmd`** (encoding check + `next build`, ~30-90s).
   `tsc --noEmit` alone is NOT sufficient -- Turbopack catches import-syntax
   errors that tsc misses. The pre-commit hook runs verify.cmd automatically;
   running it explicitly gives faster feedback during a session"""

OLD_DISCIPLINE = "`edit_block` / surgical str-replace tools fail on long files with"
NEW_DISCIPLINE_BANNER = """**This rule is non-negotiable. It got broken on April 28 2026
when I (Claude) used PowerShell `Get-Content -Raw + WriteAllText` for
"small" edits and destroyed every emoji byte in three files. Recovery
took multiple commits. Don't do it.**

`edit_block` / surgical str-replace tools fail on long files with"""

GUARDRAILS_SECTION = """

## Guardrails (added April 28 2026)

After a session that destroyed emoji in 3 files and shipped a
syntactically-broken import, the following guardrails were added:

### `scripts\\verify.cmd`

The single command to run before claiming a fix is "ready to ship".
Runs encoding check (fast) + `next build` (slow but bulletproof).

```cmd
scripts\\verify.cmd            # full check (~60s)
scripts\\verify.cmd --no-build # encoding only (~1s)
```

### Pre-commit hook

`.git-hooks/pre-commit` runs `verify.cmd` on every commit. After a
fresh clone, run `scripts\\install-hooks.cmd` once to wire it up.
Bypass with `git commit --no-verify` when genuinely needed.

### `scripts\\check-encoding.py`

Scans staged files for two specific failure modes:
- **Mojibake** -- `C3 XX C3 YY` byte sequences signaling UTF-8 was
  decoded as Latin-1 and re-encoded.
- **Emoji loss** -- file has fewer F0 9F emoji bytes than its HEAD
  version. Catches tools that "succeed" but silently strip emoji.

Refuses the commit with a clear message including recovery commands.

### `.gitattributes` + `.editorconfig`

Lock UTF-8 + LF line endings on all source filetypes.

### Lessons from the April 28 incident

1. **`tsc --noEmit` is not enough.** It doesn't run Turbopack's
   parser, so syntax errors inside import declarations slip through.
   Use `next build` for ship-readiness.

2. **Never use PowerShell `Get-Content -Raw` for files with
   non-ASCII content.** It decodes via Windows-1252 codepage. The
   only safe way to read+write `.ts`/`.tsx`/`.md` in this repo is
   Python with `encoding='utf-8'`.

3. **Sweep scripts should target import injection carefully.** Use
   a full statement match (DOTALL across `{ ... }`), not a single-line
   `^import .+$` regex.

4. **Sweep scripts should anchor bare-identifier alternatives.**
   `|color` in a regex alternation matches partial expressions like
   `(obj as Type).color+'XX'`, producing garbage. Always lookbehind:
   `(?<![.\\w])color`.
"""

for path in PATHS:
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        txt = f.read()
    
    nl = "\r\n" if "\r\n" in txt else "\n"
    changed = False
    
    old_step_3_nl = OLD_STEP_3.replace("\n", nl)
    new_step_3_nl = NEW_STEP_3.replace("\n", nl)
    if old_step_3_nl in txt:
        txt = txt.replace(old_step_3_nl, new_step_3_nl, 1)
        changed = True
        print(f"  patched step 3 in {os.path.basename(path)}")
    elif "scripts\\verify.cmd" in txt:
        print(f"  step 3 already patched in {os.path.basename(path)}")
    
    if "got broken on April 28 2026" not in txt:
        if OLD_DISCIPLINE in txt:
            txt = txt.replace(OLD_DISCIPLINE, NEW_DISCIPLINE_BANNER, 1)
            changed = True
            print(f"  added discipline banner in {os.path.basename(path)}")
    else:
        print(f"  banner already present in {os.path.basename(path)}")
    
    if "## Guardrails (added April 28 2026)" not in txt:
        if not txt.endswith(nl):
            txt = txt + nl
        txt = txt + GUARDRAILS_SECTION.replace("\n", nl)
        changed = True
        print(f"  appended Guardrails section to {os.path.basename(path)}")
    else:
        print(f"  Guardrails section already in {os.path.basename(path)}")
    
    if changed:
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(txt)
        print(f"  saved {os.path.basename(path)}")