CREATE TABLE `owner_identity_checks` (
	`code` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
