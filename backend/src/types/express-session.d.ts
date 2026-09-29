import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    codeVerifier?: string;
    slackState?: string;
  }
}
