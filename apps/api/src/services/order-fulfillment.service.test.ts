import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, customersTable, reviewRequestTriggersTable } from "@luma/db";
import { setCustomerSmsDnd } from "./dnd.service.js";

const sendMessageMock = vi.fn();
vi.mock("../lib/sms-provider.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/sms-provider.js")>("../lib/sms-provider.js");
  return { ...actual, getSmsProvider: () => ({ sendMessage: sendMessageMock }) };
});

const { sendOrderReceivedOpener, handlePrescriptionWritten, handleOrderShipped, handlePaymentFailed, sweepReviewRequestTriggers } = await import(
  "./order-fulfillment.service.js"
);
const { getOrCreateSupportConversation, listSupportMessages } = await import("./support-conversations.service.js");

async function seedCustomer(opts: { phone?: string | null } = {}): Promise<string> {
  const [row] = await db
    .insert(customersTable)
    .values({
      firstName: "Fulfillment",
      lastName: "Test",
      email: `fulfillment-${crypto.randomUUID()}@example.com`,
      leadReceivedDate: "2026-08-16",
      phone: opts.phone === undefined ? "+15559991111" : opts.phone,
    })
    .returning({ id: customersTable.id });
  return row.id;
}

describe("sendOrderReceivedOpener", () => {
  it("sends the order-received message and logs it", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValueOnce({ providerMessageId: "msg_opener" });

    const personId = await seedCustomer();
    await sendOrderReceivedOpener(personId);

    expect(sendMessageMock).toHaveBeenCalledWith("+15559991111", expect.stringContaining("this is Lisa"));
    const conversation = await getOrCreateSupportConversation(personId);
    const messages = await listSupportMessages(conversation.id);
    expect(messages.length).toBe(1);
    expect(messages[0].providerMessageId).toBe("msg_opener");
  });

  it("does not call the provider when there's no phone on file", async () => {
    sendMessageMock.mockClear();
    const personId = await seedCustomer({ phone: null });
    await sendOrderReceivedOpener(personId);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("does not call the provider when the customer is SMS do-not-disturb", async () => {
    sendMessageMock.mockClear();
    const personId = await seedCustomer();
    await setCustomerSmsDnd(personId, true);
    await sendOrderReceivedOpener(personId);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe("handlePrescriptionWritten", () => {
  it("updates the conversation state and sends the notice", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValueOnce({ providerMessageId: "msg_prescription" });

    const personId = await seedCustomer();
    await handlePrescriptionWritten(personId);

    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.prescriptionWritten).toBe(true);
    expect(conversation.prescriptionWrittenAt).not.toBeNull();
    const messages = await listSupportMessages(conversation.id);
    expect(messages.length).toBe(1);
    expect(messages[0].body).toContain("prescription");
  });

  it("still updates state when there's no phone on file, but sends nothing", async () => {
    sendMessageMock.mockClear();
    const personId = await seedCustomer({ phone: null });
    await handlePrescriptionWritten(personId);

    expect(sendMessageMock).not.toHaveBeenCalled();
    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.prescriptionWritten).toBe(true);
  });
});

describe("handleOrderShipped", () => {
  it("updates the conversation state with the tracking number and sends the notice", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValueOnce({ providerMessageId: "msg_shipped" });

    const personId = await seedCustomer();
    await handleOrderShipped(personId, "TRACK123456");

    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.orderShipped).toBe(true);
    expect(conversation.trackingNumber).toBe("TRACK123456");
    const messages = await listSupportMessages(conversation.id);
    expect(messages[0].body).toContain("TRACK123456");

    // Review-request trigger arming is disabled for Genesis Health (no
    // write-a-review link to offer yet) — see the comment in
    // order-fulfillment.service.ts's handleOrderShipped. Confirms it stays
    // disabled rather than silently starting to arm again.
    const [trigger] = await db.select().from(reviewRequestTriggersTable).where(eq(reviewRequestTriggersTable.personId, personId));
    expect(trigger).toBeUndefined();
  });

  it("updates the tracking number on a second shipped event for the same person", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValue({ providerMessageId: "msg_shipped" });

    const personId = await seedCustomer();
    await handleOrderShipped(personId, "TRACK1");
    await handleOrderShipped(personId, "TRACK2");

    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.trackingNumber).toBe("TRACK2");
  });
});

