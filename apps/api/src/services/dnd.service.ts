import { eq } from "drizzle-orm";
import { db, customersTable } from "@luma/db";

/**
 * Email opt-out tracking. SMS/iMessage has no equivalent flag yet — no SMS
 * provider is wired up (sms-provider.ts throws until one is), so there's
 * nothing to gate on that channel. Every email send path must check
 * isCustomerEmailDnd before sending.
 */

/** True once a customer has opted out of email (STOP-equivalent reply, or the unsubscribe link) and hasn't purchased since. */
export async function isCustomerEmailDnd(personId: string): Promise<boolean> {
  const [row] = await db.select({ emailDnd: customersTable.emailDnd }).from(customersTable).where(eq(customersTable.id, personId));
  return row?.emailDnd ?? false;
}

/**
 * Sets or clears a customer's email do-not-disturb flag. Set true on an
 * inbound OPT_OUT pre-check code (lucy-email-dispatch.service.ts /
 * sarah-email-dispatch.service.ts) or the one-click unsubscribe link every
 * automated email carries (email-unsubscribe.routes.ts); cleared
 * automatically on purchase — a purchase is treated as fresh consent to be
 * messaged again.
 */
export async function setCustomerEmailDnd(personId: string, dnd: boolean): Promise<void> {
  await db
    .update(customersTable)
    .set({ emailDnd: dnd, emailDndAt: dnd ? new Date() : null })
    .where(eq(customersTable.id, personId));
}
