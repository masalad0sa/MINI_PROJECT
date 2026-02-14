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

const Submission = mongoose.model("Submission", submissionSchema);

export default Submission;


