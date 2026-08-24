ALTER TABLE "support_conversations" ADD COLUMN "payment_failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD COLUMN "payment_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_email_conversations" ADD COLUMN "payment_failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_email_conversations" ADD COLUMN "payment_failed_at" timestamp with time zone;