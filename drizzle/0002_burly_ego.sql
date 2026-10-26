CREATE TABLE `passkey_login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`browser_hash` text NOT NULL,
	`rate_key` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`owner_id` text,
	`result_code` text
);
--> statement-breakpoint
CREATE TABLE `passkey_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
