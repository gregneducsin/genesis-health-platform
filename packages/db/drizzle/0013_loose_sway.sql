CREATE TABLE "abandoned_cart_email_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"questionnaire_event_id" uuid NOT NULL,
	"step" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"message_id" text,
	"cancelled_reason" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sentiment" text,
	"message_id" text,
	"in_reply_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"lead_source" text DEFAULT 'abandoned_cart' NOT NULL,
	"state" text,
	"selected_product" text,
	"currently_taking" text,
	"wants_process_explanation" text,
	"has_time_for_intake" text,
	"wants_plan_inclusions" text,
	"ready_for_form" text,
	"last_question" text,
	"pending_topic" text,
	"last_draft" text,
	"objection_stage" integer DEFAULT 0 NOT NULL,
	"link_provided" boolean DEFAULT false NOT NULL,
	"promo_offered" boolean DEFAULT false NOT NULL,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_lead_email_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"step" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"message_id" text,
	"cancelled_reason" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_email_conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sentiment" text,
	"message_id" text,
	"in_reply_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_email_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"prescription_written" boolean DEFAULT false NOT NULL,
	"prescription_written_at" timestamp with time zone,
	"order_shipped" boolean DEFAULT false NOT NULL,
	"order_shipped_at" timestamp with time zone,
	"tracking_number" text,
	"review_requested" boolean DEFAULT false NOT NULL,
	"review_sentiment" text,
	"last_question" text,
	"pending_topic" text,
	"last_draft" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unmatched_email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unmatched_email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"ai_intent" text,
	"ai_summary" text,
	"suggested_match_customer_id" uuid,
	"suggested_match_confidence" text,
	"suggested_reply" text,
	"linked_customer_id" uuid,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email_dnd" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email_dnd_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abandoned_cart_email_triggers" ADD CONSTRAINT "abandoned_cart_email_triggers_person_id_customers_id_fk" FOREIGN KEY ("person_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_cart_email_triggers" ADD CONSTRAINT "abandoned_cart_email_triggers_questionnaire_event_id_questionnaire_events_id_fk" FOREIGN KEY ("questionnaire_event_id") REFERENCES "questionnaire_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversation_messages" ADD CONSTRAINT "email_conversation_messages_conversation_id_email_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "email_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_person_id_customers_id_fk" FOREIGN KEY ("person_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_lead_email_triggers" ADD CONSTRAINT "meta_lead_email_triggers_person_id_customers_id_fk" FOREIGN KEY ("person_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_email_conversation_messages" ADD CONSTRAINT "support_email_conversation_messages_conversation_id_support_email_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "support_email_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_email_conversations" ADD CONSTRAINT "support_email_conversations_person_id_customers_id_fk" FOREIGN KEY ("person_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_email_messages" ADD CONSTRAINT "unmatched_email_messages_thread_id_unmatched_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "unmatched_email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_email_threads" ADD CONSTRAINT "unmatched_email_threads_suggested_match_customer_id_customers_id_fk" FOREIGN KEY ("suggested_match_customer_id") REFERENCES "customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_email_threads" ADD CONSTRAINT "unmatched_email_threads_linked_customer_id_customers_id_fk" FOREIGN KEY ("linked_customer_id") REFERENCES "customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "abandoned_cart_email_triggers_event_step_key" ON "abandoned_cart_email_triggers" USING btree ("questionnaire_event_id","step");--> statement-breakpoint
CREATE INDEX "abandoned_cart_email_triggers_status_due_at_idx" ON "abandoned_cart_email_triggers" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "abandoned_cart_email_triggers_person_id_idx" ON "abandoned_cart_email_triggers" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "email_conversation_messages_conversation_id_idx" ON "email_conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_conversations_person_id_key" ON "email_conversations" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "email_conversations_status_idx" ON "email_conversations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_lead_email_triggers_person_step_key" ON "meta_lead_email_triggers" USING btree ("person_id","step");--> statement-breakpoint
CREATE INDEX "meta_lead_email_triggers_status_due_at_idx" ON "meta_lead_email_triggers" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "support_email_conversation_messages_conversation_id_idx" ON "support_email_conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_email_conversations_person_id_key" ON "support_email_conversations" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "support_email_conversations_status_idx" ON "support_email_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "unmatched_email_messages_thread_id_idx" ON "unmatched_email_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unmatched_email_threads_from_address_key" ON "unmatched_email_threads" USING btree ("from_address");