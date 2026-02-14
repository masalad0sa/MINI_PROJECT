import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  questionText: String,
  options: [String],
  correctAnswer: Number,
  points: {
    type: Number,
    default: 1,
  },
});

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide exam title"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    duration: {
      type: Number,
      required: [true, "Please provide exam duration in minutes"],
    },
    scheduledStart: {
      type: Date,
      required: [true, "Please provide exam start date/time"],
    },
    scheduledEnd: {
      type: Date,
      required: [true, "Please provide exam end date/time"],
    },
    totalQuestions: Number,
    passingScore: {
      type: Number,
      required: [true, "Please provide passing score"],
    },
    questions: [questionSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  },
);

const Exam = mongoose.models.Exam || mongoose.model("Exam", examSchema);

export default Exam;

