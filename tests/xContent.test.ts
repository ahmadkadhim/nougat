import test from "node:test";
import assert from "node:assert/strict";
import {
  extractQuotedAuthorUsernameFromUrls,
  getArticlePlainText,
  getReferencedQuoteTweetId,
  getTweetText,
  renderTweetDisplayText,
  resolveTweetUrls
} from "../convex/lib/xContent.ts";

test("getTweetText prefers note_tweet text", () => {
  const text = getTweetText({
    text: "short",
    note_tweet: {
      text: "longer note"
    }
  });

  assert.equal(text, "longer note");
});

test("getArticlePlainText returns attached article body", () => {
  const text = getArticlePlainText({
    article: {
      plain_text: "article body"
    }
  });

  assert.equal(text, "article body");
});

test("getReferencedQuoteTweetId finds quoted references", () => {
  const id = getReferencedQuoteTweetId({
    referenced_tweets: [
      { id: "1", type: "replied_to" },
      { id: "2", type: "quoted" }
    ]
  });

  assert.equal(id, "2");
});

test("resolveTweetUrls unfurls t.co links to expanded destinations", () => {
  const urls = resolveTweetUrls({
    entities: {
      urls: [
        {
          url: "https://t.co/short",
          expanded_url: "https://github.com/acme/repo"
        }
      ]
    }
  });

  assert.deepEqual(urls, [
    {
      displayUrl: "github.com/acme/repo",
      domain: "github.com",
      shortUrl: "https://t.co/short",
      expandedUrl: "https://github.com/acme/repo",
      isArticleUrl: false,
      isMediaUrl: false,
      isQuotedTweetMediaUrl: false,
      isXDomainUrl: false,
      unwoundUrl: undefined,
      resolvedUrl: "https://github.com/acme/repo",
      isXUrl: false,
      isQuotedTweetUrl: false
    }
  ]);
});

test("extractQuotedAuthorUsernameFromUrls falls back to quoted status URL", () => {
  const username = extractQuotedAuthorUsernameFromUrls(
    {
      entities: {
        urls: [
          {
            url: "https://t.co/quote",
            expanded_url: "https://x.com/quoted_author/status/12345"
          }
        ]
      }
    },
    "12345"
  );

  assert.equal(username, "quoted_author");
});

test("renderTweetDisplayText swaps t.co links for readable destinations", () => {
  const text = renderTweetDisplayText({
    text: "Check this https://t.co/short",
    entities: {
      urls: [
        {
          url: "https://t.co/short",
          expanded_url: "https://github.com/acme/repo"
        }
      ]
    }
  });

  assert.equal(text, "Check this github.com/acme/repo");
});
