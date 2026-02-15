import mongoose from "mongoose";

const violationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "TAB_SWITCH",
      "FULLSCREEN_EXIT",
      "COPY_PASTE",
      "RIGHT_CLICK",
      "DEV_TOOLS",
      "KEYBOARD_SHORTCUT",
      "AI_FLAG",
      "MULTIPLE_FACES",
      "PROHIBITED_OBJECT",
      "HIGH_SUSPICION"
    ],
    required: true,
  },
  severity: {
    type: String,
    enum: ["MINOR", "MEDIUM", "CRITICAL"],
    required: true,
  },
  description: String,
  evidence: String, // Base64 image or text evidence
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const answerSchema = new mongoose.Schema({
  questionIndex: Number,
  selectedAnswer: Number,
  isCorrect: Boolean,
});

const examinerActionSchema = new mongoose.Schema({
  actionId: {
    type: String,
    required: true,
  },
  actionType: {
    type: String,
    enum: [
      "WARN",
      "CHAT",
      "PAUSE",
      "RESUME",
      "TERMINATE",
      "MARK_FALSE_POSITIVE",
      "ESCALATE",
      "RESOLVE",
    ],
    required: true,
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  actorName: {
    type: String,
    required: true,
  },
  note: {
    type: String,
    default: "",
  },
  previousControlState: {
    type: String,
    enum: ["ACTIVE", "PAUSED", "TERMINATED"],
    default: "ACTIVE",
  },
  newControlState: {
    type: String,
    enum: ["ACTIVE", "PAUSED", "TERMINATED"],
    default: "ACTIVE",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const submissionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    answers: [answerSchema],
    score: Number,
    totalQuestions: Number,
    correctAnswers: Number,
    isPass: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["started", "in-progress", "submitted", "graded", "auto-submitted"],
      default: "started",
    },
    violations: [violationSchema],
    violationCount: {
      type: Number,
      default: 0,
    },
    isSuspicious: {
      type: Boolean,
      default: false,
    },
    autoSubmitted: {
      type: Boolean,
      default: false,
    },
    controlState: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "TERMINATED"],
      default: "ACTIVE",
    },
    pauseStartedAt: Date,
    totalPausedMs: {
      type: Number,
      default: 0,
    },
    lastHeartbeatAt: Date,
    reviewStatus: {
      type: String,
      enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "ESCALATED"],
      default: "OPEN",
    },
    examinerActions: [examinerActionSchema],
    lastInterventionAt: Date,
    startedAt: {
      type: Date,
      default: Date.now,
    },
    submittedAt: Date,
    duration: Number,
  },
  {
    timestamps: true,
  },
);

submissionSchema.index({ examId: 1, status: 1, updatedAt: -1 });
submissionSchema.index({ examId: 1, studentId: 1 });

const Submission = mongoose.model("Submission", submissionSchema);

export default Submission;


