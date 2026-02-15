import { protect } from "./auth.js";
import { requireRole } from "./authorize.js";

export const protectStudent = protect;
export const requireStudentRole = requireRole("student");
