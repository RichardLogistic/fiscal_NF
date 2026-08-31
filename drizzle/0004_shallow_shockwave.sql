CREATE TABLE `portal_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'READER' NOT NULL,
	`branch_scope_json` text DEFAULT '["ALL"]' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`last_access_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_users_email_idx` ON `portal_users` (`email`);--> statement-breakpoint
CREATE INDEX `portal_users_status_idx` ON `portal_users` (`status`);--> statement-breakpoint
CREATE INDEX `portal_users_role_idx` ON `portal_users` (`role`);