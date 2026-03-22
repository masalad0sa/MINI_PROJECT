import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { setupSocket } from "./socket.js";
import authRoutes from "./routes/auth.js";
import studentRoutes from "./routes/student.js";
import examRoutes from "./routes/exam.js";
import adminRoutes from "./routes/admin.js";
import examinerRoutes from "./routes/examiner.js";
import proctoringRoutes from "./routes/proctoring.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Connection
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/exam-proctoring",
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

// Security middleware
app.use(helmet());

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per 15-min window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skip: () => process.env.NODE_ENV === "test",
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // limit each IP to 15 auth requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again after a minute." },
  skip: () => process.env.NODE_ENV === "test",
});

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/student", studentRoutes);

app.use("/api/exam", examRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/examiner", examinerRoutes);
app.use("/api/proctoring", proctoringRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Create HTTP server and attach Socket.IO
const httpServer = createServer(app);
const io = setupSocket(httpServer);
app.set("io", io);

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export { app, httpServer };