describe("handlePaymentFailed", () => {
  it("first order: flags the conversation, sends the 'reply and we'll help' text, no 'still interested' question", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValueOnce({ providerMessageId: "msg_payment_failed_first" });

    const personId = await seedCustomer();
    await handlePaymentFailed(personId, true);

    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.paymentFailed).toBe(true);
    expect(conversation.paymentFailedAt).not.toBeNull();
    expect(conversation.needsAttention).toBe(true);
    expect(conversation.needsAttentionReason).toMatch(/payment/i);

    const messages = await listSupportMessages(conversation.id);
    expect(messages.length).toBe(1);
    expect(messages[0].body).toContain("Reply here");
    expect(messages[0].body).not.toMatch(/still interested/i);
  });

  it("recurring: asks whether they still want the refill instead of the first-order copy", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValueOnce({ providerMessageId: "msg_payment_failed_recurring" });

    const personId = await seedCustomer();
    await handlePaymentFailed(personId, false);

    const conversation = await getOrCreateSupportConversation(personId);
    const messages = await listSupportMessages(conversation.id);
    expect(messages[0].body).toMatch(/still interested/i);
    expect(messages[0].body).toContain("refill");
  });

  it("still flags the conversation when there's no phone on file, but sends no text", async () => {
    sendMessageMock.mockClear();

    const personId = await seedCustomer({ phone: null });
    await handlePaymentFailed(personId, true);

    expect(sendMessageMock).not.toHaveBeenCalled();
    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.paymentFailed).toBe(true);
    expect(conversation.needsAttention).toBe(true);
  });

  it("respects SMS do-not-disturb: no text sent, but still flags the conversation", async () => {
    sendMessageMock.mockClear();

    const personId = await seedCustomer();
    await setCustomerSmsDnd(personId, true);
    await handlePaymentFailed(personId, true);

    expect(sendMessageMock).not.toHaveBeenCalled();
    const conversation = await getOrCreateSupportConversation(personId);
    expect(conversation.paymentFailed).toBe(true);
  });
});

describe("sweepReviewRequestTriggers", () => {
  // The review-request flow (post-delivery "how was your experience" +
  // write-a-review link) is disabled for Genesis Health — handleOrderShipped
  // no longer arms these triggers, so the sweep never has anything to do.
  // The full scenario coverage (retry, overlap safety, NO_PHONE_NUMBER,
  // etc.) still exists in the Luma codebase this was forked from; restore it
  // here once a real write-a-review link exists and arming is re-enabled.
  it("is a safe no-op — there is nothing to sweep since triggers are never armed", async () => {
    sendMessageMock.mockClear();
    sendMessageMock.mockResolvedValueOnce({ providerMessageId: "msg_shipped" }); // handleOrderShipped's own notice
    const personId = await seedCustomer();
    await handleOrderShipped(personId, "TRACK-NOOP");

    sendMessageMock.mockClear();
    const result = await sweepReviewRequestTriggers();
    expect(result).toEqual({ sentCount: 0, failedCount: 0, cancelledCount: 0 });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  // Arming is disabled for Genesis Health (see above), but the sweep's DND
  // guard is still live code — exercise it directly against a manually
  // inserted trigger row rather than relying on handleOrderShipped to arm one.
  it("cancels a due trigger when the customer is SMS do-not-disturb", async () => {
    sendMessageMock.mockClear();
    const personId = await seedCustomer();
    await setCustomerSmsDnd(personId, true);
    await db.insert(reviewRequestTriggersTable).values({ personId, dueAt: new Date(Date.now() - 60_000) });

    const result = await sweepReviewRequestTriggers();
    expect(result.cancelledCount).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
    const [trigger] = await db.select().from(reviewRequestTriggersTable).where(eq(reviewRequestTriggersTable.personId, personId));
    expect(trigger.status).toBe("cancelled");
    expect(trigger.cancelledReason).toBe("opted_out");
  });
});
