import { describe, expect, it, vi } from "vitest";
import { db, customersTable } from "@luma/db";
import { getOrCreateConversation, appendMessage, updateConversationState } from "./conversations.service.js";
import { getOrCreateSupportConversation, appendSupportMessage, updateSupportConversationState } from "./support-conversations.service.js";
import { getOrCreateEmailConversation, appendEmailMessage, updateEmailConversationState } from "./email-conversations.service.js";
import { getOrCreateSupportEmailConversation, appendSupportEmailMessage, updateSupportEmailConversationState } from "./support-email-conversations.service.js";
import { listNeedsAttention, getNeedsAttentionMessages, clearNeedsAttentionItem } from "./needs-attention.service.js";

const notifySlackMock = vi.fn();
vi.mock("../lib/slack.js", () => ({ notifySlack: (...args: unknown[]) => notifySlackMock(...args) }));

async function seedCustomer(firstName: string): Promise<string> {
  const [row] = await db
    .insert(customersTable)
    .values({ firstName, lastName: "Attention", email: `attention-${crypto.randomUUID()}@example.com`, leadReceivedDate: "2026-08-15" })
    .returning({ id: customersTable.id });
  return row.id;
}

describe("listNeedsAttention", () => {
  it("returns flagged conversations across all 4 channels and excludes unflagged ones", async () => {
    const chrisSmsPerson = await seedCustomer("ChrisSms");
    const chrisSmsConvo = await getOrCreateConversation(chrisSmsPerson);
    await appendMessage(chrisSmsConvo.id, "inbound", "help, I have a medical question", {});
    await updateConversationState(chrisSmsConvo.id, { needsAttention: true });

    const miaSmsPerson = await seedCustomer("MiaSms");
    const miaSmsConvo = await getOrCreateSupportConversation(miaSmsPerson);
    await appendSupportMessage(miaSmsConvo.id, "inbound", "is this covered by insurance", {});
    await updateSupportConversationState(miaSmsConvo.id, { needsAttention: true });

    const chrisEmailPerson = await seedCustomer("ChrisEmail");
    const chrisEmailConvo = await getOrCreateEmailConversation(chrisEmailPerson);
    await appendEmailMessage(chrisEmailConvo.id, "inbound", "Question", "what state am I in for this", {});
    await updateEmailConversationState(chrisEmailConvo.id, { needsAttention: true });

    const miaEmailPerson = await seedCustomer("MiaEmail");
    const miaEmailConvo = await getOrCreateSupportEmailConversation(miaEmailPerson);
    await appendSupportEmailMessage(miaEmailConvo.id, "inbound", "Re: order", "emergency, please call me", {});
    await updateSupportEmailConversationState(miaEmailConvo.id, { needsAttention: true });

    const notFlaggedPerson = await seedCustomer("NotFlagged");
    await getOrCreateConversation(notFlaggedPerson);

    const items = await listNeedsAttention();
    const byPerson = Object.fromEntries(items.map((i) => [i.personId, i]));

    expect(byPerson[chrisSmsPerson]).toMatchObject({ channel: "sms", persona: "chris" });
    expect(byPerson[miaSmsPerson]).toMatchObject({ channel: "sms", persona: "mia" });
    expect(byPerson[chrisEmailPerson]).toMatchObject({ channel: "email", persona: "chris" });
    expect(byPerson[miaEmailPerson]).toMatchObject({ channel: "email", persona: "mia" });
    expect(byPerson[notFlaggedPerson]).toBeUndefined();
  });
});

