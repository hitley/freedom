CREATE TABLE "inbox_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"source" text NOT NULL,
	"label" text NOT NULL,
	"raw" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"extracted" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_instance_id_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_item_instance_status_idx" ON "inbox_item" USING btree ("instance_id","status");