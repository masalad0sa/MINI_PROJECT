import { protect } from "./auth.js";
import { requireRole } from "./authorize.js";

export const protectAdmin = protect;
export const requireAdminRole = requireRole("admin", "moderator");
