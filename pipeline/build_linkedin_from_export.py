#!/usr/bin/env python3
"""
build_linkedin_from_export.py
-----------------------------
Turns the LinkedIn Page admin Excel/CSV exports into the dashboard's LinkedIn
source of truth — replacing the fabricated SAMPLE data with real numbers.

Reads (auto-discovered by filename, or pass explicit paths):
  --followers  export with Date + follower counts   (followers/growth + history)
  --content    export with per-post rows            (posts table + daily trend)
  --visitors   export with page views / unique visitors

Writes:
  data/linkedin_latest.json   -> the LinkedInPanel reads this (source:"export")
  data/snapshots.json         -> linkedin/followers history + linkedin/impressions
                                 (idempotent, via save_snapshot)

It auto-detects columns from common LinkedIn export headers. If a file's layout
doesn't match, it prints the filename + the headers it saw and skips that file
(rather than guessing) — share that output and the columns get mapped exactly.

Usage:
  python pipeline/build_linkedin_from_export.py
  python pipeline/build_linkedin_from_export.py --followers Followers.xlsx --content Content.xlsx --visitors Visitors.xlsx
"""

import os
import re
import sys
import csv
import glob
import json
import argparse
from datetime import datetime, timezone

from save_snapshot import save_snapshot

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(DATA, "linkedin_latest.json")
ORG_NAME = os.getenv("LINKEDIN_COMPANY", "mangrove-technologies-inc")
ORG_URL = f"https://www.linkedin.com/company/{ORG_NAME}/"


# ---------- reading ----------
def read_table(path):
    """Return (headers, rows[dict]) from .csv/.xlsx, locating the header row."""
    if path.lower().endswith((".xlsx", ".xlsm")):
        try:
            from openpyxl import load_workbook
        except ImportError:
            sys.exit("Reading .xlsx needs openpyxl: pip install openpyxl")
        wb = load_workbook(path, read_only=True, data_only=True)
        best = None
        for ws in wb.worksheets:
            rows = [list(r) for r in ws.iter_rows(values_only=True)]
            hi = _header_row(rows)
            if hi is not None:
                header = [str(c).strip() if c is not None else "" for c in rows[hi]]
                data = [dict(zip(header, r)) for r in rows[hi + 1:] if any(c is not None for c in r)]
                # Prefer the sheet with the most usable columns.
                if best is None or len(header) > len(best[0]):
                    best = (header, data)
        return best or ([], [])
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    hi = _header_row(rows) or 0
    header = [c.strip() for c in rows[hi]]
    return header, [dict(zip(header, r)) for r in rows[hi + 1:] if any(r)]


def _header_row(rows):
    for i, r in enumerate(rows[:15]):
        joined = " ".join(str(c).lower() for c in r if c)
        if any(h in joined for h in ("date", "impression", "follower", "page view", "post", "update")):
            return i
    return None


def pick(headers, *hints):
    for h in headers:
        hl = str(h).lower()
        if any(x in hl for x in hints):
            return h
    return None


def num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except (ValueError, TypeError):
        return None


