import Exam from "../models/Exam.js";
import { Submission } from "../models/examiner.js";

export const createExam = async (req, res) => {
  try {
    const { title, description, duration, passingScore, questions, settings, scheduledStart, scheduledEnd } = req.body;
    const createdBy = req.user?.id || req.body.createdBy;

    // Validation
    if (!title || !duration || passingScore === undefined || !scheduledStart || !scheduledEnd) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    const exam = await Exam.create({
      title,
      description,
      duration,
      passingScore,
      questions: questions || [],
      createdBy,
      totalQuestions: questions?.length || 0,
      isPublished: true,
      settings: settings || {},
      scheduledStart,
      scheduledEnd,
    });

    res.status(201).json({
      success: true,
      message: "Exam created successfully",
      data: exam,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Exam creation failed", error: error.message });
  }
};

export const getExams = async (req, res) => {
  try {
    const exams = await Exam.find({
      status: "active",
      isPublished: true,
    }).select("-questions");

    res.status(200).json({
      success: true,
      message: "Exams fetched successfully",
      data: exams,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch exams", error: error.message });
  }
};

export const getExamsByCreator = async (req, res) => {
  try {
    const userId = req.user.id;
    const exams = await Exam.find({ createdBy: userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Exams fetched successfully",
      data: exams,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch your exams", error: error.message });
  }
};

export const getExaminerStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const exams = await Exam.find({ createdBy: userId }).select("_id");
        const examIds = exams.map(e => e._id);

        const totalStudents = await Submission.distinct("studentId", {
          examId: { $in: examIds },
        });

        const activeSessions = await Submission.countDocuments({
          examId: { $in: examIds },
          status: { $in: ["started", "in-progress"] },
        });

        const flaggedSubmissions = await Submission.countDocuments({
          examId: { $in: examIds },
          status: { $in: ["submitted", "auto-submitted", "graded"] },
          $or: [
            { isSuspicious: true },
            { violationCount: { $gt: 0 } },
          ],
        });

        const result = await Submission.aggregate([
          {
            $match: {
              examId: { $in: examIds },
              status: { $in: ["graded", "auto-submitted"] },
            },
          },
          { $group: { _id: null, avgScore: { $avg: "$score" } } },
        ]);

        const stats = {
          totalStudents: totalStudents.length,
          activeStudents: activeSessions,
          flaggedSubmissions,
          averageScore: result[0]?.avgScore || 0,
        };

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        res.status(500).json({ message: "Failed to fetch stats", error: error.message });
    }
};

export const getExamById = async (req, res) => {
  try {
    const { id } = req.params;

    const exam = await Exam.findById(id);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    res.status(200).json({
      success: true,
      message: "Exam fetched successfully",
      data: exam,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch exam", error: error.message });
  }
};

export const updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const exam = await Exam.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    res.status(200).json({
      success: true,
      message: "Exam updated successfully",
      data: exam,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Exam update failed", error: error.message });
  }
};

export const deleteExam = async (req, res) => {
  try {
    const { id } = req.params;

    const exam = await Exam.findByIdAndDelete(id);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    res.status(200).json({
      success: true,
      message: "Exam deleted successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Exam deletion failed", error: error.message });
  }
};
