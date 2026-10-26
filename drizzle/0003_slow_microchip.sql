CREATE TABLE `passkey_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`action` text NOT NULL,
	`remaining_count` integer NOT NULL,
	`created_at` integer NOT NULL
);
