#!/usr/bin/env python3
from pathlib import Path
import argparse, subprocess, sys, yaml
ROOT=Path(__file__).resolve().parents[2]
VENDORS=["copilotkit","mastra","supabase","gemini"]
parser=argparse.ArgumentParser(description="Report vendor-skill upstream drift without modifying trusted files")
parser.add_argument("--strict", action="store_true", help="exit nonzero on drift or lookup failure")
args=parser.parse_args()
problems=[]
for name in VENDORS:
    manifest=ROOT/name/"upstream.yaml"
    meta=yaml.safe_load(manifest.read_text()) or {}
    repo=meta.get("repository")
    reviewed=str(meta.get("reviewed_commit", ""))
    if not repo or not reviewed:
        print(f"{name}: UNKNOWN — missing repository/reviewed_commit")
        problems.append(name); continue
    try:
        cp=subprocess.run(["git","ls-remote",repo,"HEAD"],capture_output=True,text=True,timeout=20,check=True)
        head=cp.stdout.split()[0]
    except Exception as exc:
        print(f"{name}: UNKNOWN — {exc}")
        problems.append(name); continue
    if head==reviewed:
        print(f"{name}: CURRENT — {reviewed}")
    else:
        print(f"{name}: UPDATE AVAILABLE — reviewed {reviewed} upstream {head}")
        problems.append(name)
print("Policy: report only; never auto-update pinned skill content.")
if args.strict and problems:
    sys.exit(1)
