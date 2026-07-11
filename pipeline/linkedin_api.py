#!/usr/bin/env python3
"""
linkedin_api.py
---------------
Official-API provider for the LinkedIn pipeline (see fetch_linkedin_data.py).

This is the drop-in replacement for the Selenium scraper. When you have
LinkedIn API access, implement fetch() here and set LINKEDIN_SOURCE=api — the
orchestrator, the follower-history snapshotting, the output JSON shape, and the
dashboard panel all stay exactly the same. Nothing else needs to change.

WHICH API
For a Company Page you administer, the relevant product is LinkedIn's
**Marketing API / Community Management API**. Apply for it via the LinkedIn
Developer Portal (developer.linkedin.com) — create an app, request the
"Community Management API" product, and get it associated with the
organization. Useful endpoints (all under https://api.linkedin.com):
  - GET /rest/organizations/{id}                       -> name, vanity, logo
  - GET /rest/networkSizes/{orgURN}?edgeType=CompanyFollowedByMember
                                                        -> total followers
  - GET /rest/organizationalEntityFollowerStatistics    -> follower gains by day
  - GET /rest/organizationalEntityShareStatistics        -> impressions, clicks,
                                                            reactions, comments,
                                                            shares, engagement
  - GET /rest/organizationPageStatistics                 -> page views, visitors
  - GET /rest/posts?author={orgURN}                      -> recent posts
Auth is OAuth 2.0 (3-legged) with scopes like r_organization_social,
rw_organization_admin, r_organization_admin. Store a refresh token the same
way the YouTube/TikTok pipelines do.

EXPECTED RETURN SHAPE (same as the Selenium provider):
{
  "organization": {name, url, followers, logo_url},
  "summary": {followers, unique_visitors, page_views, post_impressions,
              post_reactions, post_comments, post_shares, engagement_rate},
  "daily": [{date, impressions, engagements}, ...],
  "posts": [{id, date, text, impressions, reactions, comments, shares,
             engagement_rate, url}, ...]
}
Any field you can't populate yet: set to None / [] and the panel hides it.
"""

import os
import logging

log = logging.getLogger("fetch_linkedin_data.api")


class ApiProvider:
    def __init__(self):
        self.token = os.getenv("LINKEDIN_ACCESS_TOKEN")
        self.org_id = os.getenv("LINKEDIN_ORG_ID")

    def fetch(self):
        # TODO: implement using the Community Management API (see module docs).
        # Example skeleton once you have creds:
        #
        #   import requests
        #   headers = {"Authorization": f"Bearer {self.token}",
        #              "LinkedIn-Version": "202405",
        #              "X-Restli-Protocol-Version": "2.0.0"}
        #   org_urn = f"urn:li:organization:{self.org_id}"
        #   followers = requests.get(
        #       "https://api.linkedin.com/rest/networkSizes/" + org_urn,
        #       params={"edgeType": "CompanyFollowedByMember"},
        #       headers=headers, timeout=20).json().get("firstDegreeSize")
        #   ... share + page + follower statistics ...
        #   return { "organization": {...}, "summary": {...},
        #            "daily": [...], "posts": [...] }
        raise NotImplementedError(
            "LinkedIn official-API provider is not implemented yet. Set "
            "LINKEDIN_SOURCE=selenium to use the scraper for now, or implement "
            "fetch() in pipeline/linkedin_api.py once you have Community "
            "Management API access (see this file's docstring).")
