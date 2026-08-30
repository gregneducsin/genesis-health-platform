import { z } from "zod";

export const sendChrisTestMessageRequestSchema = z.object({
  customerId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});
export type SendChrisTestMessageRequest = z.infer<typeof sendChrisTestMessageRequestSchema>;

export const chrisTurnResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    action: z.string(),
    reply: z.string().nullable(),
    nextQuestion: z.string().nullable(),
    link: z.string().nullable(),
    objectionStage: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    linkProvided: z.boolean(),
    promoOffered: z.boolean(),
    inboundSentiment: z.enum(["positive", "neutral", "negative"]).nullable(),
    requiresStaff: z.boolean(),
    knowledgeTopicsUsed: z.array(z.string()),
    validatedSlotUpdates: z.record(z.string(), z.unknown()),
  }),
  z.object({ ok: z.literal(false), code: z.string() }),
]);
export type ChrisTurnResponse = z.infer<typeof chrisTurnResponseSchema>;
