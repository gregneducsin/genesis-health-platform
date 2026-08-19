import { randomBytes } from "node:crypto";
import { Router, type Router as RouterType } from "express";
import { google } from "googleapis";
import { requireRole } from "../middleware/requireAuth.js";

/**
 * No hardcoded fallback redirect URI — unlike a same-stack sibling app that
 * defaults this to its own known production URL, this app's real deployed
 * URL isn't known at write time. GOOGLE_REDIRECT_URI must be set explicitly
 * (see .env.example); an unset value fails loudly here rather than silently
 * pointing Google's OAuth callback at the wrong app's domain.
 */
function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth environment variables are missing (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).");
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );
}

export function createGmailOAuthRouter(): RouterType {
  const router: RouterType = Router();

  // Only an admin may (re)connect the app's outbound Gmail identity —
  // without this, anyone who found this URL could run through Google's
  // consent screen for their own account. Nothing currently persists the
  // resulting refresh token automatically (see the callback below), so
  // today that's inert, but it's the exact route a future auto-persist
  // step would need to already be locked down, not retrofitted later.
  router.get("/", requireRole("admin"), (_req, res, next) => {
    try {
      const state = randomBytes(32).toString("hex");

      res.cookie("google_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60 * 1000,
        path: "/auth/google",
      });

      const authorizationUrl = createOAuthClient().generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        state,
        // gmail.send only — the app only ever calls users.messages.send
        // (see gmail.service.ts). gmail.modify additionally grants
        // read/delete/label access to the whole mailbox, none of which
        // this app uses; scoping down means a leaked refresh token or
        // client secret can only be used to send mail, not read or
        // destroy any of it.
        scope: [
          "https://www.googleapis.com/auth/gmail.send",
        ],
      });

      res.redirect(authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  // Same admin-only gate as above — Google redirects the browser back here
  // with the auth code, and since this is a same-site top-level navigation
  // the session cookie still rides along, so req.user is populated same as
  // any other request. The state param/cookie check below is the OAuth-flow
  // CSRF protection; this role check is a separate, additional gate on who
  // may complete the flow at all.
  router.get("/callback", requireRole("admin"), async (req, res, next) => {
    try {
      const code =
        typeof req.query.code === "string"
          ? req.query.code
          : "";

      const state =
        typeof req.query.state === "string"
          ? req.query.state
          : "";

      const expectedState = req.cookies.google_oauth_state;

      if (
        !code ||
        !state ||
        !expectedState ||
        state !== expectedState
      ) {
        res
          .status(400)
          .send("Invalid Google authorization response.");
        return;
      }

      res.clearCookie("google_oauth_state", {
        path: "/auth/google",
      });

      const { tokens } =
        await createOAuthClient().getToken(code);

      if (!tokens.refresh_token) {
        res
          .status(400)
          .send(
            "Google did not provide a refresh token. Revoke access and try again.",
          );
        return;
      }

      res
        .status(200)
        .send("Google Workspace connected successfully (scope: gmail.send). You may close this page.");
    } catch (error) {
      next(error);
    }
  });

  return router;
}
