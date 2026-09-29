import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { HttpError } from "../lib/http-error.js";
import { createOAuthState, oauthStatesMatch } from "../lib/oauth-state.js";

const GOOGLE_SCOPES = ["openid", "email", "profile"];
const REDIRECT_URI = new URL(
  "/auth/google/callback",
  env.API_PUBLIC_URL,
).toString();

function googleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, "Google login is not configured");
  }
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
  });
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
}

async function upsertUser(profile: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}) {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, ...profile })
    .onDuplicateKeyUpdate({
      set: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.googleId, profile.googleId),
  });
  if (!user) throw new Error("User upsert failed");
  return user;
}

export const googleAuthRouter = Router();

googleAuthRouter.get("/google", async (req, res) => {
  const client = googleClient();
  const { codeVerifier, codeChallenge } =
    await client.generateCodeVerifierAsync();
  const state = createOAuthState();
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  const url = client.generateAuthUrl({
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account",
  });
  res.redirect(url);
});

googleAuthRouter.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const { oauthState, codeVerifier } = req.session;
  delete req.session.oauthState;
  delete req.session.codeVerifier;

  if (error) {
    res.redirect(`${env.FRONTEND_ORIGIN}/login?error=access_denied`);
    return;
  }
  if (
    !oauthStatesMatch(oauthState, state) ||
    typeof code !== "string" ||
    !codeVerifier
  ) {
    throw new HttpError(400, "Invalid OAuth state");
  }

  const client = googleClient();
  const { tokens } = await client.getToken({ code, codeVerifier });
  if (!tokens.id_token)
    throw new HttpError(400, "Google did not return an ID token");

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new HttpError(403, "Google account email is not verified");
  }

  const user = await upsertUser({
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  });

  // New session id after login prevents session fixation.
  await regenerateSession(req);
  req.session.userId = user.id;
  res.redirect(`${env.FRONTEND_ORIGIN}/dashboard`);
});

googleAuthRouter.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie(SESSION_COOKIE_NAME).status(204).end();
  });
});

export const SESSION_COOKIE_NAME = "sid";
