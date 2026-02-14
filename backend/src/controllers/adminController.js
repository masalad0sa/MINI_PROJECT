import User from '../models/User.js';
import Exam from '../models/Exam.js';
import Submission from '../models/Submission.js';

export const getAdminDashboard = async (req, res) => {
  try {
    const totalExams = await Exam.countDocuments();
    const totalStudents = await User.countDocuments({ role: 'student' });
    const activeSubmissions = await Submission.countDocuments({ status: { $in: ['started', 'in-progress'] } });
    const flaggedSubmissions = await Submission.countDocuments({ isSuspicious: true });
    const totalSubmissions = await Submission.countDocuments();
    const gradedSubmissions = await Submission.countDocuments({ status: 'graded' });

    // Total violations across all submissions
    const violationAgg = await Submission.aggregate([
      { $unwind: '$violations' },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const totalViolations = violationAgg[0]?.count || 0;

    // Recent violations (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentViolations = await Submission.aggregate([
      { $unwind: '$violations' },
      { $match: { 'violations.timestamp': { $gte: oneDayAgo } } },
      { $sort: { 'violations.timestamp': -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'users',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student'
        }
      },
      {
        $lookup: {
          from: 'exams',
          localField: 'examId',
          foreignField: '_id',
          as: 'exam'
        }
      },
      {
        $project: {
          violation: '$violations',
          studentName: { $arrayElemAt: ['$student.name', 0] },
          studentUserId: { $arrayElemAt: ['$student.userId', 0] },
          examTitle: { $arrayElemAt: ['$exam.title', 0] },
        }
      }
    ]);

    // Active exams (exams with started submissions)
    const activeExams = await Submission.aggregate([
      { $match: { status: { $in: ['started', 'in-progress'] } } },
      { $group: { _id: '$examId', studentCount: { $sum: 1 }, violationCount: { $sum: '$violationCount' } } },
      {
        $lookup: {
          from: 'exams',
          localField: '_id',
          foreignField: '_id',
          as: 'exam'
        }
      },
      {
        $project: {
          examId: '$_id',
          studentCount: 1,
          violationCount: 1,
          examTitle: { $arrayElemAt: ['$exam.title', 0] },
          examDuration: { $arrayElemAt: ['$exam.duration', 0] },
        }
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Admin dashboard data fetched',
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
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard', error: error.message });
  }
};

export const getActiveExamSessions = async (req, res) => {
  try {
    const activeExams = await Submission.aggregate([
      { $match: { status: { $in: ['started', 'in-progress'] } } },
      { $group: { _id: '$examId', studentCount: { $sum: 1 }, violationCount: { $sum: '$violationCount' } } },
      {
        $lookup: {
          from: 'exams',
          localField: '_id',
          foreignField: '_id',
          as: 'exam'
        }
      },
      {
        $project: {
          examId: '$_id',
          studentCount: 1,
          violationCount: 1,
          examTitle: { $arrayElemAt: ['$exam.title', 0] },
          examDuration: { $arrayElemAt: ['$exam.duration', 0] },
          scheduledStart: { $arrayElemAt: ['$exam.scheduledStart', 0] },
          scheduledEnd: { $arrayElemAt: ['$exam.scheduledEnd', 0] },
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: activeExams,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch active exams', error: error.message });
  }
};

export const monitorExam = async (req, res) => {
  try {
    const { examId } = req.params;

    // Get exam info
    const exam = await Exam.findById(examId).select('title duration scheduledStart scheduledEnd');
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Get all submissions for this exam with student info
    const submissions = await Submission.find({ examId })
      .populate('studentId', 'name email userId')
      .sort({ startedAt: -1 });

    const students = submissions.map(sub => ({
      submissionId: sub._id,
      studentId: sub.studentId?._id,
      studentName: sub.studentId?.name || 'Unknown',
      studentEmail: sub.studentId?.email || '',
      studentUserId: sub.studentId?.userId || '',
      status: sub.status,
      progress: sub.totalQuestions ? Math.round((sub.answers.length / sub.totalQuestions) * 100) : 0,
      warningCount: sub.violationCount || 0,
      isSuspicious: sub.isSuspicious,
      autoSubmitted: sub.autoSubmitted,
      violations: sub.violations || [],
      startedAt: sub.startedAt,
      submittedAt: sub.submittedAt,
      score: sub.score,
    }));

    // Collect all violations with student names, sorted by time
    const allViolations = [];
    submissions.forEach(sub => {
      (sub.violations || []).forEach(v => {
        allViolations.push({
          studentName: sub.studentId?.name || 'Unknown',
          studentUserId: sub.studentId?.userId || '',
          type: v.type,
          severity: v.severity,
          description: v.description,
          timestamp: v.timestamp,
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
        violations: allViolations.slice(0, 50),
        summary: {
          total: students.length,
          active: students.filter(s => s.status === 'started' || s.status === 'in-progress').length,
          submitted: students.filter(s => s.status === 'submitted' || s.status === 'graded' || s.status === 'auto-submitted').length,
          flagged: students.filter(s => s.isSuspicious).length,
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch monitoring data', error: error.message });
  }
};

export const getIntegrityReport = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId).select('title duration scheduledStart scheduledEnd passingScore');
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const submissions = await Submission.find({ examId })
      .populate('studentId', 'name email userId')
      .sort({ submittedAt: -1 });

    const reports = submissions.map(sub => {
      const violationsByType = {};
      (sub.violations || []).forEach(v => {
        violationsByType[v.type] = (violationsByType[v.type] || 0) + 1;
      });

      // Calculate suspicion score (0-100)
      let suspicionScore = 0;
      (sub.violations || []).forEach(v => {
        if (v.severity === 'CRITICAL') suspicionScore += 25;
        else if (v.severity === 'MEDIUM') suspicionScore += 10;
        else suspicionScore += 5;
      });
      suspicionScore = Math.min(suspicionScore, 100);

      return {
        submissionId: sub._id,
        studentId: sub.studentId?._id,
        studentName: sub.studentId?.name || 'Unknown',
        studentEmail: sub.studentId?.email || '',
        studentUserId: sub.studentId?.userId || '',
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
          flagged: reports.filter(r => r.isSuspicious).length,
          avgScore: reports.length > 0
            ? Math.round(reports.reduce((sum, r) => sum + (r.score || 0), 0) / reports.length)
            : 0,
          totalViolations: reports.reduce((sum, r) => sum + r.violationCount, 0),
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate report', error: error.message });
  }
};

export const getSubmissionReport = async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate('studentId', 'name email userId')
      .populate('examId', 'title duration passingScore questions');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const violationsByType = {};
    (submission.violations || []).forEach(v => {
      violationsByType[v.type] = (violationsByType[v.type] || 0) + 1;
    });

    let suspicionScore = 0;
    (submission.violations || []).forEach(v => {
      if (v.severity === 'CRITICAL') suspicionScore += 25;
      else if (v.severity === 'MEDIUM') suspicionScore += 10;
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
        isSuspicious: submission.isSuspicious,
        autoSubmitted: submission.autoSubmitted,
        violations: submission.violations,
        violationCount: submission.violationCount,
        violationsByType,
        suspicionScore,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch submission report', error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const users = await User.find(filter).select('-password');

    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: users
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

export const suspendStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(studentId, { isSuspended: true }, { new: true });
    if (!user) return res.status(404).json({ message: 'Student not found' });

    res.status(200).json({
      success: true,
      message: 'Student suspended successfully',
      data: { studentId: user._id, suspended: user.isSuspended, reason }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to suspend student', error: error.message });
  }
};

export const unsuspendStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const user = await User.findByIdAndUpdate(studentId, { isSuspended: false }, { new: true });
    if (!user) return res.status(404).json({ message: 'Student not found' });

    res.status(200).json({
      success: true,
      message: 'Student unsuspended successfully',
      data: { studentId: user._id, suspended: user.isSuspended }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to unsuspend student', error: error.message });
  }
};
