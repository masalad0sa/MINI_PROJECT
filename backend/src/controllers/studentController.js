import Submission from "../models/Submission.js";
import Exam from "../models/Exam.js";
// Note: User import removed - was unused

export const getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.params.id || req.user?.id;

    // Fetch all exams
    const exams = await Exam.find({
      status: "active",
      isPublished: true,
    }).select("-questions");

    // Fetch student submissions
    const submissions = await Submission.find({ studentId }).populate(
      "examId",
      "title",
    );

    // Calculate stats
    const completedCount = submissions.filter(
      (s) => s.status === "graded",
    ).length;
    const averageScore =
      completedCount > 0
        ? submissions
            .filter((s) => s.status === "graded")
            .reduce((acc, s) => acc + (s.score || 0), 0) / completedCount
        : 0;

    res.status(200).json({
      success: true,
      message: "Dashboard data fetched",
      data: {
        studentId,
        upcomingExams: exams,
        completedExams: submissions.filter((s) => s.status === "graded"),
        stats: {
          completed: completedCount,
          averageScore: Math.round(averageScore),
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch dashboard", error: error.message });
  }
};

export const startExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user?.id || req.body.studentId;

    // Get exam
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    // Check for existing active submission - return it instead of error
    const existingSubmission = await Submission.findOne({
      examId,
      studentId,
      status: { $in: ["started", "in-progress"] },
    });
    
    if (existingSubmission) {
      // Return existing session so exam can be resumed
      return res.status(200).json({
        success: true,
        message: "Resuming existing exam session",
        data: {
          sessionId: existingSubmission._id,
          exam: {
            id: exam._id,
            title: exam.title,
            duration: exam.duration,
            totalQuestions: exam.totalQuestions,
            questions: exam.questions,
          },
        },
      });
    }

    // Create new submission
    const submission = await Submission.create({
      examId,
      studentId,
      totalQuestions: exam.totalQuestions,
      status: "started",
    });

    res.status(200).json({
      success: true,
      message: "Exam started",
      data: {
        sessionId: submission._id,
        exam: {
          id: exam._id,
          title: exam.title,
          duration: exam.duration,
          totalQuestions: exam.totalQuestions,
          questions: exam.questions,
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to start exam", error: error.message });
  }
};

export const submitExam = async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    const studentId = req.user?.id || req.body.studentId;

    // Get submission
    const submission = await Submission.findById(sessionId).populate("examId");
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Grade exam
    let correctAnswers = 0;
    const gradedAnswers = answers.map((answer, index) => {
      const question = submission.examId.questions[answer.questionIndex];
      const isCorrect = question?.correctAnswer === answer.selectedAnswer;
      if (isCorrect) correctAnswers++;
      return {
        questionIndex: answer.questionIndex,
        selectedAnswer: answer.selectedAnswer,
        isCorrect,
      };
    });

    // Calculate score
    const score = answers.length > 0 ? (correctAnswers / answers.length) * 100 : 0;
    const passed = score >= submission.examId.passingScore;

    // Update submission
    submission.answers = gradedAnswers;
    submission.correctAnswers = correctAnswers;
    submission.score = Math.round(score);
    submission.status = submission.autoSubmitted ? "auto-submitted" : "graded";
    submission.submittedAt = new Date();
    submission.duration = Math.round(
      (Date.now() - submission.startedAt) / 1000,
    );

    await submission.save();

    res.status(200).json({
      success: true,
      message: "Exam submitted successfully",
      data: {
        score: submission.score,
        totalQuestions: answers.length,
        correctAnswers,
        correctCount: correctAnswers,
        wrongCount: answers.length - correctAnswers,
        passed,
        passingScore: submission.examId.passingScore,
        status: submission.status,
        autoSubmitted: submission.autoSubmitted || false,
        isSuspicious: submission.isSuspicious || false,
        violationCount: submission.violationCount || 0,
        violations: submission.violations || [],
        duration: submission.duration,
        submittedAt: submission.submittedAt,
        examTitle: submission.examId.title,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Exam submission failed", error: error.message });
  }
};

export const getExamResults = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user?.id || req.body.studentId;

    const submission = await Submission.findOne({ examId, studentId }).populate(
      "examId",
      "title passingScore",
    );
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.status(200).json({
      success: true,
      message: "Results fetched",
      data: {
        examId,
        examTitle: submission.examId.title,
        score: submission.score,
        totalQuestions: submission.totalQuestions,
        correctAnswers: submission.correctAnswers,
        passed: submission.score >= submission.examId.passingScore,
        status: submission.status,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch results", error: error.message });
  }
};

// Log a security violation during exam
export const logViolation = async (req, res) => {
  try {
    const { sessionId, type, severity, description } = req.body;
    const studentId = req.user?.id;

    // Find the submission
    const submission = await Submission.findById(sessionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Verify the student owns this submission
    if (submission.studentId.toString() !== studentId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Add violation to submission
    submission.violations.push({
      type,
      severity,
      description: description || `${type} violation detected`,
      timestamp: new Date(),
    });
    submission.violationCount = submission.violations.length;

    // Mark as suspicious if violations >= 2
    if (submission.violationCount >= 2) {
      submission.isSuspicious = true;
    }

    await submission.save();

    // Check if auto-submit threshold reached
    const shouldAutoSubmit = submission.violationCount >= 3;

    res.status(200).json({
      success: true,
      message: "Violation logged",
      data: {
        violationCount: submission.violationCount,
        isSuspicious: submission.isSuspicious,
        shouldAutoSubmit,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to log violation", error: error.message });
  }
};

