// Role-based authorization middleware
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no user found" });
  }

  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied. Admin privileges required." });
  }

  next();
};

export const requireModerator = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no user found" });
  }

  if (req.user.role !== "admin" && req.user.role !== "moderator") {
    return res
      .status(403)
      .json({ message: "Access denied. Moderator privileges required." });
  }

  next();
};

// Examiner or Admin can create/edit exams
export const requireExaminer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no user found" });
  }

  if (req.user.role !== "admin" && req.user.role !== "examiner") {
    return res
      .status(403)
      .json({ message: "Access denied. Examiner privileges required." });
  }

  next();
};

export const requireStudent = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no user found" });
  }

  if (req.user.role !== "student") {
    return res
      .status(403)
      .json({ message: "Access denied. Student account required." });
  }

  next();
};

// Allow multiple roles
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, no user found" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${roles.join(", ")}. Current role: ${req.user.role}`,
      });
    }

    next();
  };
};
