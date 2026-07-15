#!/usr/bin/env python3
"""
backfill_pypi.py  (Phase 2.2)
-----------------------------
One-off historical backfill of daily PyPI downloads into the snapshot store,
from the BigQuery public dataset `bigquery-public-data.pypi.file_downloads`.

OWNER SETUP REQUIRED (not runnable without this):
  - A Google Cloud project with BigQuery API enabled and billing attached.
  - `pip install google-cloud-bigquery`
  - Auth: `gcloud auth application-default login`  (or a service-account JSON
    via GOOGLE_APPLICATION_CREDENTIALS), and set GCP_PROJECT=<your-project>.

COST NOTE: this dataset is large. The query below is filtered to the three
Mangrove packages and the last N days and reads only the date-partitioned
column, but always review the "This query will process X" estimate first.

Methodology matches the live figure (fetch_pypi_data.py): mirror traffic is
excluded (bandersnatch / mirror installers), packages summed = the same three.

  GCP_PROJECT=my-proj python pipeline/backfill_pypi.py --days 365
"""

import os
import sys
import argparse

from save_snapshot import save_snapshot

PACKAGES = ["mangrovemarkets", "mangroveai", "mangrove-kb"]

QUERY = """
SELECT CAST(DATE(timestamp) AS STRING) AS day, COUNT(*) AS downloads
FROM `bigquery-public-data.pypi.file_downloads`
WHERE file.project IN UNNEST(@packages)
  AND DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
  -- exclude mirror/CI traffic to match the live "without_mirrors" figure
  AND (details.installer.name IS NULL OR details.installer.name NOT IN ('bandersnatch', 'z3c.pypimirror'))
GROUP BY day
ORDER BY day
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()

    try:
        from google.cloud import bigquery
    except ImportError:
        print("Missing dependency. Run: pip install google-cloud-bigquery", file=sys.stderr)
        sys.exit(1)

    project = os.getenv("GCP_PROJECT")
    if not project:
        print("Set GCP_PROJECT and authenticate (gcloud auth application-default login).", file=sys.stderr)
        sys.exit(1)

    client = bigquery.Client(project=project)
    job = client.query(QUERY, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("packages", "STRING", PACKAGES),
            bigquery.ScalarQueryParameter("days", "INT64", args.days),
        ]
    ))
    rows = [{"platform": "pypi", "metric": "downloads",
             "value": int(r["downloads"]), "date": r["day"]} for r in job]
    n = save_snapshot(rows)
    print(f"Backfilled {n} PyPI download rows over the last {args.days} days.")


if __name__ == "__main__":
    main()
