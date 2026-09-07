ALTER TABLE "app_user" ADD COLUMN "avatar_public_id" varchar(255);--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "avatar_version" varchar(20);--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "avatar_updated_at" timestamp with time zone;