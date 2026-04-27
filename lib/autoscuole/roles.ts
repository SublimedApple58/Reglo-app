export type AutoscuolaRole = "OWNER" | "INSTRUCTOR_OWNER" | "INSTRUCTOR" | "STUDENT";

export const isInstructor = (role: string | null | undefined): boolean =>
  role === "INSTRUCTOR" || role === "INSTRUCTOR_OWNER";

export const isOwner = (role: string | null | undefined): boolean =>
  role === "OWNER" || role === "INSTRUCTOR_OWNER";

export const isStudent = (role: string | null | undefined): boolean =>
  role === "STUDENT";

export const deriveCompanyMemberRole = (autoscuolaRole: string): "admin" | "member" =>
  autoscuolaRole === "OWNER" || autoscuolaRole === "INSTRUCTOR_OWNER" ? "admin" : "member";

export const getDefaultAutoscuolaRole = (memberRole: string): AutoscuolaRole =>
  memberRole === "admin" ? "OWNER" : "STUDENT";
