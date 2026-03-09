import test from "node:test";
import assert from "node:assert/strict";
import { buildXAuthorizeUrl, createOAuthState, createPkcePair, defaultXScopes, parseScope } from "../convex/lib/xOAuth.ts";

test("createPkcePair returns verifier and challenge", async () => {
  const pair = await createPkcePair();
  assert.ok(pair.verifier.length > 20);
  assert.ok(pair.challenge.length > 20);
  assert.notEqual(pair.verifier, pair.challenge);
});

test("createOAuthState returns a non-empty value", () => {
  assert.ok(createOAuthState().length > 10);
});

test("buildXAuthorizeUrl includes expected core params", () => {
  const url = new URL(
    buildXAuthorizeUrl({
      clientId: "client123",
      redirectUri: "https://example.com/callback",
      state: "state123",
      codeChallenge: "challenge123"
    })
  );

  assert.equal(url.origin + url.pathname, "https://twitter.com/i/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "client123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/callback");
  assert.equal(url.searchParams.get("state"), "state123");
  assert.equal(url.searchParams.get("code_challenge"), "challenge123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), defaultXScopes().join(" "));
});

test("parseScope splits a space-delimited scope string", () => {
  assert.deepEqual(parseScope("tweet.read users.read bookmark.read"), [
    "tweet.read",
    "users.read",
    "bookmark.read"
  ]);
});
