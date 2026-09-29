CREATE TABLE `campaigns` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`subject` varchar(998) NOT NULL,
	`body` text NOT NULL,
	`start_at` datetime(3) NOT NULL,
	`delay_ms` int NOT NULL,
	`hourly_limit` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` varchar(36) NOT NULL,
	`campaign_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`recipient` varchar(320) NOT NULL,
	`sender` varchar(320) NOT NULL,
	`scheduled_at` datetime(3) NOT NULL,
	`status` enum('scheduled','sending','sent','failed') NOT NULL DEFAULT 'scheduled',
	`attempts` int NOT NULL DEFAULT 0,
	`message_id` varchar(255),
	`preview_url` varchar(1024),
	`sent_at` datetime(3),
	`error` text,
	`lease_token` varchar(64),
	`lease_expires_at` datetime(3),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `emails_campaign_recipient_uq` UNIQUE(`campaign_id`,`recipient`)
);
--> statement-breakpoint
CREATE TABLE `slack_connections` (
	`user_id` varchar(36) NOT NULL,
	`webhook_url_enc` text NOT NULL,
	`channel` varchar(255),
	`team_name` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `slack_connections_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`google_id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255) NOT NULL,
	`avatar_url` varchar(1024),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_google_id_unique` UNIQUE(`google_id`)
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `slack_connections` ADD CONSTRAINT `slack_connections_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `campaigns_user_idx` ON `campaigns` (`user_id`);--> statement-breakpoint
CREATE INDEX `emails_user_status_time_idx` ON `emails` (`user_id`,`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `emails_status_lease_idx` ON `emails` (`status`,`lease_expires_at`);