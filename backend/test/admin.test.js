import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";
import { setupDB, teardownDB, clearDB } from "./setup.js";
import User from "../src/models/User.js";
import Exam from "../src/models/Exam.js";
import Submission from "../src/models/Submission.js";

beforeAll(async () => {
  await setupDB();
});

afterAll(async () => {
  await teardownDB();
});

afterEach(async () => {
  await clearDB();
});

const createUser = async ({
  name,
  email,
  userId,
  role,
  password = "password123",
}) => {
  const res = await request(app).post("/api/auth/register").send({
    name,
    email,
    password,
    userId,
    role,
  });
  return res.body;
};

describe("Admin API Endpoints", () => {
  it("should allow admin to delete a student and their submissions", async () => {
    const adminRes = await createUser({
      name: "Main Admin",
      email: "admin1@test.com",
      userId: "admin_1",
      role: "admin",
    });
    const studentRes = await createUser({
      name: "Student One",
      email: "student1@test.com",
      userId: "student_1",
      role: "student",
    });

    const exam = await Exam.create({
      title: "Sample Exam",
      duration: 30,
      scheduledStart: new Date(Date.now() - 60 * 60 * 1000),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      passingScore: 50,
      questions: [],
      totalQuestions: 0,
      createdBy: adminRes.user.id,
    });

    await Submission.create({
      studentId: studentRes.user.id,
      examId: exam._id,
      status: "submitted",
    });

    const deleteRes = await request(app)
      .delete(`/api/admin/users/${studentRes.user.id}`)
      .set("Authorization", `Bearer ${adminRes.token}`);

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const deletedUser = await User.findById(studentRes.user.id);
    expect(deletedUser).toBeNull();

    const studentSubmissions = await Submission.countDocuments({
      studentId: studentRes.user.id,
    });
    expect(studentSubmissions).toBe(0);
  });

  it("should allow admin to delete an examiner and their exams/submissions", async () => {
    const adminRes = await createUser({
      name: "Main Admin",
      email: "admin2@test.com",
      userId: "admin_2",
      role: "admin",
    });
    const examinerRes = await createUser({
      name: "Examiner One",
      email: "examiner1@test.com",
      userId: "examiner_1",
      role: "examiner",
    });
    const studentRes = await createUser({
      name: "Student Two",
      email: "student2@test.com",
      userId: "student_2",
      role: "student",
    });

    const examinerExam = await Exam.create({
      title: "Examiner Exam",
      duration: 45,
      scheduledStart: new Date(Date.now() - 60 * 60 * 1000),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      passingScore: 40,
      questions: [],
      totalQuestions: 0,
      createdBy: examinerRes.user.id,
    });

    await Submission.create({
      studentId: studentRes.user.id,
      examId: examinerExam._id,
      status: "submitted",
    });

    const deleteRes = await request(app)
      .delete(`/api/admin/users/${examinerRes.user.id}`)
      .set("Authorization", `Bearer ${adminRes.token}`);

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const deletedExaminer = await User.findById(examinerRes.user.id);
    expect(deletedExaminer).toBeNull();

    const remainingExams = await Exam.countDocuments({
      createdBy: examinerRes.user.id,
    });
    expect(remainingExams).toBe(0);

    const remainingExamSubmissions = await Submission.countDocuments({
      examId: examinerExam._id,
    });
    expect(remainingExamSubmissions).toBe(0);
  });

  it("should reject deleting admin users", async () => {
    const adminRes = await createUser({
      name: "Main Admin",
      email: "admin3@test.com",
      userId: "admin_3",
      role: "admin",
    });
    const targetAdminRes = await createUser({
      name: "Target Admin",
      email: "admin4@test.com",
      userId: "admin_4",
      role: "admin",
    });

    const deleteRes = await request(app)
      .delete(`/api/admin/users/${targetAdminRes.user.id}`)
      .set("Authorization", `Bearer ${adminRes.token}`);

    expect(deleteRes.statusCode).toBe(403);
    expect(deleteRes.body.message).toMatch(/cannot be deleted/i);

    const targetAdmin = await User.findById(targetAdminRes.user.id);
    expect(targetAdmin).not.toBeNull();
  });
});
