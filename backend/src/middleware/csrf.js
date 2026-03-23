import crypto from "crypto";

/**
 * CSRF protection using double-submit cookie pattern.
 *
 * How it works:
 * 1. GET /api/auth/csrf-token sets a random CSRF token in a readable cookie
 *    AND returns it in the response body.
 * 2. The frontend stores this token and includes it in the `X-CSRF-Token`
 *    header on state-changing requests (POST, PUT, DELETE, PATCH).
 * 3. This middleware validates that the header matches the cookie.
 *
 * This only applies when cookie-based auth is used. Header-only (Bearer token)
 * auth is not vulnerable to CSRF, so those requests are allowed through.
 */

// Generate a CSRF token and set it in a readable cookie
export const generateCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie("csrf_token", token, {
    httpOnly: false, // Must be readable by frontend JS
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: "/",
  });

  res.json({ success: true, csrfToken: token });
};

// Validate CSRF token on state-changing requests
export const validateCsrf = (req, res, next) => {
  // Only validate on state-changing methods
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  if (safeMethods.has(req.method)) {
    return next();
  }

  // If the request uses Bearer token auth (no cookie), skip CSRF validation.
  // CSRF attacks can only exploit cookie-based auth, not header-based.
  const hasAuthCookie = req.cookies && req.cookies.token;
  const hasBearerToken =
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer");

  if (!hasAuthCookie && hasBearerToken) {
    return next();
  }

  // If no auth cookie, skip CSRF check (unauthenticated request)
  if (!hasAuthCookie) {
    return next();
  }

  // Validate the CSRF token
  const cookieToken = req.cookies.csrf_token;
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      message: "CSRF token missing. Fetch a new token from GET /api/auth/csrf-token",
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({
      message: "CSRF token mismatch. Fetch a new token from GET /api/auth/csrf-token",
    });
  }

  next();
};
