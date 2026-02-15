import { protect } from "./auth.js";
import { requireRole } from "./authorize.js";

export const protectExaminer = protect;
export const requireExaminerRole = requireRole("examiner", "admin");
