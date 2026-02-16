import User from "../models/User.js";
import TokenBlacklist from "../models/TokenBlacklist.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// Decode token to get expiration
const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded?.exp ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
  }
};

export const register = async (req, res) => {
  try {
    const { email, password, name, userId } = req.body;
    // SECURITY FIX: Ignore role from request body - always create as student
    const role = "student";

    // Validation
    if (!email || !password || !name || !userId) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields (email, password, name, userId)" });
    }

    // Password strength validation
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // UserId validation
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

    // Check if email exists
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Check if userId exists
    const userIdExists = await User.findOne({ userId });
    if (userIdExists) {
      return res.status(409).json({ message: "User ID already taken" });
    }

    // Create user (always as student)
    const user = await User.create({ email, password, name, userId, role });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
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

    // Validation
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    // Find user and select password
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      return res
        .status(403)
        .json({ message: "Your account has been suspended" });
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
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
      // Get token expiration
      const expiresAt = getTokenExpiration(token) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Add token to blacklist
      await TokenBlacklist.blacklist(token, userId, expiresAt);
    }

    res.status(200).json({ success: true, message: "Logout successful" });
  } catch (error) {
    // Even if blacklisting fails, client should clear token
    res.status(200).json({ success: true, message: "Logout successful" });
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
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Save reset token to user (expires in 1 hour)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    // Send email (if SMTP is configured)
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
        // Continue anyway - don't expose email config issues
      }
    } else {
      // Log reset token for development (remove in production)
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

// Verify reset token and set new password
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

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    // Set new password
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

