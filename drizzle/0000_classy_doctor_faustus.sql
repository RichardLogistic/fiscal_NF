CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`previous_value` text,
	`new_value` text,
	`reason` text,
	`source` text DEFAULT 'PORTAL' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `companies_branches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legal_name` text NOT NULL,
	`branch_name` text NOT NULL,
	`cnpj` text NOT NULL,
	`state` text,
	`city` text,
	`fiscal_email` text,
	`totvs_code` text,
	`qive_identifier` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_branches_cnpj_idx` ON `companies_branches` (`cnpj`);--> statement-breakpoint
CREATE TABLE `fiscal_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_type` text NOT NULL,
	`qive_id` text,
	`access_key` text,
	`number` text,
	`series` text,
	`emission_date` text,
	`emitter_name` text,
	`emitter_cnpj` text,
	`receiver_name` text,
	`receiver_cnpj` text,
	`taker_name` text,
	`taker_cnpj` text,
	`carrier_name` text,
	`carrier_cnpj` text,
	`branch_id` integer,
	`gross_value` real,
	`net_value` real,
	`freight_value` real,
	`weight_kg` real,
	`fiscal_status` text DEFAULT 'RECEIVED' NOT NULL,
	`source` text DEFAULT 'QIVE' NOT NULL,
	`original_storage_key` text,
	`original_hash` text,
	`normalized_json` text,
	`parser_version` text,
	`totvs_status` text DEFAULT 'PENDING' NOT NULL,
	`reconciliation_status` text DEFAULT 'NOT_PROCESSED' NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `companies_branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_documents_access_key_idx` ON `fiscal_documents` (`access_key`);--> statement-breakpoint
CREATE INDEX `fiscal_documents_type_emission_idx` ON `fiscal_documents` (`document_type`,`emission_date`);--> statement-breakpoint
CREATE INDEX `fiscal_documents_branch_idx` ON `fiscal_documents` (`branch_id`);--> statement-breakpoint
CREATE INDEX `fiscal_documents_reconciliation_idx` ON `fiscal_documents` (`reconciliation_status`);--> statement-breakpoint
CREATE TABLE `integration_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`integration_key` text NOT NULL,
	`status` text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	`last_sync_at` text,
	`last_cursor` text,
	`received_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`queue_count` integer DEFAULT 0 NOT NULL,
	`average_processing_ms` integer,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_states_key_idx` ON `integration_states` (`integration_key`);--> statement-breakpoint
CREATE TABLE `reconciliations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer,
	`totvs_row_id` integer,
	`match_type` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`fiscal_value` real,
	`totvs_value` real,
	`difference_value` real,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `fiscal_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`totvs_row_id`) REFERENCES `totvs_rows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reconciliations_status_idx` ON `reconciliations` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliations_pair_idx` ON `reconciliations` (`document_id`,`totvs_row_id`);--> statement-breakpoint
CREATE TABLE `saved_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`report_type` text NOT NULL,
	`filters_json` text DEFAULT '{}' NOT NULL,
	`columns_json` text DEFAULT '[]' NOT NULL,
	`sort_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `totvs_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_hash` text NOT NULL,
	`file_size` integer NOT NULL,
	`status` text DEFAULT 'IMPORTED' NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`accepted_rows` integer DEFAULT 0 NOT NULL,
	`rejected_rows` integer DEFAULT 0 NOT NULL,
	`columns_json` text DEFAULT '[]' NOT NULL,
	`mapping_json` text DEFAULT '{}' NOT NULL,
	`imported_by` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `totvs_imports_hash_idx` ON `totvs_imports` (`file_hash`);--> statement-breakpoint
CREATE TABLE `totvs_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`row_number` integer NOT NULL,
	`access_key` text,
	`document_number` text,
	`series` text,
	`cnpj` text,
	`supplier_name` text,
	`gross_value` real,
	`net_value` real,
	`emission_date` text,
	`due_date` text,
	`invoice_number` text,
	`title_number` text,
	`cost_center` text,
	`branch_code` text,
	`raw_json` text NOT NULL,
	`validation_status` text DEFAULT 'VALID' NOT NULL,
	`validation_message` text,
	FOREIGN KEY (`import_id`) REFERENCES `totvs_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `totvs_rows_import_idx` ON `totvs_rows` (`import_id`);--> statement-breakpoint
CREATE TABLE `user_dashboards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`layout_json` text DEFAULT '[]' NOT NULL,
	`global_filters_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_dashboards_user_idx` ON `user_dashboards` (`user_email`);