import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

/**
 * Set up Socket.IO on an existing HTTP server.
 *
 * Namespaces / rooms:
 *   /monitor  – examiner / admin live-monitoring dashboards
 *   /exam     – active student exam sessions
 *
 * Room convention:
 *   exam:<examId>  – everyone interested in updates for that exam
 *
 * Authentication:
 *   Both namespaces require a valid JWT in the handshake `auth.token`.
 */
export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // ─── Auth middleware (shared) ─────────────────────────────────
  const authenticateSocket = async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("User not found"));
      if (user.isSuspended) return next(new Error("Account suspended"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  };

  // ─── /monitor namespace (examiner / admin) ───────────────────
  const monitorNs = io.of("/monitor");
  monitorNs.use(authenticateSocket);

  monitorNs.on("connection", (socket) => {
    const { user } = socket;
    if (!["examiner", "admin"].includes(user.role)) {
      socket.disconnect(true);
      return;
    }

    console.log(`[socket /monitor] ${user.name} connected`);

    // Examiner joins a specific exam's monitor room
    socket.on("join:exam", (examId) => {
      socket.join(`exam:${examId}`);
      console.log(`[socket /monitor] ${user.name} watching exam ${examId}`);
    });

    socket.on("leave:exam", (examId) => {
      socket.leave(`exam:${examId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[socket /monitor] ${user.name} disconnected`);
    });
  });

  // ─── /exam namespace (students) ──────────────────────────────
  const examNs = io.of("/exam");
  examNs.use(authenticateSocket);

  examNs.on("connection", (socket) => {
    const { user } = socket;
    console.log(`[socket /exam] ${user.name} connected`);

    // Student joins their exam-specific room
    socket.on("join:exam", (examId) => {
      socket.join(`exam:${examId}`);
      // Also join a personal room for targeted messages
      socket.join(`student:${user._id.toString()}`);
      console.log(`[socket /exam] ${user.name} joined exam ${examId}`);

      // Notify the monitor namespace that a student joined
      monitorNs.to(`exam:${examId}`).emit("student:joined", {
        studentId: user._id,
        studentName: user.name,
        examId,
        timestamp: Date.now(),
      });
    });

    socket.on("leave:exam", (examId) => {
      socket.leave(`exam:${examId}`);
      socket.leave(`student:${user._id.toString()}`);
    });

    socket.on("disconnect", () => {
      console.log(`[socket /exam] ${user.name} disconnected`);
    });
  });

  // Attach namespaces to io for easy access from controllers
  io.monitorNs = monitorNs;
  io.examNs = examNs;

  return io;
}
