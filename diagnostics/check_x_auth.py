#!/usr/bin/env python3
"""
check_x_auth.py
----------------
Standalone auth diagnostic for the X (Twitter) API v2. Run this BEFORE the
real pipeline (pipeline/fetch_x_data.py) to confirm credentials actually work.

It makes the smallest possible authenticated call — GET /2/users/me — and
prints the exact HTTP status and response body. It does NOT call
get_users_tweets or anything else, because /users/me is available on every
paid access tier (including Free), so it isolates "are these credentials
valid at all" from "does my access tier include this specific endpoint."

WHY THIS MATTERS FOR THE get_users_tweets 401
X API v2 access tiers (as of this writing) roughly break down as:
  - Free   : POST /2/tweets (posting) and GET /2/users/me only. No read
             endpoints for tweet lookups, timelines, or search.
  - Basic ($200/mo) and up: adds GET /2/users/:id/tweets (get_users_tweets),
             recent search, and other read endpoints.
So a 401 (X returns 401, not 403, for several of these cases) on
get_users_tweets while /users/me works is a strong signal that the account's
access tier doesn't include that endpoint yet — not that the tokens are
wrong. This script surfaces that distinction instead of guessing.

USAGE
  Set credentials as environment variables, then run:
    python3 diagnostics/check_x_auth.py

  Supports two auth modes (checks OAuth 1.0a first, then falls back to
  bearer token if that's what's set):

  OAuth 1.0a user context (required for reading YOUR OWN non-public metrics,
  and what pipeline/fetch_x_data.py uses):
    X_API_KEY
    X_API_SECRET
    X_ACCESS_TOKEN
    X_ACCESS_TOKEN_SECRET

  App-only bearer token (works for public read endpoints your access tier
  includes, but cannot see non-public metrics like impressions on your own
  tweets unless X later adds that to app-only auth):
    X_BEARER_TOKEN

Only needs the `requests` library (no tweepy dependency), so it stays a
minimal, standalone check.
"""

import os
import sys
import json

import requests

try:
    from requests_oauthlib import OAuth1
    HAVE_OAUTH1 = True
except ImportError:
    HAVE_OAUTH1 = False

ME_URL = "https://api.x.com/2/users/me"


def redact(v, keep=4):
    if not v:
        return "(not set)"
    return f"{v[:keep]}...({len(v)} chars)"


def load_creds():
    return {
        "api_key": os.getenv("X_API_KEY"),
        "api_secret": os.getenv("X_API_SECRET"),
        "access_token": os.getenv("X_ACCESS_TOKEN"),
        "access_token_secret": os.getenv("X_ACCESS_TOKEN_SECRET"),
        "bearer_token": os.getenv("X_BEARER_TOKEN"),
    }


def print_creds_summary(c):
    print("Credentials found in environment:")
    print(f"  X_API_KEY             : {redact(c['api_key'])}")
    print(f"  X_API_SECRET          : {redact(c['api_secret'])}")
    print(f"  X_ACCESS_TOKEN        : {redact(c['access_token'])}")
    print(f"  X_ACCESS_TOKEN_SECRET : {redact(c['access_token_secret'])}")
    print(f"  X_BEARER_TOKEN        : {redact(c['bearer_token'])}")
    print()


def try_oauth1(c):
    if not HAVE_OAUTH1:
        print("[oauth1a] SKIPPED — `requests_oauthlib` not installed. "
              "Run: pip install requests_oauthlib")
        return None
    if not all([c["api_key"], c["api_secret"], c["access_token"], c["access_token_secret"]]):
        print("[oauth1a] SKIPPED — one or more of X_API_KEY / X_API_SECRET / "
              "X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET is not set.")
        return None

    auth = OAuth1(
        c["api_key"], c["api_secret"],
        c["access_token"], c["access_token_secret"],
    )
    print(f"[oauth1a] GET {ME_URL}  (OAuth 1.0a user context)")
    try:
        resp = requests.get(ME_URL, auth=auth, timeout=15)
    except requests.exceptions.RequestException as e:
        print(f"[oauth1a] NETWORK ERROR before reaching X: {e}")
        return "network_error"
    print(f"[oauth1a] Status: {resp.status_code}")
    print(f"[oauth1a] Body:   {resp.text}")
    print()
    return resp.status_code


def try_bearer(c):
    if not c["bearer_token"]:
        print("[bearer]  SKIPPED — X_BEARER_TOKEN is not set.")
        return None
    headers = {"Authorization": f"Bearer {c['bearer_token']}"}
    print(f"[bearer]  GET {ME_URL}  (app-only bearer token)")
    try:
        resp = requests.get(ME_URL, headers=headers, timeout=15)
    except requests.exceptions.RequestException as e:
        print(f"[bearer]  NETWORK ERROR before reaching X: {e}")
        return "network_error"
    print(f"[bearer]  Status: {resp.status_code}")
    print(f"[bearer]  Body:   {resp.text}")
    print()
    return resp.status_code


