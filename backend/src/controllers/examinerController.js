import { Exam, Submission } from "../models/examiner.js";

const SEVERITY_WEIGHTS = {
  CRITICAL: 25,
  MEDIUM: 10,
  MINOR: 5,
};

const clampRisk = (value) => Math.max(0, Math.min(100, value));

const getRiskLevel = (score) => {
  if (score >= 60) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
};

const calculateRiskScore = (submission) => {
  const violationRisk = (submission.violations || []).reduce((acc, violation) => {
    return acc + (SEVERITY_WEIGHTS[violation.severity?.toUpperCase()] || 0);
  }, 0);

  const suspiciousBonus = submission.isSuspicious ? 20 : 0;
  const autoSubmittedBonus = submission.autoSubmitted ? 25 : 0;
  const warningBonus = Math.min((submission.violationCount || 0) * 3, 15);

  return clampRisk(violationRisk + suspiciousBonus + autoSubmittedBonus + warningBonus);
};

const latestViolationTimestamp = (submission) => {
  if (!submission.violations?.length) return null;
  const latest = submission.violations.reduce((acc, current) => {
    const currentTs = new Date(current.timestamp).getTime();
    return currentTs > acc ? currentTs : acc;
  }, 0);
  return latest ? new Date(latest) : null;
};

const getOnlineStatus = (lastHeartbeatAt) => {
  if (!lastHeartbeatAt) return "OFFLINE";
  const ageMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (ageMs <= 20_000) return "ONLINE";
  if (ageMs <= 45_000) return "UNSTABLE";
  return "OFFLINE";
};

const ensureExamAccess = async (examId, user) => {
  const exam = await Exam.findById(examId).select(
    "title duration scheduledStart scheduledEnd passingScore createdBy",
  );
  if (!exam) return { exam: null, allowed: false, reason: "Exam not found" };

  if (user.role === "admin") return { exam, allowed: true };
  if (user.role === "examiner" && exam.createdBy?.toString() === user.id) {
    return { exam, allowed: true };
  }

  return { exam, allowed: false, reason: "Access denied for this exam" };
};

