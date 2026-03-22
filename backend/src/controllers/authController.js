import User from "../models/User.js";
import TokenBlacklist from "../models/TokenBlacklist.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

// ── Token helpers ──────────────────────────────────────────────

const ACCESS_TOKEN_EXPIRE = process.env.JWT_EXPIRE || "15m";
const REFRESH_TOKEN_EXPIRE = process.env.JWT_REFRESH_EXPIRE || "7d";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRE,
  });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id, type: "refresh" }, process.env.JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRE,
  });
};

const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded?.exp ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
  }
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Set JWT access token in an httpOnly cookie + return in response body.
 * Dual delivery ensures backward compatibility with header-based auth.
 */
const setTokenCookie = (res, token) => {
  const decoded = jwt.decode(token);
  const maxAge = decoded?.exp
    ? (decoded.exp * 1000) - Date.now()
    : 15 * 60 * 1000; // default 15min

  res.cookie("token", token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    maxAge: Math.max(maxAge, 1000),
    path: "/",
  });
};

const setRefreshCookie = (res, refreshToken) => {
  const decoded = jwt.decode(refreshToken);
  const maxAge = decoded?.exp
    ? (decoded.exp * 1000) - Date.now()
    : 7 * 24 * 60 * 60 * 1000; // default 7d

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    maxAge: Math.max(maxAge, 1000),
    path: "/api/auth/refresh", // Only sent to the refresh endpoint
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie("token", { path: "/" });
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  res.clearCookie("csrf_token", { path: "/" });
};

// ── Auth endpoints ─────────────────────────────────────────────

export const register = async (req, res) => {
  try {
    const { email, password, name, userId, role } = req.body;

    if (!email || !password || !name || !userId) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields (email, password, name, userId)" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    if (userId.length < 3 || userId.length > 20) {
      return res
        .status(400)
        .json({ message: "User ID must be between 3 and 20 characters" });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(userId)) {
      return res
        .status(400)
        .json({ message: "User ID can only contain letters, numbers, and underscores" });
    }

    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const userIdExists = await User.findOne({ userId });
    if (userIdExists) {
      return res.status(409).json({ message: "User ID already taken" });
    }

    const user = await User.create({ email, password, name, userId, role });

    // Generate tokens
    const token = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store hashed refresh token
    user.refreshToken = hashToken(refreshToken);
    user.refreshTokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Set cookies
    setTokenCookie(res, token);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      token, // Also in response body for backward compatibility
      user: {
        id: user._id,
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Registration failed", error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isSuspended) {
      return res
        .status(403)
        .json({ message: "Your account has been suspended" });
    }

    // Generate tokens
    const token = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store hashed refresh token
    await User.findByIdAndUpdate(user._id, {
      refreshToken: hashToken(refreshToken),
      refreshTokenExpire: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Set cookies
    setTokenCookie(res, token);
    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      success: true,
      token, // Also in response body for backward compatibility
      user: {
        id: user._id,
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        userId: req.user.userId,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch user profile", error: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.token;
    const userId = req.user._id;

    if (token) {
      const expiresAt = getTokenExpiration(token) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await TokenBlacklist.blacklist(token, userId, expiresAt);
    }

    // Clear refresh token from DB
    await User.findByIdAndUpdate(userId, {
      refreshToken: undefined,
      refreshTokenExpire: undefined,
    });

    // Clear all auth cookies
    clearAuthCookies(res);

    res.status(200).json({ success: true, message: "Logout successful" });
  } catch (error) {
    // Even if cleanup fails, clear cookies and tell client it's done
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: "Logout successful" });
  }
};

/**
 * Refresh access token using a valid refresh token.
 * Implements token rotation: issues a new refresh token and invalidates the old one.
 */
export const refreshAccessToken = async (req, res) => {
  try {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (error) {
      clearAuthCookies(res);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Refresh token expired. Please login again." });
      }
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    // Find user and verify the hashed refresh token matches
    const user = await User.findById(decoded.id).select(
      "+refreshToken +refreshTokenExpire"
    );

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isSuspended) {
      clearAuthCookies(res);
      return res.status(403).json({ message: "Account suspended" });
    }

    const hashedIncoming = hashToken(refreshToken);
    if (user.refreshToken !== hashedIncoming) {
      // Token reuse detected — potential theft. Invalidate all tokens.
      await User.findByIdAndUpdate(user._id, {
        refreshToken: undefined,
        refreshTokenExpire: undefined,
      });
      clearAuthCookies(res);
      return res.status(401).json({
        message: "Refresh token reuse detected. Please login again.",
      });
    }

    if (user.refreshTokenExpire && user.refreshTokenExpire < new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // Token rotation: generate new pair
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Store new hashed refresh token
    await User.findByIdAndUpdate(user._id, {
      refreshToken: hashToken(newRefreshToken),
      refreshTokenExpire: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Set cookies
    setTokenCookie(res, newAccessToken);
    setRefreshCookie(res, newRefreshToken);

    res.status(200).json({
      success: true,
      token: newAccessToken,
      user: {
        id: user._id,
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Token refresh failed", error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Please provide email" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || "noreply@smartproctor.com",
          to: user.email,
          subject: "Password Reset Request - SmartProctor",
          html: `
            <h1>Password Reset Request</h1>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `,
        });
      } catch (emailError) {
        console.error("Email send failed:", emailError.message);
      }
    } else {
      console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
    }

    res.status(200).json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Password reset failed", error: error.message });
  }
};

export const confirmResetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ message: "Please provide token and new password" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now login with your new password.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Password reset failed", error: error.message });
  }
};
