#!/usr/bin/env python3
"""
linkedin_selenium.py
--------------------
Selenium provider for the LinkedIn pipeline (see fetch_linkedin_data.py).

Scrapes a LinkedIn **Company Page** you administer for follower count,
visitor/impression stats and recent post metrics. This is a BEST-EFFORT
provider: LinkedIn's admin analytics are JavaScript-rendered and their markup
changes often, so each metric is extracted defensively and any piece that
can't be found is returned as None rather than crashing the run.

IMPORTANT / CAVEATS
- LinkedIn's User Agreement prohibits automated scraping. Using this can get
  the signed-in account challenged or restricted. Prefer the official API
  (see linkedin_api.py) as soon as you have access — this whole file is meant
  to be swapped out by setting LINKEDIN_SOURCE=api.
- LinkedIn aggressively blocks datacenter IPs (e.g. GitHub Actions) with login
  checkpoints, so this is most reliable run from a trusted local machine.
- Selectors WILL drift over time. When numbers stop coming through, update the
  _extract_* helpers below — they're intentionally isolated for that reason.

AUTH (in priority order)
  LINKEDIN_LI_AT       # value of the li_at session cookie (recommended)
  LINKEDIN_EMAIL + LINKEDIN_PASSWORD   # fallback interactive-style login

CONFIG
  LINKEDIN_COMPANY     # company vanity slug or numeric id, e.g. "mangrove-ai"
  LINKEDIN_HEADLESS    # "true" (default) / "false"
"""

import os
import re
import time
import logging

log = logging.getLogger("fetch_linkedin_data.selenium")

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    _SELENIUM_OK = True
except ImportError:
    _SELENIUM_OK = False


LINKEDIN_HOME = "https://www.linkedin.com"


def _num(text):
    """Parse '1,234', '1.2K', '3.4M', '5B' -> int. Returns None if no number."""
    if text is None:
        return None
    m = re.search(r"([\d.,]+)\s*([KMB])?", str(text).strip(), re.IGNORECASE)
    if not m:
        return None
    raw = m.group(1).replace(",", "")
    if not raw or raw == ".":
        return None
    try:
        val = float(raw)
    except ValueError:
        return None
    mult = {"k": 1e3, "m": 1e6, "b": 1e9}.get((m.group(2) or "").lower(), 1)
    return int(val * mult)


