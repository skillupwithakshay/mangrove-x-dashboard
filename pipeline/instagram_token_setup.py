#!/usr/bin/env python3
"""
instagram_token_setup.py
------------------------
ONE-TIME helper to obtain a long-lived IG_ACCESS_TOKEN and the numeric
IG_BUSINESS_ACCOUNT_ID for the daily pipeline (pipeline/fetch_instagram_data.py).

This does the WHOLE OAuth flow itself via Facebook Login (a local
http://localhost:8080/callback server catches the redirect), so you do NOT need
the Graph API Explorer to issue a token. It reads FB_APP_ID / FB_APP_SECRET from
.env (python-dotenv). Steps performed:
  1. Open Facebook's OAuth dialog for your app with the required scopes.
  2. Catch the redirect code, exchange it for a user access token.
  3. Exchange that for a long-lived (~60-day) token.
  4. Call /me/accounts to find the Facebook Page(s) you admin and the Instagram
     Business account linked to each.
Then it prints IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID.

PREREQUISITES (developers.facebook.com -> your app):
  - Add the "Facebook Login" product. In its Settings, under "Valid OAuth
    Redirect URIs" add EXACTLY:  http://localhost:8080/callback
    and enable "Client OAuth Login" + "Web OAuth Login".
  - Make sure your Facebook account (the one that admins the Mangrove
    Technologies Page) has an Admin/Developer role on the app, and keep the app
    in "Development" mode so you can grant the permissions to yourself without
    App Review.
  - Put credentials in .env:  FB_APP_ID=...   FB_APP_SECRET=...
  - Optional: IG_API_VERSION (defaults to v21.0).

USAGE:
  python pipeline/instagram_token_setup.py
Approve in the browser as the Page-admin Facebook account.

RECOMMENDED FOR AUTOMATION: for the unattended daily job, generate a Meta
System User token (never expires) and use that as IG_ACCESS_TOKEN instead of the
~60-day user token this mints. Requires only `requests` + `python-dotenv`.
"""

import os
import sys
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

API_VERSION = os.getenv("IG_API_VERSION", "v21.0")
GRAPH = f"https://graph.facebook.com/{API_VERSION}"
DIALOG = f"https://www.facebook.com/{API_VERSION}/dialog/oauth"
REDIRECT_URI = "http://localhost:8080/callback"
SCOPES = ("instagram_basic,instagram_manage_insights,"
          "pages_show_list,pages_read_engagement,business_management")


def parse_code(pasted):
    """Accept either the full redirected URL or a bare code value."""
    pasted = (pasted or "").strip()
    if "code=" in pasted:
        q = urllib.parse.urlparse(pasted).query or pasted.split("?", 1)[-1]
        # Facebook appends #_=_ to the redirect; strip it off the code.
        return (urllib.parse.parse_qs(q).get("code", [None])[0] or "").split("#")[0] or None
    return pasted or None


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def main():
    app_id = os.getenv("FB_APP_ID")
    app_secret = os.getenv("FB_APP_SECRET")
    if not app_id or not app_secret:
        die("Set FB_APP_ID and FB_APP_SECRET in .env first.")

    params = {
        "client_id": app_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "state": "mangrove",
    }
    consent_url = DIALOG + "?" + urllib.parse.urlencode(params)

    print("\n" + "=" * 70)
    print("STEP 1 — Open this URL and approve as the Facebook account that")
    print("admins the Mangrove Technologies Page:")
    print("=" * 70 + "\n")
    print(consent_url + "\n")
    try:
        webbrowser.open(consent_url)
    except Exception:
        pass
    print("=" * 70)
    print("STEP 2 — After approving, Facebook redirects to a")
    print("http://localhost:8080/callback?code=... URL. The page may show")
    print('"this site can\'t be reached" — that is FINE. Copy the FULL address')
    print("from the browser's address bar and paste it below.")
    print("=" * 70)
    pasted = input("\nPaste the redirect URL (or just the code=... value): ")
    code = parse_code(pasted)
    if not code:
        die("No authorization code found in what you pasted.")

    # 1) code -> user access token
    print("\nExchanging code for a user token...")
    r = requests.get(f"{GRAPH}/oauth/access_token", params={
        "client_id": app_id,
        "redirect_uri": REDIRECT_URI,
        "client_secret": app_secret,
        "code": code,
    }, timeout=20)
    if not r.ok:
        die(f"Code exchange failed ({r.status_code}): {r.text}")
    user_token = r.json().get("access_token")
    if not user_token:
        die(f"No access_token in response: {r.json()}")

    # 2) short -> long-lived (~60 days)
    print("Exchanging for a long-lived token...")
    r = requests.get(f"{GRAPH}/oauth/access_token", params={
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": user_token,
    }, timeout=20)
    long_token = r.json().get("access_token") if r.ok else None
    if not long_token:
        print(f"  (long-lived exchange failed, using short token) {r.text}", file=sys.stderr)
        long_token = user_token
    expires = r.json().get("expires_in") if r.ok else None
    if expires:
        print(f"  Long-lived token expires in ~{expires // 86400} days.")

    # 3) find Pages + linked IG business accounts
    print("Looking up your Pages and linked Instagram accounts...")
    r = requests.get(f"{GRAPH}/me/accounts", params={
        "access_token": long_token,
        "fields": "id,name,instagram_business_account",
    }, timeout=20)
    if not r.ok:
        die(f"/me/accounts failed ({r.status_code}): {r.text}")
    pages = r.json().get("data", [])
    found = []
    for p in pages:
        iga = p.get("instagram_business_account")
        if iga:
            info = requests.get(f"{GRAPH}/{iga['id']}", params={
                "access_token": long_token, "fields": "username,followers_count",
            }, timeout=20).json()
            found.append((p.get("name"), iga["id"], info.get("username"),
                          info.get("followers_count")))

    print("\n" + "=" * 64)
    if not found:
        print("No Instagram Business account is linked to any Page you admin.")
        print("In the IG app: Settings -> Account type and tools -> ensure it's a")
        print("Professional account connected to the Mangrove Technologies Page,")
        print("then re-run. (Also confirm you granted the instagram_* permissions.)")
        print("=" * 64)
        sys.exit(1)

    print("SUCCESS. Add these to your local .env AND to GitHub repo secrets:")
    print("=" * 64)
    print(f"\nIG_ACCESS_TOKEN={long_token}")
    if len(found) == 1:
        name, iga_id, uname, followers = found[0]
        print(f"IG_BUSINESS_ACCOUNT_ID={iga_id}\n")
        print(f"(Resolved to @{uname} — {followers} followers, via Page '{name}')")
    else:
        print("\n# Multiple IG accounts found — pick the Mangrove one:")
        for name, iga_id, uname, followers in found:
            print(f"#   @{uname} ({followers} followers) via '{name}': "
                  f"IG_BUSINESS_ACCOUNT_ID={iga_id}")
    print("\nThen test with: python pipeline/fetch_instagram_data.py")


if __name__ == "__main__":
    main()
