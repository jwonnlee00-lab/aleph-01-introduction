CREATE TABLE `passkeys` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`transports` text NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`storage_location` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passkey_registration_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`browser_hash` text NOT NULL,
	`challenge` text NOT NULL,
	`options_json` text NOT NULL,
	`name` text NOT NULL,
	`storage_location` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`request_json` text,
	`credential_id` text,
	`failure_code` text
);
