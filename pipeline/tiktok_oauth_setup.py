#!/usr/bin/env python3
"""
tiktok_oauth_setup.py
---------------------
ONE-TIME helper to obtain a TikTok OAuth 2.0 *refresh token* for the daily
pipeline (pipeline/fetch_tiktok_data.py). Run it once locally, then paste the
refresh token into .env and the GitHub repo secrets.

Reads TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET from .env (via python-dotenv) so
you don't need manual `export`s. It runs a tiny local web server on
http://localhost:8080/callback to catch the OAuth redirect automatically, and
implements PKCE (required by TikTok): a random code_verifier is generated and
its S256 challenge (hex-encoded SHA-256 — TikTok uses hex, not base64url) is
sent on the authorize URL, with the verifier included in the token exchange.

PREREQUISITES (developers.tiktok.com):
  1. Create an app (Manage apps -> Connect an app).
  2. Add the "Login Kit" product, enable scopes:
       user.info.basic, user.info.profile, user.info.stats, video.list
  3. Under Login Kit, add this exact Redirect URI:  http://localhost:8080/callback
  4. Put the app's Client key and Client secret in .env:
       TIKTOK_CLIENT_KEY=...
       TIKTOK_CLIENT_SECRET=...
     (Sandbox credentials are fine; add the target TikTok account as a Sandbox
     target user first.)

USAGE:
  python pipeline/tiktok_oauth_setup.py
A browser opens; log in / approve as the target TikTok account. The script
prints TIKTOK_REFRESH_TOKEN=... to copy into .env + GitHub secrets.

NOTE: TikTok refresh tokens last ~365 days; re-run yearly. Requires `requests`
and `python-dotenv` (see pipeline/requirements.txt) + the Python stdlib.
"""

import os
import sys
import hashlib
import secrets
import string
import urllib.parse
import webbrowser

try:
    sys.stdout.reconfigure(line_buffering=True)  # always show prompts immediately
except Exception:
    pass

def _load_env():
    """Load .env into the environment. Uses python-dotenv if installed,
    otherwise a tiny built-in parser so this works with ZERO extra installs.
    Never overrides variables already set in the real environment."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    from pathlib import Path
    here = Path(__file__).resolve().parent
    for p in (Path.cwd() / ".env", here / ".env", here.parent / ".env"):
        try:
            if p.is_file():
                for line in p.read_text().splitlines():
                    s = line.strip()
                    if not s or s.startswith("#") or "=" not in s:
                        continue
                    k, v = s.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
                break
        except OSError:
            pass


_load_env()

try:
    import requests
except ImportError:
    print("Missing dependency. Run: pip install -r pipeline/requirements.txt", file=sys.stderr)
    sys.exit(1)

AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
# Must EXACTLY match a Redirect URI registered in the TikTok app's Login Kit
# settings. Override via .env (TIKTOK_REDIRECT_URI) if you registered a
# different one (e.g. https://mangrove.ai/ when localhost isn't accepted).
REDIRECT_URI = os.getenv("TIKTOK_REDIRECT_URI", "http://localhost:8080/callback")
SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list"


def parse_code(pasted):
    """Accept either the full redirected URL or a bare code value."""
    pasted = (pasted or "").strip()
    if "code=" in pasted:
        q = urllib.parse.urlparse(pasted).query or pasted.split("?", 1)[-1]
        code = urllib.parse.parse_qs(q).get("code", [None])[0]
        return code
    return pasted or None


def make_pkce():
    """Return (code_verifier, code_challenge). TikTok's S256 challenge is the
    HEX-encoded SHA-256 of the verifier (NOT base64url)."""
    alphabet = string.ascii_letters + string.digits + "-._~"
    verifier = "".join(secrets.choice(alphabet) for _ in range(64))  # 43–128 allowed
    challenge = hashlib.sha256(verifier.encode("ascii")).hexdigest()
    return verifier, challenge


def main():
    client_key = os.getenv("TIKTOK_CLIENT_KEY")
    client_secret = os.getenv("TIKTOK_CLIENT_SECRET")
    if not client_key or not client_secret:
        print("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env first.", file=sys.stderr)
        sys.exit(1)

    print(f"\nUsing redirect_uri: {REDIRECT_URI}")
    print("(set TIKTOK_REDIRECT_URI in .env to change it)")

    code_verifier, code_challenge = make_pkce()  # fresh PKCE verifier each run

    params = {
        "client_key": client_key,
        "response_type": "code",
        "scope": SCOPES,
        "redirect_uri": REDIRECT_URI,
        "state": "mangrove",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    consent_url = AUTH_URL + "?" + urllib.parse.urlencode(params)

    print("\n" + "=" * 70)
    print("STEP 1 — Open this URL and approve as the mangrove.ai TikTok account:")
    print("=" * 70 + "\n")
    print(consent_url + "\n")
    try:
        webbrowser.open(consent_url)
    except Exception:
        pass
    print("=" * 70)
    print(f"STEP 2 — After approving, TikTok redirects to:\n  {REDIRECT_URI}?code=...")
    print("The page may show \"this site can't be reached\" — that is FINE.")
    print("Copy the FULL address from the browser's address bar and paste it below.")
    print("=" * 70)
    pasted = input("\nPaste the redirect URL (or just the code=... value): ")
    code = parse_code(pasted)
    if not code:
        print("No authorization code found in what you pasted.", file=sys.stderr)
        sys.exit(1)

    print("\nExchanging code for tokens...")
    resp = requests.post(TOKEN_URL, headers={
        "Content-Type": "application/x-www-form-urlencoded",
    }, data={
        "client_key": client_key,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,   # PKCE: must match the challenge above
    }, timeout=20)

    if not resp.ok:
        print(f"\nToken exchange failed ({resp.status_code}): {resp.text}", file=sys.stderr)
        sys.exit(1)

    body = resp.json()
    refresh_token = body.get("refresh_token")
    if not refresh_token:
        print(f"\nNo refresh_token in response: {body}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 64)
    print("SUCCESS. Add these to your local .env AND to GitHub repo secrets:")
    print("=" * 64)
    print(f"\nTIKTOK_REFRESH_TOKEN={refresh_token}\n")
    print("Also ensure TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are set in both.")
    print(f"(scope granted: {body.get('scope', SCOPES)})")
    print("Then test with: python pipeline/fetch_tiktok_data.py")


if __name__ == "__main__":
    main()
