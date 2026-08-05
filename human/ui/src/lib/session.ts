import type { SessionOptions } from "iron-session";

export type SessionData = {
  participantId?: string;
  email?: string;
  name?: string;
  isAdmin?: boolean;
};

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 32 characters"
    );
  }
  return {
    password,
    cookieName: "gdpval_eval_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}
