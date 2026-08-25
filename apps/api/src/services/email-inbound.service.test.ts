import { describe, expect, it } from "vitest";
import { parseExtraMailboxes } from "./email-inbound.service.js";

describe("parseExtraMailboxes", () => {
  it("returns an empty array when unset or blank", () => {
    expect(parseExtraMailboxes(undefined)).toEqual([]);
    expect(parseExtraMailboxes("  ")).toEqual([]);
  });

  it("parses a single user:apppassword entry", () => {
    expect(parseExtraMailboxes("hello@genesishealth.com:abcdefghijklmnop")).toEqual([
      { host: "imap.gmail.com", user: "hello@genesishealth.com", pass: "abcdefghijklmnop" },
    ]);
  });

  it("parses multiple comma-separated entries and strips spaces out of the app password", () => {
    expect(parseExtraMailboxes("hello@genesishealth.com:abcd efgh ijkl mnop, greg@genesishealth.com:qrst uvwx yzab cdef")).toEqual([
      { host: "imap.gmail.com", user: "hello@genesishealth.com", pass: "abcdefghijklmnop" },
      { host: "imap.gmail.com", user: "greg@genesishealth.com", pass: "qrstuvwxyzabcdef" },
    ]);
  });

  it("accepts a space in place of the colon between user and app password — the real-world typo this was written for", () => {
    expect(parseExtraMailboxes("hello@genesishealth.com ffax ibpx xqzz hwaa")).toEqual([
      { host: "imap.gmail.com", user: "hello@genesishealth.com", pass: "ffaxibpxxqzzhwaa" },
    ]);
  });

  it("throws on an entry with no separator between user and password at all", () => {
    expect(() => parseExtraMailboxes("hello@genesishealth.com")).toThrow(/missing the separator/);
  });

  it("throws on an entry with an empty user or password", () => {
    expect(() => parseExtraMailboxes(":abcdefghijklmnop")).toThrow(/empty user or app password/);
    expect(() => parseExtraMailboxes("hello@genesishealth.com:")).toThrow(/empty user or app password/);
  });
});
