CREATE TABLE `attachments` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`campaign_id` varchar(36),
	`filename` varchar(255) NOT NULL,
	`content_type` varchar(127) NOT NULL,
	`size` int NOT NULL,
	`data` longblob NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attachments_campaign_idx` ON `attachments` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `attachments_user_idx` ON `attachments` (`user_id`,`campaign_id`);