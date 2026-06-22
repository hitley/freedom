CREATE TABLE "spending_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spending_state_instance_id_unique" UNIQUE("instance_id")
);
--> statement-breakpoint
ALTER TABLE "spending_state" ADD CONSTRAINT "spending_state_instance_id_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance"("id") ON DELETE cascade ON UPDATE no action;