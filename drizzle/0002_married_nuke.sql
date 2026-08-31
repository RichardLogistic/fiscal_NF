ALTER TABLE `fiscal_documents` ADD `icms_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `icms_st_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `ipi_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `pis_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `cofins_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `iss_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `inss_retained_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `irrf_retained_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `csll_retained_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `pis_retained_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `cofins_retained_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `iss_retained_value` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `retained_total` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `tax_total` real;--> statement-breakpoint
ALTER TABLE `fiscal_documents` ADD `taxes_json` text;