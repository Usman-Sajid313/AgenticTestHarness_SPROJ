const AUTH_COOKIE_NAME = "__auth";

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto
      .split(",")
      .some((part) => part.trim().toLowerCase() === "https");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).protocol === "https:";
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).protocol === "https:";
    } catch {
      return false;
    }
  }

  return false;
}

export function authCookieName() {
  return AUTH_COOKIE_NAME;
}

export function authCookieOptions(
  req: Request,
  maxAge: number
): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  const secureOverride = parseBooleanEnv(process.env.AUTH_COOKIE_SECURE);
  const secure = secureOverride ?? isHttpsRequest(req);

  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  };
}
