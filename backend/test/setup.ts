// Integration tests run against the docker compose MySQL and Redis configured in backend/.env.
process.loadEnvFile(".env");
process.env.NODE_ENV = "test";
process.env.MAIL_TRANSPORT = "log";
