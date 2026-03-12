#!/usr/bin/env python3
"""Extract selected data from denkidou.json into CSV.

Examples:
  python3 scripts/extract_denkidou.py --list
  python3 scripts/extract_denkidou.py \
    --keys japan_mof_import_hs7403_qty,japan_mof_export_hs7403_qty \
    --start 2025-01-01 --end 2025-12-31 \
    --output /tmp/hs7403_long.csv
  python3 scripts/extract_denkidou.py \
    --keys japan_mof_import_hs7403_qty,japan_mof_export_hs7403_qty \
    --wide --output /tmp/hs7403_wide.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple


def default_input_path() -> Path:
    return Path("/home/bigfooter/dev/public/copper-for-me/japan-dou/denkidou.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract data from denkidou.json")
    parser.add_argument(
        "--input",
        type=Path,
        default=default_input_path(),
        help="Path to denkidou.json",
    )
    parser.add_argument(
        "--keys",
        type=str,
        default="",
        help="Comma-separated exact series keys to extract",
    )
    parser.add_argument(
        "--match",
        type=str,
        default="",
        help="Regex to match series keys (applied in addition to --keys if set)",
    )
    parser.add_argument("--start", type=str, default="", help="Inclusive date filter (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, default="", help="Inclusive date filter (YYYY-MM-DD)")
    parser.add_argument("--wide", action="store_true", help="Output as wide table (date + one column per key)")
    parser.add_argument("--list", action="store_true", help="List series keys and exit")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(""),
        help="Output CSV path. If omitted, prints to stdout.",
    )
    return parser.parse_args()


def load_series(input_path: Path) -> Dict[str, List[dict]]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    series = payload.get("series")
    if not isinstance(series, dict):
        raise ValueError("Invalid format: 'series' object is missing")
    return series


def choose_keys(series: Dict[str, List[dict]], keys_arg: str, match_arg: str) -> List[str]:
    all_keys = sorted(series.keys())
    selected = set()
    if keys_arg.strip():
        for key in [x.strip() for x in keys_arg.split(",") if x.strip()]:
            if key in series:
                selected.add(key)
    if match_arg.strip():
        pattern = re.compile(match_arg)
        for key in all_keys:
            if pattern.search(key):
                selected.add(key)
    if not selected:
        # default: non-empty series only
        selected = {k for k in all_keys if isinstance(series.get(k), list) and len(series.get(k) or []) > 0}
    return sorted(selected)


def in_date_range(date_text: str, start: str, end: str) -> bool:
    if not isinstance(date_text, str) or not date_text:
        return False
    if start and date_text < start:
        return False
    if end and date_text > end:
        return False
    return True


def build_long_rows(
    series: Dict[str, List[dict]],
    keys: List[str],
    start: str,
    end: str,
) -> List[Tuple[str, str, float]]:
    out: List[Tuple[str, str, float]] = []
    for key in keys:
        rows = series.get(key, [])
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            date_text = str(row.get("date", "")).strip()
            if not in_date_range(date_text, start, end):
                continue
            value_raw = row.get("value")
            try:
                value = float(value_raw)
            except (TypeError, ValueError):
                continue
            out.append((key, date_text, value))
    out.sort(key=lambda x: (x[1], x[0]))
    return out


def build_wide_rows(long_rows: List[Tuple[str, str, float]], keys: List[str]) -> List[List[str]]:
    by_date: Dict[str, Dict[str, float]] = {}
    for key, date_text, value in long_rows:
        by_date.setdefault(date_text, {})[key] = value
    rows: List[List[str]] = []
    for date_text in sorted(by_date.keys()):
        row = [date_text]
        for key in keys:
            val = by_date[date_text].get(key, "")
            row.append("" if val == "" else f"{val}")
        rows.append(row)
    return rows


def write_csv_text(lines: List[List[str]]) -> str:
    from io import StringIO

    buf = StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    for line in lines:
        writer.writerow(line)
    return buf.getvalue()


def main() -> int:
    args = parse_args()
    series = load_series(args.input)

    if args.list:
        for key in sorted(series.keys()):
            rows = series.get(key)
            count = len(rows) if isinstance(rows, list) else 0
            first = rows[0].get("date", "") if count else ""
            last = rows[-1].get("date", "") if count else ""
            print(f"{key},count={count},first={first},last={last}")
        return 0

    keys = choose_keys(series, args.keys, args.match)
    if not keys:
        raise ValueError("No matching keys found.")

    long_rows = build_long_rows(series, keys, args.start.strip(), args.end.strip())
    if args.wide:
        lines = [["date", *keys], *build_wide_rows(long_rows, keys)]
    else:
        lines = [["series_key", "date", "value"], *[[k, d, f"{v}"] for k, d, v in long_rows]]

    csv_text = write_csv_text(lines)
    if str(args.output):
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(csv_text, encoding="utf-8")
        print(f"Wrote {args.output} ({len(lines) - 1} rows)")
    else:
        print(csv_text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