def parse_date(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    v = str(v).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%b %d, %Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", v)
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None


# ---------- parsers ----------
def parse_followers(path):
    headers, rows = read_table(path)
    dcol = pick(headers, "date")
    tcol = pick(headers, "total follower", "cumulative")
    ncol = pick(headers, "new follower", "total")  # LinkedIn "New followers" or a "Total" delta col
    if not dcol or not (tcol or ncol):
        return None, f"followers: headers not matched -> {headers}"
    series, running = [], 0
    for r in rows:
        d = parse_date(r.get(dcol))
        if not d:
            continue
        if tcol:
            v = num(r.get(tcol))
            if v is not None:
                series.append((d, int(v)))
        else:
            running += int(num(r.get(ncol)) or 0)
            series.append((d, running))
    series.sort()
    return series, f"followers: {len(series)} rows via '{tcol or ncol}'"


def parse_content(path):
    headers, rows = read_table(path)
    tcol = pick(headers, "post title", "update title", "post", "title", "content")
    ucol = pick(headers, "post url", "update url", "url", "link")
    dcol = pick(headers, "created", "date", "posted")
    icol = pick(headers, "impression")
    rcol = pick(headers, "reaction", "like")
    ccol = pick(headers, "comment")
    scol = pick(headers, "repost", "share")
    ecol = pick(headers, "engagement rate")
    if not icol:
        return [], [], f"content: no impressions column -> {headers}"
    posts, daily = [], {}
    for i, r in enumerate(rows):
        imp = num(r.get(icol))
        if imp is None:
            continue
        d = parse_date(r.get(dcol)) if dcol else None
        reac = int(num(r.get(rcol)) or 0) if rcol else 0
        com = int(num(r.get(ccol)) or 0) if ccol else 0
        sh = int(num(r.get(scol)) or 0) if scol else 0
        er = num(r.get(ecol)) if ecol else None
        if er is None:
            er = round((reac + com + sh) / imp * 100, 3) if imp else 0.0
        posts.append({
            "id": f"post{i}", "date": d, "text": (str(r.get(tcol) or "").strip()[:200] if tcol else ""),
            "impressions": int(imp), "reactions": reac, "comments": com, "shares": sh,
            "engagement_rate": er, "url": (str(r.get(ucol)).strip() if ucol and r.get(ucol) else None),
        })
        if d:
            b = daily.setdefault(d, {"date": d, "impressions": 0, "engagements": 0})
            b["impressions"] += int(imp)
            b["engagements"] += reac + com + sh
    posts.sort(key=lambda p: p.get("date") or "", reverse=True)
    return posts, sorted(daily.values(), key=lambda x: x["date"]), f"content: {len(posts)} posts"


def parse_visitors(path):
    headers, rows = read_table(path)
    pv = pick(headers, "page view")
    uv = pick(headers, "unique visitor")
    out = {}
    if pv:
        out["page_views"] = int(sum(num(r.get(pv)) or 0 for r in rows))
    if uv:
        out["unique_visitors"] = int(sum(num(r.get(uv)) or 0 for r in rows))
    return out, f"visitors: {out or 'no page-view/visitor columns -> ' + str(headers)}"


# ---------- discovery + assembly ----------
def discover(kind, explicit, search_dirs):
    if explicit:
        return explicit
    pats = {"followers": ["*ollower*"], "content": ["*ontent*", "*ost*", "*update*"], "visitors": ["*isitor*"]}[kind]
    for d in search_dirs:
        for pat in pats:
            for ext in ("xlsx", "xls", "csv"):
                hits = glob.glob(os.path.join(d, f"{pat}.{ext}"))
                if hits:
                    return hits[0]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--followers"); ap.add_argument("--content"); ap.add_argument("--visitors")
    ap.add_argument("--dir", default=None, help="folder to search for exports")
    args = ap.parse_args()
    search = [args.dir] if args.dir else [os.path.join(HERE, ".."),
             os.path.join(HERE, "..", "uploads"), os.path.join(HERE, "..", "data")]
    search = [d for d in search if d and os.path.isdir(d)]

    f_file = discover("followers", args.followers, search)
    c_file = discover("content", args.content, search)
    v_file = discover("visitors", args.visitors, search)
    print("Files:", {"followers": f_file, "content": c_file, "visitors": v_file})

    summary, followers_history, posts, daily = {}, [], [], []
    notes = []

    if f_file:
        series, note = parse_followers(f_file); notes.append(note)
        if series:
            followers_history = [{"date": d, "followers": v} for d, v in series]
            summary["followers"] = series[-1][1]
            summary["follower_growth"] = series[-1][1] - series[0][1] if len(series) > 1 else None
    else:
        notes.append("followers: file not found")

    if c_file:
        posts, daily, note = parse_content(c_file); notes.append(note)
        if posts:
            summary["post_impressions"] = sum(p["impressions"] for p in posts)
            summary["post_reactions"] = sum(p["reactions"] for p in posts)
            summary["post_comments"] = sum(p["comments"] for p in posts)
            summary["post_shares"] = sum(p["shares"] for p in posts)
            imp = summary["post_impressions"]
            eng = summary["post_reactions"] + summary["post_comments"] + summary["post_shares"]
            summary["engagement_rate"] = round(eng / imp * 100, 2) if imp else None
    else:
        notes.append("content: file not found")

    if v_file:
        vis, note = parse_visitors(v_file); notes.append(note); summary.update(vis)
    else:
        notes.append("visitors: file not found")

    if "followers" not in summary:
        print("\n".join(notes))
        sys.exit("\nNo follower data parsed — cannot mark LinkedIn live. Share the headers above.")

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "export", "window_days": 30,
        "organization": {"name": ORG_NAME, "url": ORG_URL, "followers": summary.get("followers"), "logo_url": None},
        "summary": summary, "followers_history": followers_history, "daily": daily, "posts": posts,
    }
    os.makedirs(DATA, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    snap = [{"platform": "linkedin", "metric": "followers", "value": v, "date": d} for d, v in
            [(h["date"], h["followers"]) for h in followers_history]]
    snap += [{"platform": "linkedin", "metric": "impressions", "value": r["impressions"], "date": r["date"]} for r in daily]
    save_snapshot(snap)

    print("\n".join(notes))
    print(f"\nWrote {OUT}")
    print(f"followers={summary.get('followers')} | history {followers_history[0]['date'] if followers_history else '—'} "
          f"→ {followers_history[-1]['date'] if followers_history else '—'} | posts={len(posts)} | "
          f"page_views={summary.get('page_views')} unique_visitors={summary.get('unique_visitors')}")


if __name__ == "__main__":
    main()
