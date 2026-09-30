// Integration tests run against the docker compose MySQL and Redis configured in backend/.env.
process.loadEnvFile(".env");
process.env.NODE_ENV = "test";
process.env.MAIL_TRANSPORT = "log";
process.env.ELASTICSEARCH_INDEX = "emails-test";
process.env.QUEUE_PREFIX = "bull-test";
// Fake OAuth credentials so tests never depend on a developer's real .env (or reach Google/Slack).
process.env.GOOGLE_CLIENT_ID = "test-google-client";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
process.env.SLACK_CLIENT_ID = "test-slack-client";
process.env.SLACK_CLIENT_SECRET = "test-slack-secret";
process.env.ADMIN_EMAILS = "admin@scheduler.test";