def diagnose(oauth1_status, bearer_status):
    print("=" * 70)
    print("DIAGNOSIS")
    print("=" * 70)

    if oauth1_status == "network_error" or bearer_status == "network_error":
        print(
            "Could not reach api.x.com at all from this environment (network "
            "error before any HTTP response came back). This means NONE of "
            "the checks below are conclusive yet — fix network access first "
            "(e.g. run this from a machine/CI runner with normal internet "
            "access, not a sandboxed/proxied environment) and re-run."
        )
        return

    if oauth1_status is None and bearer_status is None:
        print(
            "No usable credentials were found in the environment, so nothing "
            "was actually tested. Set at least the OAuth 1.0a four "
            "(X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET) "
            "or X_BEARER_TOKEN and re-run."
        )
        return

    ok = {200}
    if oauth1_status in ok or bearer_status in ok:
        print(
            "GET /2/users/me succeeded. Your credentials ARE valid and "
            "correctly authenticated. If get_users_tweets still returns 401, "
            "that points to one of these (not bad credentials):\n"
            "  1. ACCESS TIER — the Free tier only allows POST /2/tweets and "
            "GET /2/users/me. Reading a user's tweet timeline "
            "(get_users_tweets / GET /2/users/:id/tweets) requires at least "
            "the Basic tier ($200/mo as of 2025-2026 pricing — verify current "
            "price on developer.x.com/en/products/x-api). Check your access "
            "level at developer.x.com under your Project.\n"
            "  2. PROJECT ATTACHMENT — the App making the call must be "
            "attached to a Project in the new developer portal. Apps created "
            "under the old standalone model can pass basic auth checks but "
            "get 401/403 on v2 endpoints until attached.\n"
            "  3. SCOPES — if you're using OAuth 2.0 user context (not OAuth "
            "1.0a) elsewhere, confirm the token was granted 'tweet.read' and "
            "'users.read' scopes at authorization time.\n"
        )
        return

    if oauth1_status == 401 or bearer_status == 401:
        print(
            "GET /2/users/me itself returned 401 — this means the credentials "
            "are being rejected before any access-tier check even happens. "
            "Most likely causes, in order of likelihood:\n"
            "  1. EXPIRED / REVOKED TOKEN — access tokens are invalidated if "
            "the app's permissions were changed (e.g. Read -> Read+Write) "
            "AFTER the token was generated. Regenerate the Access Token & "
            "Secret from developer.x.com -> your App -> Keys and Tokens, "
            "then update X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET.\n"
            "  2. WRONG TOKEN TYPE — OAuth 1.0a access tokens and OAuth 2.0 "
            "bearer/user tokens are NOT interchangeable. Confirm which flow "
            "you generated tokens for and that this script used the matching "
            "mode above.\n"
            "  3. APP NOT ATTACHED TO A PROJECT — in the current developer "
            "portal, every App must live inside a Project. A detached App's "
            "keys can look valid but fail auth on v2 endpoints.\n"
            "  4. CLOCK SKEW — OAuth 1.0a signatures are time-sensitive; a "
            "system clock more than ~5 minutes off can cause spurious 401s.\n"
            "  5. KEYS COPIED WITH WHITESPACE/TRUNCATION — re-copy directly "
            "from the developer portal, watch for trailing spaces or newlines."
        )
        return

    if oauth1_status == 403 or bearer_status == 403:
        print(
            "GET /2/users/me returned 403 (Forbidden) rather than 401. That "
            "usually means the credentials ARE valid but the App/Project "
            "lacks permission for this action — e.g. suspended app, or "
            "regional/policy restriction. Check the App's status on "
            "developer.x.com."
        )
        return

    print(
        f"Got an unexpected status (oauth1a={oauth1_status}, "
        f"bearer={bearer_status}). Read the response body printed above for "
        "X's specific error `title`/`detail` fields — they're usually "
        "explicit about what's wrong."
    )


def main():
    print("X API auth diagnostic — GET /2/users/me\n" + "-" * 70)
    c = load_creds()
    print_creds_summary(c)

    oauth1_status = try_oauth1(c)
    bearer_status = try_bearer(c)

    diagnose(oauth1_status, bearer_status)

    # Exit non-zero if we couldn't confirm a working auth path, so this can
    # also be used as a CI gate if useful.
    success = 200 in (oauth1_status, bearer_status)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