describe("getNeedsAttentionMessages", () => {
  it("returns the email conversation's recent messages with subjects, oldest first", async () => {
    const personId = await seedCustomer("EmailHistory");
    const convo = await getOrCreateEmailConversation(personId);
    await appendEmailMessage(convo.id, "inbound", "First subject", "first body", {});
    await appendEmailMessage(convo.id, "outbound", "Second subject", "second body", {});

    const messages = await getNeedsAttentionMessages("email", "chris", convo.id);
    expect(messages.map((m) => m.subject)).toEqual(["First subject", "Second subject"]);
    expect(messages.map((m) => m.direction)).toEqual(["inbound", "outbound"]);
  });

  it("returns the SMS conversation's recent messages with a null subject", async () => {
    const personId = await seedCustomer("SmsHistory");
    const convo = await getOrCreateConversation(personId);
    await appendMessage(convo.id, "inbound", "hi there", {});

    const messages = await getNeedsAttentionMessages("sms", "chris", convo.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toBeNull();
    expect(messages[0].body).toBe("hi there");
  });
});

describe("clearNeedsAttentionItem", () => {
  it("clears the flag for each of the 4 channel/persona combinations", async () => {
    const chrisSmsPerson = await seedCustomer("ClearChrisSms");
    const chrisSmsConvo = await getOrCreateConversation(chrisSmsPerson);
    await updateConversationState(chrisSmsConvo.id, { needsAttention: true });
    await clearNeedsAttentionItem("sms", "chris", chrisSmsConvo.id);

    const miaSmsPerson = await seedCustomer("ClearMiaSms");
    const miaSmsConvo = await getOrCreateSupportConversation(miaSmsPerson);
    await updateSupportConversationState(miaSmsConvo.id, { needsAttention: true });
    await clearNeedsAttentionItem("sms", "mia", miaSmsConvo.id);

    const chrisEmailPerson = await seedCustomer("ClearChrisEmail");
    const chrisEmailConvo = await getOrCreateEmailConversation(chrisEmailPerson);
    await updateEmailConversationState(chrisEmailConvo.id, { needsAttention: true });
    await clearNeedsAttentionItem("email", "chris", chrisEmailConvo.id);

    const miaEmailPerson = await seedCustomer("ClearMiaEmail");
    const miaEmailConvo = await getOrCreateSupportEmailConversation(miaEmailPerson);
    await updateSupportEmailConversationState(miaEmailConvo.id, { needsAttention: true });
    await clearNeedsAttentionItem("email", "mia", miaEmailConvo.id);

    const items = await listNeedsAttention();
    const flaggedPersonIds = new Set(items.map((i) => i.personId));
    for (const personId of [chrisSmsPerson, miaSmsPerson, chrisEmailPerson, miaEmailPerson]) {
      expect(flaggedPersonIds.has(personId)).toBe(false);
    }
  });
});

describe("Slack alert on needsAttention — all 4 channels", () => {
  it("alerts once per channel when a conversation is first flagged", async () => {
    notifySlackMock.mockClear();

    const chrisSmsPerson = await seedCustomer("SlackChrisSms");
    const chrisSmsConvo = await getOrCreateConversation(chrisSmsPerson);
    await updateConversationState(chrisSmsConvo.id, { needsAttention: true, needsAttentionReason: "chris sms reason" });

    const miaSmsPerson = await seedCustomer("SlackMiaSms");
    const miaSmsConvo = await getOrCreateSupportConversation(miaSmsPerson);
    await updateSupportConversationState(miaSmsConvo.id, { needsAttention: true, needsAttentionReason: "mia sms reason" });

    const chrisEmailPerson = await seedCustomer("SlackChrisEmail");
    const chrisEmailConvo = await getOrCreateEmailConversation(chrisEmailPerson);
    await updateEmailConversationState(chrisEmailConvo.id, { needsAttention: true, needsAttentionReason: "chris email reason" });

    const miaEmailPerson = await seedCustomer("SlackMiaEmail");
    const miaEmailConvo = await getOrCreateSupportEmailConversation(miaEmailPerson);
    await updateSupportEmailConversationState(miaEmailConvo.id, { needsAttention: true, needsAttentionReason: "mia email reason" });

    expect(notifySlackMock).toHaveBeenCalledTimes(4);
    const messages = notifySlackMock.mock.calls.map((c) => c[0]);
    expect(messages.some((m) => m.includes("chris sms reason"))).toBe(true);
    expect(messages.some((m) => m.includes("mia sms reason"))).toBe(true);
    expect(messages.some((m) => m.includes("chris email reason"))).toBe(true);
    expect(messages.some((m) => m.includes("mia email reason"))).toBe(true);
  });
});
