import { describe, it, expect, vi } from "vitest";
import type { MiaInteractiveResult } from "../lib/support/types.js";
import type { MiaPreviewRequestBody } from "../lib/support/types.js";

const callMiaInteractiveMock = vi.fn();
vi.mock("../lib/support/provider.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/support/provider.js")>("../lib/support/provider.js");
  return {
    ...actual,
    callMiaInteractive: (...args: unknown[]) => callMiaInteractiveMock(...args),
  };
});

const { runMiaTurn } = await import("./mia-conversation.service.js");

function baseBody(overrides: Partial<MiaPreviewRequestBody> = {}): MiaPreviewRequestBody {
  return {
    messages: [{ direction: "inbound", body: "Has my order shipped yet?" }],
    orderState: { prescriptionWritten: false, orderShipped: false, trackingNumber: null, paymentFailed: false },
    reviewRequested: false,
    lastQuestion: null,
    pendingTopic: null,
    lastDraft: null,
    ...overrides,
  };
}

function modelResult(overrides: Partial<MiaInteractiveResult> = {}): MiaInteractiveResult {
  return {
    action: "reply",
    reply: "Your order hasn't shipped yet, the doctor is still reviewing it.",
    confidence: 0.9,
    detectedIntents: [],
    knowledgeTopicsUsed: [],
    requiresStaff: false,
    safetyCodes: [],
    nextQuestion: "Is there anything else I can help with?",
    inboundSentiment: "neutral",
    ...overrides,
  };
}

describe("runMiaTurn", () => {
  it("short-circuits on a pre-check block without ever calling the provider", async () => {
    callMiaInteractiveMock.mockClear();
    const result = await runMiaTurn(baseBody({ messages: [{ direction: "inbound", body: "STOP" }] }));

    expect(callMiaInteractiveMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("pause");
      expect(result.source).toBe("pre_check_block");
    }
  });

  it("routes a prescription question to staff_review via pre-check, no provider call, but still replies with the patient portal instead of leaving the patient in silence", async () => {
    callMiaInteractiveMock.mockClear();
    const result = await runMiaTurn(baseBody({ messages: [{ direction: "inbound", body: "what dosage am I on" }] }));

    expect(callMiaInteractiveMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("staff_review");
      expect(result.requiresStaff).toBe(true);
      expect(result.reply).toMatch(/portal/i);
      expect(result.reply).toContain("https://patient.trygenesis.com/login");
      expect(result.preCheckCode).toBe("PRESCRIPTION_QUESTION");
    }
  });

  it("routes a cold-chain concern to staff_review via pre-check, no provider call, but still points the patient to the portal instead of leaving them in silence", async () => {
    callMiaInteractiveMock.mockClear();
    const result = await runMiaTurn(
      baseBody({ messages: [{ direction: "inbound", body: "One ice pack on one side. Hot to the touch providing no refrigeration at all!" }] }),
    );

    expect(callMiaInteractiveMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("staff_review");
      expect(result.requiresStaff).toBe(true);
      expect(result.reply).toMatch(/portal/i);
      expect(result.reply).toContain("https://patient.trygenesis.com/login");
      expect(result.preCheckCode).toBe("COLD_CHAIN_CONCERN");
    }
  });

  it("routes a request to pause/hold a prescription to staff_review via pre-check, no provider call, points to the portal, and never confirms the pause happened", async () => {
    callMiaInteractiveMock.mockClear();
    const result = await runMiaTurn(baseBody({ messages: [{ direction: "inbound", body: "can you pause my prescription for a couple months" }] }));

    expect(callMiaInteractiveMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("staff_review");
      expect(result.requiresStaff).toBe(true);
      expect(result.reply).toMatch(/portal/i);
      expect(result.reply).toContain("https://patient.trygenesis.com/login");
      // Never a confirmation that the pause happened — Mia has no way to
      // action it, only to point at the portal and flag a person.
      expect(result.reply).not.toMatch(/paused|has been paused|you're paused|is paused/i);
      expect(result.preCheckCode).toBe("PAUSE_PRESCRIPTION_REQUEST");
    }
  });

  it("fails closed with the guardrail's rejection code when post-check rejects the model's reply", async () => {
    callMiaInteractiveMock.mockClear();
    callMiaInteractiveMock.mockResolvedValueOnce(modelResult({ reply: "Your semaglutide dose is being increased." }));
    const result = await runMiaTurn(baseBody());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROHIBITED_CLINICAL");
  });

  it("retries once on a format-only rejection (MISSING_NEXT_QUESTION) and succeeds on the second attempt", async () => {
    callMiaInteractiveMock.mockClear();
    callMiaInteractiveMock
      .mockResolvedValueOnce(modelResult({ nextQuestion: null }))
      .mockResolvedValueOnce(modelResult({ nextQuestion: "Anything else I can help with?" }));
    const result = await runMiaTurn(baseBody());

    expect(callMiaInteractiveMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextQuestion).toBe("Anything else I can help with?");
  });

  it("does not retry a safety-relevant rejection", async () => {
    callMiaInteractiveMock.mockClear();
    callMiaInteractiveMock.mockResolvedValueOnce(modelResult({ reply: "Side effects are common." }));
    const result = await runMiaTurn(baseBody());

    expect(callMiaInteractiveMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROHIBITED_CLINICAL");
  });

  it("passes through action=staff_review and requiresStaff from the model", async () => {
    callMiaInteractiveMock.mockClear();
    callMiaInteractiveMock.mockResolvedValueOnce(
      modelResult({ action: "staff_review", reply: null, nextQuestion: null, requiresStaff: true }),
    );
    const result = await runMiaTurn(baseBody());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("staff_review");
      expect(result.requiresStaff).toBe(true);
    }
  });
});
