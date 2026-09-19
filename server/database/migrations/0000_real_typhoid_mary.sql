CREATE TABLE "album_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"album_id" integer NOT NULL,
	"photo_id" text NOT NULL,
	"position" double precision DEFAULT 1000000 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_photo_id" text,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"reaction_type" text NOT NULL,
	"fingerprint" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"description" text,
	"width" integer,
	"height" integer,
	"aspect_ratio" double precision,
	"date_taken" text,
	"storage_key" text,
	"thumbnail_key" text,
	"file_size" integer,
	"last_modified" text,
	"original_url" text,
	"thumbnail_url" text,
	"thumbnail_hash" text,
	"tags" jsonb,
	"exif" jsonb,
	"latitude" double precision,
	"longitude" double precision,
	"country" text,
	"city" text,
	"location_name" text,
	"is_live_photo" integer DEFAULT 0 NOT NULL,
	"live_photo_video_url" text,
	"live_photo_video_key" text,
	CONSTRAINT "photos_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload" jsonb DEFAULT '{"type":"photo","storageKey":""}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_stage" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"namespace" text DEFAULT 'common' NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"value" text,
	"default_value" text,
	"label" text,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_readonly" boolean DEFAULT false NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"enum" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"oidc_issuer" text NOT NULL,
	"oidc_subject" text NOT NULL,
	"avatar" text,
	"created_at" timestamp with time zone NOT NULL,
	"is_admin" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_photo_id_photos_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reactions" ADD CONSTRAINT "photo_reactions_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_namespace_key" ON "settings" USING btree ("namespace","key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oidc_identity" ON "users" USING btree ("oidc_issuer","oidc_subject");