export const monitorExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const access = await ensureExamAccess(examId, req.user);
    if (!access.allowed) {
      const statusCode = access.reason === "Exam not found" ? 404 : 403;
      return res.status(statusCode).json({ message: access.reason });
    }
    const exam = access.exam;
    const activeStatuses = ["started", "in-progress"];

    const submissions = await Submission.find({
      examId,
      status: { $in: activeStatuses },
    })
      .populate("studentId", "name email userId")
      .sort({ startedAt: -1 });

    const students = submissions.map((sub) => {
      const riskScore = calculateRiskScore(sub);
      const lastAlertAt = latestViolationTimestamp(sub);

      return {
        submissionId: sub._id,
        studentId: sub.studentId?._id,
        studentName: sub.studentId?.name || "Unknown",
        studentEmail: sub.studentId?.email || "",
        studentUserId: sub.studentId?.userId || "",
        status: sub.status,
        controlState: sub.controlState || "ACTIVE",
        progress: sub.totalQuestions
          ? Math.round((sub.answers.length / sub.totalQuestions) * 100)
          : 0,
        warningCount: sub.violationCount || 0,
        isSuspicious: sub.isSuspicious,
        autoSubmitted: sub.autoSubmitted,
        violations: sub.violations || [],
        riskScore,
        riskLevel: getRiskLevel(riskScore),
        lastAlertAt,
        lastSeenAt: sub.lastHeartbeatAt || null,
        onlineStatus: getOnlineStatus(sub.lastHeartbeatAt),
        evidenceCount: (sub.violations || []).filter((v) => !!v.evidence).length,
        examinerActions: sub.examinerActions || [],
        startedAt: sub.startedAt,
        submittedAt: sub.submittedAt,
        score: sub.score,
      };
    });

    students.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      const aTs = a.lastAlertAt ? new Date(a.lastAlertAt).getTime() : 0;
      const bTs = b.lastAlertAt ? new Date(b.lastAlertAt).getTime() : 0;
      return bTs - aTs;
    });

    const allViolations = [];
    submissions.forEach((sub) => {
      (sub.violations || []).forEach((violation) => {
        allViolations.push({
          studentName: sub.studentId?.name || "Unknown",
          studentUserId: sub.studentId?.userId || "",
          type: violation.type,
          severity: violation.severity,
          description: violation.description,
          evidence: violation.evidence || null,
          timestamp: violation.timestamp,
        });
      });
    });
    allViolations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({
      success: true,
      data: {
        exam: {
          id: exam._id,
          title: exam.title,
          duration: exam.duration,
          scheduledStart: exam.scheduledStart,
          scheduledEnd: exam.scheduledEnd,
        },
        students,
        riskQueue: students.map((student, idx) => ({
          rank: idx + 1,
          submissionId: student.submissionId,
          studentName: student.studentName,
          studentUserId: student.studentUserId,
          riskScore: student.riskScore,
          riskLevel: student.riskLevel,
          warningCount: student.warningCount,
          onlineStatus: student.onlineStatus,
          controlState: student.controlState,
          lastAlertAt: student.lastAlertAt,
          lastSeenAt: student.lastSeenAt,
        })),
        violations: allViolations.slice(0, 50),
        summary: {
          total: students.length,
          active: students.length,
          flagged: students.filter((s) => s.isSuspicious).length,
          online: students.filter((s) => s.onlineStatus === "ONLINE").length,
          unstable: students.filter((s) => s.onlineStatus === "UNSTABLE").length,
          offline: students.filter((s) => s.onlineStatus === "OFFLINE").length,
          paused: students.filter((s) => s.controlState === "PAUSED").length,
          highRisk: students.filter((s) => s.riskLevel === "HIGH").length,
          mediumRisk: students.filter((s) => s.riskLevel === "MEDIUM").length,
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch monitoring data", error: error.message });
  }
};

export const getIntegrityReport = async (req, res) => {
  try {
    const { examId } = req.params;
    const access = await ensureExamAccess(examId, req.user);
    if (!access.allowed) {
      const statusCode = access.reason === "Exam not found" ? 404 : 403;
      return res.status(statusCode).json({ message: access.reason });
    }
    const exam = access.exam;

    const submissions = await Submission.find({ examId })
      .populate("studentId", "name email userId")
      .sort({ submittedAt: -1 });

    const reports = submissions.map((sub) => {
      const violationsByType = {};
      (sub.violations || []).forEach((violation) => {
        violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
      });

      let suspicionScore = 0;
      (sub.violations || []).forEach((violation) => {
        if (violation.severity === "CRITICAL") suspicionScore += 25;
        else if (violation.severity === "MEDIUM") suspicionScore += 10;
        else suspicionScore += 5;
      });
      suspicionScore = Math.min(suspicionScore, 100);

      return {
        submissionId: sub._id,
        studentId: sub.studentId?._id,
        studentName: sub.studentId?.name || "Unknown",
        studentEmail: sub.studentId?.email || "",
        studentUserId: sub.studentId?.userId || "",
        score: sub.score,
        totalQuestions: sub.totalQuestions,
        correctAnswers: sub.correctAnswers,
        status: sub.status,
        isSuspicious: sub.isSuspicious,
        autoSubmitted: sub.autoSubmitted,
        violationCount: sub.violationCount || 0,
        violations: sub.violations || [],
        violationsByType,
        suspicionScore,
        examinerActions: sub.examinerActions || [],
        startedAt: sub.startedAt,
        submittedAt: sub.submittedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        exam: {
          id: exam._id,
          title: exam.title,
          duration: exam.duration,
          scheduledStart: exam.scheduledStart,
          scheduledEnd: exam.scheduledEnd,
          passingScore: exam.passingScore,
        },
        reports,
        summary: {
          totalStudents: reports.length,
          flagged: reports.filter((report) => report.isSuspicious).length,
          avgScore:
            reports.length > 0
              ? Math.round(
                  reports.reduce((sum, report) => sum + (report.score || 0), 0) /
                    reports.length,
                )
              : 0,
          totalViolations: reports.reduce(
            (sum, report) => sum + report.violationCount,
            0,
          ),
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to generate report", error: error.message });
  }
};

export const getSubmissionReport = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate("studentId", "name email userId")
      .populate("examId", "title duration passingScore questions createdBy");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (
      req.user.role === "examiner" &&
      submission.examId?.createdBy?.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Access denied for this submission" });
    }

    const violationsByType = {};
    (submission.violations || []).forEach((violation) => {
      violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
    });

    let suspicionScore = 0;
    (submission.violations || []).forEach((violation) => {
      if (violation.severity === "CRITICAL") suspicionScore += 25;
      else if (violation.severity === "MEDIUM") suspicionScore += 10;
      else suspicionScore += 5;
    });
    suspicionScore = Math.min(suspicionScore, 100);

    res.status(200).json({
      success: true,
      data: {
        student: {
          id: submission.studentId?._id,
          name: submission.studentId?.name,
          email: submission.studentId?.email,
          userId: submission.studentId?.userId,
        },
        exam: {
          id: submission.examId?._id,
          title: submission.examId?.title,
          duration: submission.examId?.duration,
          passingScore: submission.examId?.passingScore,
        },
        score: submission.score,
        totalQuestions: submission.totalQuestions,
        correctAnswers: submission.correctAnswers,
        status: submission.status,
        controlState: submission.controlState || "ACTIVE",
        isSuspicious: submission.isSuspicious,
        autoSubmitted: submission.autoSubmitted,
        violations: submission.violations,
        violationCount: submission.violationCount,
        violationsByType,
        suspicionScore,
        examinerActions: submission.examinerActions || [],
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        pauseStartedAt: submission.pauseStartedAt || null,
        totalPausedMs: submission.totalPausedMs || 0,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch submission report", error: error.message });
  }
};

export const takeSubmissionAction = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { actionType, note } = req.body;

    const allowedActions = new Set([
      "WARN",
      "CHAT",
      "PAUSE",
      "RESUME",
      "TERMINATE",
      "MARK_FALSE_POSITIVE",
    ]);

    if (!actionType || !allowedActions.has(actionType)) {
      return res.status(400).json({ message: "Invalid action type" });
    }

    const normalizedNote = typeof note === "string" ? note.trim() : "";

    const submission = await Submission.findById(submissionId).populate(
      "examId",
      "createdBy",
    );
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (
      req.user.role === "examiner" &&
      submission.examId?.createdBy?.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Access denied for this submission" });
    }

    const activeStatuses = new Set(["started", "in-progress"]);
    const isActiveSession = activeStatuses.has(submission.status);
    if (actionType === "TERMINATE" && !normalizedNote) {
      return res
        .status(400)
        .json({ message: "A termination reason is required in note" });
    }

    if (actionType === "PAUSE") {
      if (!isActiveSession) {
        return res
          .status(409)
          .json({ message: "Only active sessions can be paused" });
      }
      if (submission.controlState === "PAUSED") {
        return res.status(409).json({ message: "Session is already paused" });
      }
      if (submission.controlState === "TERMINATED") {
        return res.status(409).json({ message: "Session is already terminated" });
      }
    }

    if (actionType === "RESUME") {
      if (!isActiveSession) {
        return res
          .status(409)
          .json({ message: "Only active sessions can be resumed" });
      }
      if (submission.controlState !== "PAUSED") {
        return res.status(409).json({ message: "Session is not paused" });
      }
    }

    if (actionType === "TERMINATE" && submission.controlState === "TERMINATED") {
      return res.status(409).json({ message: "Session is already terminated" });
    }

    if (!submission.examinerActions) submission.examinerActions = [];

    const previousControlState = submission.controlState || "ACTIVE";
    let nextControlState = previousControlState;
    const now = new Date();

    switch (actionType) {
      case "PAUSE":
        nextControlState = "PAUSED";
        submission.controlState = "PAUSED";
        submission.pauseStartedAt = now;
        break;
      case "RESUME":
        nextControlState = "ACTIVE";
        if (submission.pauseStartedAt) {
          const pausedFor = now.getTime() - new Date(submission.pauseStartedAt).getTime();
          submission.totalPausedMs = Math.max(
            0,
            (submission.totalPausedMs || 0) + pausedFor,
          );
        }
        submission.pauseStartedAt = null;
        submission.controlState = "ACTIVE";
        break;
      case "TERMINATE":
        nextControlState = "TERMINATED";
        if (submission.pauseStartedAt) {
          const pausedFor = now.getTime() - new Date(submission.pauseStartedAt).getTime();
          submission.totalPausedMs = Math.max(
            0,
            (submission.totalPausedMs || 0) + pausedFor,
          );
          submission.pauseStartedAt = null;
        }
        submission.controlState = "TERMINATED";
        submission.status = "auto-submitted";
        submission.autoSubmitted = true;
        submission.submittedAt = submission.submittedAt || now;
        break;
      case "MARK_FALSE_POSITIVE":
        submission.isSuspicious = false;
        break;
      default:
        break;
    }

    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    submission.examinerActions.push({
      actionId,
      actionType,
      actorId: req.user._id,
      actorName: req.user.name,
      note: normalizedNote,
      previousControlState,
      newControlState: nextControlState,
      timestamp: now,
    });
    submission.lastInterventionAt = now;

    await submission.save();

    res.status(200).json({
      success: true,
      message: "Action recorded",
      data: {
        submissionId: submission._id,
        actionId,
        status: submission.status,
        controlState: submission.controlState || "ACTIVE",
        pauseStartedAt: submission.pauseStartedAt || null,
        totalPausedMs: submission.totalPausedMs || 0,
        autoSubmitted: submission.autoSubmitted,
        isSuspicious: submission.isSuspicious,
        lastInterventionAt: submission.lastInterventionAt,
        latestAction:
          submission.examinerActions[submission.examinerActions.length - 1],
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to apply action", error: error.message });
  }
};
