import { Router, type Router as RouterType } from "express";
import { ZodError, type ZodIssue } from "zod";
import { baskQuestionnaireWebhookRequestSchema, baskNativeQuestionnaireEnvelopeSchema, type BaskQuestionnaireWebhookRequest } from "@luma/shared";
import { createWebhookAuth } from "../../middleware/webhookAuth.js";
import { handleBaskQuestionnaireWebhook } from "../../services/webhooks.service.js";
import { respondToInvalidWebhookPayload } from "../../lib/webhook-validation.js";

/**
 * Maps Bask's native `type` field to our internal status. Only
 * "abandonedSession" is confirmed against a real Bask webhook config
 * (2026-08-17) — add the others here once a real delivery shows what Bask
 * actually sends for "started"/"submitted", rather than guessing.
 */
const BASK_NATIVE_EVENT_TYPE_TO_STATUS: Record<string, "started" | "abandoned" | "submitted"> = {
  abandonedSession: "abandoned",
};

type ParsedPayload = { ok: true; data: BaskQuestionnaireWebhookRequest } | { ok: false; error: ZodError };

/**
 * Accepts either shape: Bask's own native `{ type, data }` webhook envelope
 * (no explicit status — the event type is the status), or the flat shape a
 * Zapier relay in front of Bask sends (explicit status field, no wrapper).
 * Disambiguated by the presence of a top-level `type` string, since that's
 * not a field either shape otherwise uses at the top level.
 *
 * All three failure branches surface as a ZodError (an unrecognized event
 * type gets one synthesized) so every rejection — not just a schema
 * mismatch — goes through respondToInvalidWebhookPayload and shows up on
 * the portal's Webhook Log page.
 */
function parseBaskQuestionnairePayload(body: unknown): ParsedPayload {
  if (typeof body === "object" && body !== null && "type" in body) {
    const envelope = baskNativeQuestionnaireEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      return { ok: false, error: envelope.error };
    }
    const status = BASK_NATIVE_EVENT_TYPE_TO_STATUS[envelope.data.type];
    if (!status) {
      const issue: ZodIssue = { code: "custom", path: ["type"], message: `Unrecognized Bask event type: "${envelope.data.type}".` };
      return { ok: false, error: new ZodError([issue]) };
    }
    return { ok: true, data: { ...envelope.data.data, status } };
  }

  const flat = baskQuestionnaireWebhookRequestSchema.safeParse(body);
  if (!flat.success) {
    return { ok: false, error: flat.error };
  }
  return { ok: true, data: flat.data };
}

export function createBaskQuestionnaireWebhookRouter(): RouterType {
  const router: RouterType = Router();
  const auth = createWebhookAuth("QUESTIONNAIRE_WEBHOOK_SECRET");

  router.post("/", auth, async (req, res, next) => {
    try {
      const parsed = parseBaskQuestionnairePayload(req.body);
      if (!parsed.ok) {
        await respondToInvalidWebhookPayload("bask_questionnaire", req, res, parsed.error);
        return;
      }
      const result = await handleBaskQuestionnaireWebhook(parsed.data);
      res.status(200).json({ ok: true, duplicate: result.duplicate });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
