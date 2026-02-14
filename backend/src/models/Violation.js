import mongoose from "mongoose";

const violationSchema = new mongoose.Schema(
  {
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },
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
    type: {
      type: String,
      enum: [
        "TAB_SWITCH",
        "FULLSCREEN_EXIT",
        "COPY_PASTE",
        "RIGHT_CLICK",
        "DEV_TOOLS",
        "KEYBOARD_SHORTCUT",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["MINOR", "MEDIUM", "CRITICAL"],
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Index for efficient querying
violationSchema.index({ submissionId: 1, createdAt: -1 });

const Violation = mongoose.model("Violation", violationSchema);

export default Violation;
