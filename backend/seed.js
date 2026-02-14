import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./src/models/User.js";
import Exam from "./src/models/Exam.js";

dotenv.config();

const MONGO =
  process.env.MONGODB_URI || "mongodb://localhost:27017/exam-proctoring";

async function seed() {
  try {
    await mongoose.connect(MONGO);
    console.log("Connected to MongoDB");

    // Clear collections (safe for local development)
    await User.deleteMany({});
    await Exam.deleteMany({});

    // Create admin
    const admin = await User.create({
      name: "Admin User",
      userId: "admin_user",
      email: "admin@example.com",
      password: "password123",
      role: "admin",
    });

    // Create student
    const student = await User.create({
      name: "Test Student",
      userId: "test_student",
      email: "student@example.com",
      password: "password123",
      role: "student",
    });

    // Create examiner
    const examiner = await User.create({
      name: "Test Examiner",
      userId: "test_examiner",
      email: "examiner@example.com",
      password: "password123",
      role: "examiner",
    });

    // Create sample exam
    const exam = await Exam.create({
      title: "Sample Math Test",
      description: "Basic arithmetic",
      duration: 30,
      passingScore: 50,
      questions: [
        {
          questionText: "2+2",
          options: ["1", "2", "3", "4"],
          correctAnswer: 3,
        },
        {
          questionText: "5-3",
          options: ["1", "2", "3", "4"],
          correctAnswer: 1,
        },
      ],
      totalQuestions: 2,
      createdBy: admin._id,
      isPublished: true,
    });

    console.log("Seed data created:");
    console.log({
      admin: admin.email,
      examiner: examiner.email,
      student: student.email,
      exam: exam.title,
    });
    await mongoose.disconnect();
    console.log("Disconnected");
    process.exit(0);
  } catch (err) {
    console.error("Seed error", err);
    process.exit(1);
  }
}

seed();
