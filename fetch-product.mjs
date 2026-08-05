#!/usr/bin/env node
/**
 * fetch-product.mjs
 * -----------------
 * Writes data/product.json — product signup/activation metrics for the
 * Acquisition funnel (see fetch-funnel.mjs / AcquisitionPanel.jsx). Lights up
 * the funnel's "Signed up" and "Activated" stages.
 *
 * SOURCE: Amazon Cognito user pool (the app's user store). Reads users via the
 * Cognito Identity Provider `ListUsers` API, signed with AWS Signature V4 by
 * hand (node:crypto only — no AWS SDK, matching the repo's zero-dependency
 * fetchers). Read-only: only cognito-idp:ListUsers is called.
 *
 * AUTH (env only — never printed, logged, or committed):
 *   AWS_ACCESS_KEY_ID       IAM access key with cognito-idp:ListUsers on the pool
 *   AWS_SECRET_ACCESS_KEY   its secret
 *   AWS_SESSION_TOKEN       (optional) only if using temporary STS credentials
 *   AWS_REGION              e.g. us-east-1 (defaults to the pool id's region prefix)
 *   COGNITO_USER_POOL_ID    e.g. us-east-1_ABC123 (Cognito → User pools → Pool ID)
 *   COGNITO_ACTIVATION_ATTRIBUTE  (optional) a custom attribute name whose truthy
 *                           value marks a user "activated" (e.g. custom:activated).
 *                           If unset, "activated" = users with UserStatus CONFIRMED.
 *
 * CONTRACT written to data/product.json:
 *   { updatedAt, source:"cognito", signups, activations, activationBasis,
 *     signups30d, subscribeClicks:null }
 *
 * DESIGN — honesty first (mirrors the other fetchers):
 *   - subscribeClicks is a FRONT-END event Cognito can't see, so it's null and
 *     the "Clicked subscribe" stage stays pending — never faked.
 *   - "Activated" is a proxy (confirmed status, or a custom attribute if you set
 *     one) and is labeled as such via activationBasis. On any failure the script
 *     exits non-zero and the last good file stays deployed (continue-on-error).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data", "product.json");

const AK = process.env.AWS_ACCESS_KEY_ID;
const SK = process.env.AWS_SECRET_ACCESS_KEY;
const ST = process.env.AWS_SESSION_TOKEN || null;
const POOL = process.env.COGNITO_USER_POOL_ID;
// Region: explicit AWS_REGION wins; otherwise infer from the pool id prefix
// (pool ids look like "<region>_<suffix>", e.g. us-east-1_ABC123).
const REGION = process.env.AWS_REGION || (POOL ? POOL.split("_")[0] : null);
const ACT_ATTR = process.env.COGNITO_ACTIVATION_ATTRIBUTE || null;

if (!AK || !SK || !POOL || !REGION) {
  console.error("Missing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / COGNITO_USER_POOL_ID / AWS_REGION.");
  process.exit(1);
}

const SERVICE = "cognito-idp";
const HOST = `cognito-idp.${REGION}.amazonaws.com`;
const ENDPOINT = `https://${HOST}/`;

const sha256hex = (data) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data, "utf8").digest();

// AWS SigV4 signing-key derivation.
function signingKey(secret, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

// Sign + send one Cognito API call (X-Amz-Target selects the operation).
async function callCognito(target, payloadObj) {
  const body = JSON.stringify(payloadObj);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    "content-type": "application/x-amz-json-1.1",
    host: HOST,
    "x-amz-date": amzDate,
    "x-amz-target": `AWSCognitoIdentityProviderService.${target}`,
  };
  if (ST) headers["x-amz-security-token"] = ST;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join("");
  const canonicalRequest = [
    "POST", "/", "", canonicalHeaders, signedHeaders, sha256hex(body),
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest),
  ].join("\n");

  const sig = createHmac("sha256", signingKey(SK, dateStamp, REGION, SERVICE))
    .update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${AK}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { ...headers, authorization },
    body,
  });
  if (!res.ok) {
    throw new Error(`${target} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

const attr = (u, name) => (u.Attributes || []).find((a) => a.Name === name)?.Value;
const truthy = (v) => v != null && !["false", "0", "", "no"].includes(String(v).toLowerCase());

async function main() {
  // Page through every user (60/page is Cognito's ListUsers max).
  const users = [];
  let token = null;
  for (let i = 0; i < 500; i++) { // hard cap ~30k users
    const payload = { UserPoolId: POOL, Limit: 60 };
    if (token) payload.PaginationToken = token;
    const page = await callCognito("ListUsers", payload);
    users.push(...(page.Users || []));
    token = page.PaginationToken || null;
    if (!token) break;
  }

  const now = Date.now();
  const DAY = 86400000;
  const signups = users.length;
  const confirmed = users.filter((u) => u.UserStatus === "CONFIRMED").length;
  const activations = ACT_ATTR
    ? users.filter((u) => truthy(attr(u, ACT_ATTR))).length
    : confirmed;
  const activationBasis = ACT_ATTR ? `attribute:${ACT_ATTR}` : "confirmed_status";
  const signups30d = users.filter((u) => {
    const t = u.UserCreateDate ? Date.parse(u.UserCreateDate) : NaN;
    return !isNaN(t) && now - t <= 30 * DAY;
  }).length;

  const out = {
    updatedAt: new Date().toISOString(),
    source: "cognito",
    signups,
    activations,
    activationBasis,   // how "activated" was derived — honest label for the UI
    signups30d,
    subscribeClicks: null, // front-end event — not visible to Cognito; stays pending
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    `Wrote ${OUT} — signups=${signups}, activations=${activations} (${activationBasis}), signups30d=${signups30d}`
  );
}

// --- optional self-test: `node fetch-product.mjs --selftest` -----------------
// Verifies the SigV4 signing-key derivation against AWS's published test vector
// (docs.aws.amazon.com "Examples of how to derive a signing key"): secret
// wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, 20120215, us-east-1, iam.
if (process.argv.includes("--selftest")) {
  const k = signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam");
  const got = Buffer.from(k).toString("hex");
  const want = "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d";
  console.log("SigV4 signing-key self-test:", got === want ? "PASS" : `FAIL got=${got}`);
  process.exit(got === want ? 0 : 1);
}

main().catch((e) => { console.error("fetch-product failed:", e.message); process.exit(1); });
