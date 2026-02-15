import { User, Exam, Submission } from "../models/admin.js";

export const getAdminDashboard = async (req, res) => {
  try {
    const totalExams = await Exam.countDocuments();
    const totalStudents = await User.countDocuments({ role: "student" });
    const activeSubmissions = await Submission.countDocuments({
      status: { $in: ["started", "in-progress"] },
    });
    const flaggedSubmissions = await Submission.countDocuments({
      isSuspicious: true,
    });
    const totalSubmissions = await Submission.countDocuments();
    const gradedSubmissions = await Submission.countDocuments({
      status: "graded",
    });

    const violationAgg = await Submission.aggregate([
      { $unwind: "$violations" },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    const totalViolations = violationAgg[0]?.count || 0;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentViolations = await Submission.aggregate([
      { $unwind: "$violations" },
      { $match: { "violations.timestamp": { $gte: oneDayAgo } } },
      { $sort: { "violations.timestamp": -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $lookup: {
          from: "exams",
          localField: "examId",
          foreignField: "_id",
          as: "exam",
        },
      },
      {
        $project: {
          violation: "$violations",
          studentName: { $arrayElemAt: ["$student.name", 0] },
          studentUserId: { $arrayElemAt: ["$student.userId", 0] },
          examTitle: { $arrayElemAt: ["$exam.title", 0] },
        },
      },
    ]);

    const activeExams = await Submission.aggregate([
      { $match: { status: { $in: ["started", "in-progress"] } } },
      {
        $group: {
          _id: "$examId",
          studentCount: { $sum: 1 },
          violationCount: { $sum: "$violationCount" },
        },
      },
      {
        $lookup: {
          from: "exams",
          localField: "_id",
          foreignField: "_id",
          as: "exam",
        },
      },
      {
        $project: {
          examId: "$_id",
          studentCount: 1,
          violationCount: 1,
          examTitle: { $arrayElemAt: ["$exam.title", 0] },
          examDuration: { $arrayElemAt: ["$exam.duration", 0] },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Admin dashboard data fetched",
      data: {
        stats: {
          totalExams,
          totalStudents,
          activeSubmissions,
          flaggedSubmissions,
          totalSubmissions,
          gradedSubmissions,
          totalViolations,
        },
        activeExams,
        recentViolations,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch dashboard", error: error.message });
  }
};

export const getActiveExamSessions = async (req, res) => {
  try {
    const activeExams = await Submission.aggregate([
      { $match: { status: { $in: ["started", "in-progress"] } } },
      {
        $group: {
          _id: "$examId",
          studentCount: { $sum: 1 },
          violationCount: { $sum: "$violationCount" },
        },
      },
      {
        $lookup: {
          from: "exams",
          localField: "_id",
          foreignField: "_id",
          as: "exam",
        },
      },
      {
        $project: {
          examId: "$_id",
          studentCount: 1,
          violationCount: 1,
          examTitle: { $arrayElemAt: ["$exam.title", 0] },
          examDuration: { $arrayElemAt: ["$exam.duration", 0] },
          scheduledStart: { $arrayElemAt: ["$exam.scheduledStart", 0] },
          scheduledEnd: { $arrayElemAt: ["$exam.scheduledEnd", 0] },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: activeExams,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch active exams", error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const users = await User.find(filter).select("-password");

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: users,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: error.message });
  }
};

export const suspendStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(
      studentId,
      { isSuspended: true },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({
      success: true,
      message: "Student suspended successfully",
      data: { studentId: user._id, suspended: user.isSuspended, reason },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to suspend student", error: error.message });
  }
};

export const unsuspendStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const user = await User.findByIdAndUpdate(
      studentId,
      { isSuspended: false },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({
      success: true,
      message: "Student unsuspended successfully",
      data: { studentId: user._id, suspended: user.isSuspended },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to unsuspend student", error: error.message });
  }
};
