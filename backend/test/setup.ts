// Integration tests run against the docker compose MySQL and Redis configured in backend/.env.
process.loadEnvFile(".env");
process.env.NODE_ENV = "test";
process.env.MAIL_TRANSPORT = "log";
// Fake OAuth credentials: Slack's HTTP API is stubbed in the tests that use them.
process.env.SLACK_CLIENT_ID = "test-slack-client";
process.env.SLACK_CLIENT_SECRET = "test-slack-secret";
process.env.ADMIN_EMAILS = "admin@scheduler.test";
