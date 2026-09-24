/**
 * Signing in with Google, the confidential client half of it: the code comes
 * back to the browser, and everything after that happens here, with the client
 * secret, over TLS to Google.
 *
 * The identity is read from the userinfo endpoint rather than from the id
 * token. It costs one more request and saves verifying a signature against a
 * rotating key set, which is the part that goes quietly wrong.
 */
import { env } from "./env.js";

export interface GoogleIdentity {
  /** Google's stable id for the person. Never an email: those can change. */
  subject: string;
  email: string;
  emailVerified: boolean;
}

export const googleEnabled = (): boolean => env.google !== null;

/** Where Google must send the browser back. Fixed, and registered there. */
export const callbackUrl = (origin: string): string => `${origin}/api/auth/google/callback`;

export function authorizeUrl(origin: string, state: string): string {
  if (!env.google) throw new Error("Google sign-in is not configured");
  const url = new URL(env.google.authUrl);
  url.searchParams.set("client_id", env.google.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  // Ask for the account chooser rather than silently reusing the last one.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Trades the code for an access token, then reads who it belongs to. */
export async function identityFromCode(origin: string, code: string): Promise<GoogleIdentity | null> {
  if (!env.google) return null;

  const tokenResponse = await fetch(env.google.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    console.error("google: the token exchange failed:", tokenResponse.status, await tokenResponse.text().catch(() => ""));
    return null;
  }
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
  if (!token?.access_token) return null;

  const infoResponse = await fetch(env.google.userinfoUrl, { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!infoResponse.ok) {
    console.error("google: reading the identity failed:", infoResponse.status);
    return null;
  }
  const info = (await infoResponse.json().catch(() => null)) as { sub?: string; email?: string; email_verified?: boolean | string } | null;
  if (!info?.sub || !info.email) return null;

  return {
    subject: String(info.sub),
    email: String(info.email).trim().toLowerCase(),
    // Some responses carry it as the string "true".
    emailVerified: info.email_verified === true || info.email_verified === "true",
  };
}