class SeleniumProvider:
    def __init__(self):
        if not _SELENIUM_OK:
            raise RuntimeError(
                "selenium is not installed. Run: pip install -r "
                "pipeline/requirements-linkedin.txt")
        self.company = os.getenv("LINKEDIN_COMPANY")
        if not self.company:
            raise RuntimeError("LINKEDIN_COMPANY is required (company vanity "
                               "slug or numeric id, e.g. 'mangrove-ai').")
        self.li_at = os.getenv("LINKEDIN_LI_AT")
        self.email = os.getenv("LINKEDIN_EMAIL")
        self.password = os.getenv("LINKEDIN_PASSWORD")
        self.headless = os.getenv("LINKEDIN_HEADLESS", "true").lower() != "false"
        self.driver = None

    # -- lifecycle ---------------------------------------------------------
    def _build_driver(self):
        opts = Options()
        if self.headless:
            opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--window-size=1400,1200")
        opts.add_argument("--disable-blink-features=AutomationControlled")
        opts.add_argument(
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        # Selenium 4.6+ resolves chromedriver automatically (Selenium Manager).
        self.driver = webdriver.Chrome(options=opts)
        self.driver.set_page_load_timeout(45)

    def _login(self):
        if self.li_at:
            log.info("Authenticating with li_at session cookie.")
            self.driver.get(LINKEDIN_HOME)
            self.driver.add_cookie({
                "name": "li_at", "value": self.li_at,
                "domain": ".linkedin.com", "path": "/", "secure": True,
            })
            self.driver.get(f"{LINKEDIN_HOME}/feed/")
        elif self.email and self.password:
            log.info("Authenticating with email + password (may hit 2FA).")
            self.driver.get(f"{LINKEDIN_HOME}/login")
            WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.ID, "username")))
            self.driver.find_element(By.ID, "username").send_keys(self.email)
            self.driver.find_element(By.ID, "password").send_keys(self.password)
            self.driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
            time.sleep(5)
        else:
            raise RuntimeError("No auth provided. Set LINKEDIN_LI_AT (preferred) "
                               "or LINKEDIN_EMAIL + LINKEDIN_PASSWORD.")

        time.sleep(3)
        url = self.driver.current_url
        if any(x in url for x in ("/login", "/checkpoint", "/uas/")):
            raise RuntimeError(
                "Login did not complete (landed on %s). The cookie may be "
                "expired or LinkedIn issued a security challenge — this is "
                "common from datacenter/CI IPs. Refresh the li_at cookie from "
                "a browser session, or run locally." % url)

    # -- scraping helpers (isolated so selectors are easy to update) -------
    def _page_text(self):
        try:
            return self.driver.find_element(By.TAG_NAME, "body").text
        except Exception:
            return ""

    def _goto(self, url, wait_selector=None, pause=3.5):
        self.driver.get(url)
        if wait_selector:
            try:
                WebDriverWait(self.driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, wait_selector)))
            except Exception:
                pass
        time.sleep(pause)

    def _base_admin(self):
        return f"{LINKEDIN_HOME}/company/{self.company}/admin"

    def _extract_followers(self):
        # Public company page reliably shows "N followers" in the header.
        self._goto(f"{LINKEDIN_HOME}/company/{self.company}/")
        text = self._page_text()
        m = re.search(r"([\d.,]+[KMB]?)\s+followers", text, re.IGNORECASE)
        if m:
            return _num(m.group(1))
        # Fallback: admin followers analytics page.
        self._goto(f"{self._base_admin()}/analytics/followers/")
        text = self._page_text()
        m = re.search(r"Total followers[^\d]*([\d.,]+[KMB]?)", text, re.IGNORECASE)
        return _num(m.group(1)) if m else None

    def _extract_visitors(self):
        """Best-effort unique visitors + page views over the default window."""
        self._goto(f"{self._base_admin()}/analytics/visitors/")
        text = self._page_text()
        out = {}
        m = re.search(r"Page views[^\d]*([\d.,]+[KMB]?)", text, re.IGNORECASE)
        if m:
            out["page_views"] = _num(m.group(1))
        m = re.search(r"Unique visitors[^\d]*([\d.,]+[KMB]?)", text, re.IGNORECASE)
        if m:
            out["unique_visitors"] = _num(m.group(1))
        return out

    def _extract_updates(self):
        """Best-effort content stats: impressions, reactions over the window."""
        self._goto(f"{self._base_admin()}/analytics/updates/")
        text = self._page_text()
        out = {}
        for key, label in (("post_impressions", "Impressions"),
                           ("post_reactions", "Reactions"),
                           ("post_comments", "Comments"),
                           ("post_shares", "Reposts")):
            m = re.search(label + r"[^\d]*([\d.,]+[KMB]?)", text, re.IGNORECASE)
            if m:
                out[key] = _num(m.group(1))
        return out

    # -- public API --------------------------------------------------------
    def fetch(self):
        self._build_driver()
        try:
            self._login()

            followers = self._extract_followers()
            log.info("Followers: %s", followers)

            summary = {"followers": followers}
            try:
                summary.update(self._extract_visitors())
            except Exception as e:
                log.warning("Visitor stats unavailable: %s", e)
            try:
                summary.update(self._extract_updates())
            except Exception as e:
                log.warning("Update stats unavailable: %s", e)

            impressions = summary.get("post_impressions")
            engagements = sum(v for v in (summary.get("post_reactions"),
                                          summary.get("post_comments"),
                                          summary.get("post_shares"))
                              if isinstance(v, int))
            summary["engagement_rate"] = (
                round((engagements / impressions) * 100, 3)
                if impressions and engagements else None)

            organization = {
                "name": self.company,
                "url": f"{LINKEDIN_HOME}/company/{self.company}/",
                "followers": followers,
                "logo_url": None,
            }
            return {
                "organization": organization,
                "summary": summary,
                # Post-level scraping is the most brittle part; left empty by
                # default. The official API (linkedin_api.py) fills this in.
                "posts": [],
                "daily": [],
            }
        finally:
            try:
                self.driver.quit()
            except Exception:
                pass
