import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const notifySlackMock = vi.fn();
vi.mock("../lib/slack.js", () => ({ notifySlack: (...args: unknown[]) => notifySlackMock(...args) }));

const connectMock = vi.fn();
vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(function ImapFlowMock() {
    return {
      on: vi.fn(),
      connect: connectMock,
      logout: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

const { parseExtraMailboxes, isIgnoredSender, sweepInboundEmail } = await import("./email-inbound.service.js");

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

describe("sweepInboundEmail", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_WORKSPACE_SMTP_USER = "bot@example.com";
    process.env.GOOGLE_WORKSPACE_SMTP_APP_PASSWORD = "ulzqezghvjvulqfg";
    delete process.env.EMAIL_INBOUND_EXTRA_MAILBOXES;
    notifySlackMock.mockClear();
    connectMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // A revoked app password or connection failure used to only ever hit
  // logger.error — nothing surfaced outside the server logs, so inbound
  // routing for that mailbox could stay silently dead until someone thought
  // to check Railway logs. This locks in that it now alerts the same way
  // every other failure class in this sweep already does.
  it("alerts Slack when a mailbox connection fails, naming the mailbox", async () => {
    connectMock.mockRejectedValue(new Error("Invalid credentials (Failure)"));

    const result = await sweepInboundEmail();

    expect(result.failedCount).toBe(1);
    expect(notifySlackMock).toHaveBeenCalledTimes(1);
    expect(notifySlackMock.mock.calls[0][0]).toMatch(/bot@example\.com/);
    expect(notifySlackMock.mock.calls[0][0]).toMatch(/Invalid credentials/);
  });
});

describe("isIgnoredSender", () => {
  it("returns false when EMAIL_INBOUND_IGNORED_SENDERS is unset or blank", () => {
    expect(isIgnoredSender("help@example-platform.ai", undefined)).toBe(false);
    expect(isIgnoredSender("help@example-platform.ai", "  ")).toBe(false);
  });

  it("matches an exact address in the comma-separated list, case-insensitively", () => {
    const list = "help@example-platform.ai,support@example-platform.ai";
    expect(isIgnoredSender("help@example-platform.ai", list)).toBe(true);
    expect(isIgnoredSender("HELP@Example-Platform.AI", list)).toBe(true);
    expect(isIgnoredSender("support@example-platform.ai", list)).toBe(true);
  });

  it("does not match an address that isn't in the list", () => {
    expect(isIgnoredSender("real.customer@gmail.com", "help@example-platform.ai")).toBe(false);
  });

  it("does not do a domain/wildcard match — only exact addresses", () => {
    expect(isIgnoredSender("someone-else@example-platform.ai", "help@example-platform.ai")).toBe(false);
  });
});
