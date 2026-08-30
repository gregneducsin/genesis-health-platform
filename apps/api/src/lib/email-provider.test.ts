import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getEmailProvider, EmailProviderNotConfiguredError } from "./email-provider.js";

const sendMock = vi.fn().mockResolvedValue({ data: { id: "gmail-msg-id" } });
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class MockOAuth2 { setCredentials() {} } },
    gmail: () => ({ users: { messages: { send: sendMock } } }),
  },
}));

const notifySlackMock = vi.fn();
vi.mock("./slack.js", () => ({ notifySlack: (...args: unknown[]) => notifySlackMock(...args) }));

const ENV_KEYS = [
  "EMAIL_PROVIDER",
  "GOOGLE_WORKSPACE_SMTP_USER",
  "GOOGLE_WORKSPACE_SMTP_APP_PASSWORD",
  "GOOGLE_WORKSPACE_FROM_EMAIL",
  "GOOGLE_WORKSPACE_CHRIS_FROM_NAME",
  "GOOGLE_WORKSPACE_MIA_FROM_NAME",
  "GOOGLE_GMAIL_FROM_EMAIL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_REFRESH_TOKEN",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("getEmailProvider", () => {
  it("throws EmailProviderNotConfiguredError when EMAIL_PROVIDER is unset", () => {
    expect(() => getEmailProvider("chris")).toThrow(EmailProviderNotConfiguredError);
  });

  describe("gmail_api", () => {
    it("throws when required Google OAuth vars are missing", () => {
      process.env.EMAIL_PROVIDER = "gmail_api";
      expect(() => getEmailProvider("chris")).toThrow(/GOOGLE_GMAIL_FROM_EMAIL or GOOGLE_WORKSPACE_SMTP_USER.*GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET.*GOOGLE_REDIRECT_URI.*GOOGLE_REFRESH_TOKEN/s);
    });

    function configuredProvider(persona: "chris" | "mia" = "chris") {
      process.env.EMAIL_PROVIDER = "gmail_api";
      process.env.GOOGLE_WORKSPACE_SMTP_USER = "bot@example.com";
      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      process.env.GOOGLE_REDIRECT_URI = "https://example.com/auth/google/callback";
      process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
      return getEmailProvider(persona);
    }

    it("uses the Genesis Health persona display names by default", () => {
      expect(configuredProvider("chris").fromName).toBe("Chris at Genesis Health");
      expect(configuredProvider("mia").fromName).toBe("Mia at Genesis Health");
    });

    it("sends an email and resolves with a messageId", async () => {
      sendMock.mockClear();
      const { provider } = configuredProvider();
      const result = await provider.sendEmail("customer@example.com", "Welcome", "<p>hi</p>");
      expect(result.messageId).toMatch(/^</);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("alerts Slack on a send failure, then still rejects with the original error", async () => {
      notifySlackMock.mockClear();
      sendMock.mockRejectedValueOnce(new Error("Gmail API quota exceeded"));
      const { provider } = configuredProvider();

      await expect(provider.sendEmail("customer@example.com", "Subject", "<p>hi</p>")).rejects.toThrow(/quota exceeded/);
      expect(notifySlackMock).toHaveBeenCalledTimes(1);
      expect(notifySlackMock.mock.calls[0][0]).toMatch(/Email send failed/);
    });
  });
});
