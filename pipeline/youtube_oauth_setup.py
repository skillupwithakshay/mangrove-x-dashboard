#!/usr/bin/env python3
"""
youtube_oauth_setup.py
----------------------
ONE-TIME helper to obtain a YouTube OAuth 2.0 *refresh token* for the daily
pipeline (pipeline/fetch_youtube_data.py). You run this once, locally, and
paste the refresh token it prints into .env and the GitHub repo secrets.

It uses the OAuth "out-of-band"/manual copy-paste flow so it works on a
headless machine with no local web server: it prints a Google consent URL,
you open it in a browser, approve, and paste the resulting code back here.

PREREQUISITES (Google Cloud Console — console.cloud.google.com):
  1. Create/select a project.
  2. APIs & Services -> Enable BOTH:
       - YouTube Data API v3
       - YouTube Analytics API
  3. APIs & Services -> OAuth consent screen: configure it, and under
     "Test users" add the Google account that owns the Mangrove channel
     (so consent works while the app is in "testing").
  4. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
     -> Application type: "Desktop app". Copy the Client ID + Client secret.

USAGE:
  export YOUTUBE_CLIENT_ID=...        # from step 4 above
  export YOUTUBE_CLIENT_SECRET=...
  python pipeline/youtube_oauth_setup.py
Then sign in as the CHANNEL OWNER, approve, paste the code, and copy the
printed YOUTUBE_REFRESH_TOKEN into .env + GitHub secrets.

Requires no extra dependencies beyond `requests` (already in requirements).
"""

import os
import sys
import urllib.parse

try:
    import requests
except ImportError:
    print("Missing dependency. Run: pip install -r pipeline/requirements.txt", file=sys.stderr)
    sys.exit(1)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
# "Out-of-band" redirect: Google shows the code on-screen to copy-paste,
# so no local web server / callback URL is needed.
REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


def main():
    client_id = os.getenv("YOUTUBE_CLIENT_ID")
    client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first "
              "(see the header of this file).", file=sys.stderr)
        sys.exit(1)

    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",   # <- required to get a refresh token
        "prompt": "consent",        # <- force a refresh token even on re-auth
    }
    consent_url = AUTH_URL + "?" + urllib.parse.urlencode(params)

    print("\n1) Open this URL in your browser (sign in as the CHANNEL OWNER):\n")
    print(consent_url)
    print("\n2) Approve access, then copy the authorization code Google shows you.\n")
    code = input("Paste the authorization code here: ").strip()
    if not code:
        print("No code entered. Aborting.", file=sys.stderr)
        sys.exit(1)

    resp = requests.post(TOKEN_URL, data={
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=20)

    if not resp.ok:
        print(f"\nToken exchange failed ({resp.status_code}): {resp.text}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    refresh_token = data.get("refresh_token")
    if not refresh_token:
        print("\nNo refresh_token in the response. This usually means you've "
              "authorized before without 'prompt=consent'. Revoke the app's "
              "access at https://myaccount.google.com/permissions and re-run.",
              file=sys.stderr)
        print("Full response:", data, file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 64)
    print("SUCCESS. Add this to your local .env AND to GitHub repo secrets")
    print("(Settings -> Secrets and variables -> Actions):")
    print("=" * 64)
    print(f"\nYOUTUBE_REFRESH_TOKEN={refresh_token}\n")
    print("Also make sure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are set")
    print("in both places. Then test with: python pipeline/fetch_youtube_data.py")


if __name__ == "__main__":
    main()
