import test from "node:test";
import assert from "node:assert/strict";
import { renderLeaderboard, syncLeaderboard } from "../src/leaderboard.js";

test("sync uploads only the documented anonymous weekly summary", async () => {
  let uploaded;
  const recap = {
    usage: { totalTokens: 43_900_000 },
    value: { status: "estimated", usd: { low: 219.5, high: 658.5 }, local: { low: 313.2, high: 939.6 }, localCurrency: "AUD" },
    sessions: [
      { status: "verified", title: "private title", file: "C:/private/path", usage: { totalTokens: 10_000_000 } },
      { status: "partial", title: "another private title", usage: { totalTokens: 33_900_000 } },
    ],
  };
  const result = await syncLeaderboard(recap, {
    endpoint: "https://rank.example/api/leaderboard",
    identityPath: `/tmp/afterai-rank-${process.pid}.json`,
    name: "Token BBQ",
    fetcher: async (_url, init) => {
      uploaded = JSON.parse(init.body);
      return { ok: true, json: async () => ({ rank: 29, verifiedRank: 82, totalParticipants: 2418, leaderboard: [] }) };
    },
  });
  assert.deepEqual(Object.keys(uploaded).sort(), ["displayName", "participantId", "secret", "tokenCount", "usdHigh", "usdLow", "verifiedTokens"].sort());
  assert.equal(uploaded.displayName, "Token BBQ");
  assert.equal(uploaded.verifiedTokens, 10_000_000);
  assert.equal(JSON.stringify(uploaded).includes("private"), false);
  assert.equal(result.board.rank, 29);
});

test("rank output stays focused on one primary and one secondary rank", () => {
  const output = renderLeaderboard({
    rank: 29, verifiedRank: 82, totalParticipants: 2418, leaderboard: [],
    you: { tokenCount: 43_900_000, usdLow: 35.62, usdHigh: 69.28 },
  }, { currency: "AUD", rates: { rates: { AUD: 1.4269 } } });
  assert.match(output, /Weekly rank  #29 of 2418/);
  assert.match(output, /Verified rank  #82/);
  assert.match(output, /43\.9M tokens/);
  assert.match(output, /\$35\.62–\$69\.28/);
  assert.match(output, /A\$50\.83–A\$98\.86/);
  assert.doesNotMatch(output, /Cache rank|Model rank|Monthly rank/);
});

test("refuses to upload when pricing is Unknown", async () => {
  await assert.rejects(() => syncLeaderboard({ usage: { totalTokens: 1 }, value: { status: "unknown" }, sessions: [] }, {
    identityPath: `/tmp/afterai-rank-unknown-${process.pid}.json`, fetcher: async () => { throw new Error("should not fetch"); },
  }), /cannot be ranked honestly/);
});
