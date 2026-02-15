
import mongoose from "mongoose";
import Exam from "./models/Exam.js";
import User from "./models/User.js"; // Import User model
import dotenv from "dotenv";

dotenv.config();

const questions = [
  {
    questionText: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correctAnswer: 1,
    points: 1,
  },
  {
    questionText: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctAnswer: 2,
    points: 1,
  },
];

const seedExams = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/exam-proctoring");
    console.log("Connected to MongoDB");

    // Get a user to be the creator
    const creator = await User.findOne();
    if (!creator) {
      console.error("No user found to assign exams to. Please create a user first.");
      process.exit(1);
    }
    console.log(`Assigning exams to user: ${creator.name} (${creator._id})`);

    const now = new Date();

    // 1. Available Exam
    const availableExam = {
      title: "Test Exam: Available Now",
      description: "This exam should appear in the 'Available Now' tab.",
      duration: 30,
      scheduledStart: new Date(now.getTime() - 1 * 60 * 60 * 1000), // Started 1 hour ago
      scheduledEnd: new Date(now.getTime() + 2 * 60 * 60 * 1000),   // Ends in 2 hours
      passingScore: 50,
      totalQuestions: 2,
      questions: questions,
      createdBy: creator._id,
      status: "active",
      isPublished: true,
    };

    // 2. Upcoming Exam
    const upcomingExam = {
      title: "Test Exam: Upcoming",
      description: "This exam should appear in the 'Upcoming' tab.",
      duration: 45,
      scheduledStart: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Starts in 24 hours
      scheduledEnd: new Date(now.getTime() + 26 * 60 * 60 * 1000),   // Ends in 26 hours
      passingScore: 60,
      totalQuestions: 2,
      questions: questions,
      createdBy: creator._id,
      status: "active",
      isPublished: true,
    };

    // 3. Expired Exam
    const expiredExam = {
      title: "Test Exam: Expired",
      description: "This exam should appear in the 'Expired' tab.",
      duration: 15,
      scheduledStart: new Date(now.getTime() - 5 * 60 * 60 * 1000), // Started 5 hours ago
      scheduledEnd: new Date(now.getTime() - 3 * 60 * 60 * 1000),   // Ended 3 hours ago
      passingScore: 40,
      totalQuestions: 2,
      questions: questions,
      createdBy: creator._id,
      status: "active",
      isPublished: true,
    };

    await Exam.create([availableExam, upcomingExam, expiredExam]);
    console.log("Test exams created successfully!");

  } catch (error) {
    console.error("Error seeding exams:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

seedExams();
