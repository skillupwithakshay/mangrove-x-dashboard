#!/usr/bin/env python3
"""
check_get_tweets.py
--------------------
Follow-up to check_x_auth.py. Use this once GET /2/users/me is confirmed
working but GET /2/users/:id/tweets (get_users_tweets) still 401s.

It bypasses tweepy entirely and calls the endpoint with raw `requests` +
OAuth1, printing the FULL response body and headers. tweepy's exception
messages sometimes just say "Unauthorized" with no detail — this script
shows X's actual JSON error (title/detail/type), which is usually explicit
about the real cause.

USAGE
  pip install requests requests_oauthlib
  export X_API_KEY=... X_API_SECRET=... X_ACCESS_TOKEN=... X_ACCESS_TOKEN_SECRET=...
  python3 diagnostics/check_get_tweets.py
"""

import os
import sys
import json

import requests
from requests_oauthlib import OAuth1

ME_URL = "https://api.x.com/2/users/me"


def main():
    creds = {
        "api_key": os.getenv("X_API_KEY"),
        "api_secret": os.getenv("X_API_SECRET"),
        "access_token": os.getenv("X_ACCESS_TOKEN"),
        "access_token_secret": os.getenv("X_ACCESS_TOKEN_SECRET"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        sys.exit(f"Missing env vars: {missing}")

    auth = OAuth1(creds["api_key"], creds["api_secret"], creds["access_token"], creds["access_token_secret"])

    # Step 1: resolve the user id (same call that already works for you)
    me_resp = requests.get(ME_URL, auth=auth, timeout=15)
    print(f"GET /2/users/me -> {me_resp.status_code}")
    print(me_resp.text)
    if me_resp.status_code != 200:
        sys.exit("Can't proceed without a working /users/me call.")
    user_id = me_resp.json()["data"]["id"]
    username = me_resp.json()["data"]["username"]
    print(f"\nResolved user id={user_id} (@{username})\n")

    # Step 2: the actual failing call, with full raw response
    tweets_url = f"https://api.x.com/2/users/{user_id}/tweets"
    print(f"GET {tweets_url}")
    resp = requests.get(tweets_url, auth=auth, params={"max_results": 5}, timeout=15)
    print(f"Status: {resp.status_code}")
    print("Headers of interest:")
    for h in ("www-authenticate", "x-rate-limit-limit", "x-rate-limit-remaining", "x-rate-limit-reset", "x-access-level"):
        if h in resp.headers:
            print(f"  {h}: {resp.headers[h]}")
    print("\nFull body:")
    try:
        print(json.dumps(resp.json(), indent=2))
    except ValueError:
        print(resp.text)


if __name__ == "__main__":
    main()
