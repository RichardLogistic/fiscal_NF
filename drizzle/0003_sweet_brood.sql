ALTER TABLE `fiscal_documents` ADD `owner_cnpj` text;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `owner_role` text;--> statement-breakpoint
CREATE INDEX `fiscal_documents_owner_role_idx` ON `fiscal_documents` (`owner_role`);