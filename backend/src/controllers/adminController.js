import User from "../models/User.js";
import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";

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
    const { role, status, search, page = "1", limit = "10" } = req.query;
    const filter = {};
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const parsedLimit = Math.min(
      100,
      Math.max(5, Number.parseInt(limit, 10) || 10),
    );

    if (role && role !== "all") {
      filter.role = role;
    }

    if (status === "active") {
      filter.isSuspended = false;
    } else if (status === "suspended") {
      filter.isSuspended = true;
    }

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
      const escapedSearch = normalizedSearch.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const regex = new RegExp(escapedSearch, "i");
      filter.$or = [{ name: regex }, { email: regex }, { userId: regex }];
    }

    const total = await User.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / parsedLimit));
    const currentPage = Math.min(parsedPage, totalPages);
    const skip = (currentPage - 1) * parsedLimit;

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: users,
      pagination: {
        page: currentPage,
        limit: parsedLimit,
        total,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: error.message });
  }
};

export const changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};
    const allowedRoles = new Set(["student", "examiner", "admin"]);

    if (!allowedRoles.has(role)) {
      return res.status(400).json({
        message: "Invalid role. Allowed roles: student, examiner, admin",
      });
    }

    const user = await User.findById(userId).select("_id role name");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const requesterId = req.user?._id?.toString?.() || "";
    if (requesterId && requesterId === user._id.toString() && role !== "admin") {
      return res.status(400).json({
        message: "You cannot remove your own admin role",
      });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: {
        userId: user._id,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update user role", error: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("_id role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin users cannot be deleted" });
    }

    if (user.role === "student") {
      await Submission.deleteMany({ studentId: user._id });
    }

    if (user.role === "examiner") {
      const createdExams = await Exam.find({ createdBy: user._id }).select("_id");
      const examIds = createdExams.map((exam) => exam._id);

      if (examIds.length > 0) {
        await Submission.deleteMany({ examId: { $in: examIds } });
        await Exam.deleteMany({ _id: { $in: examIds } });
      }
    }

    await User.findByIdAndDelete(user._id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: { userId: user._id, role: user.role },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
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
