export type AutoscuolaRole = "OWNER" | "INSTRUCTOR" | "STUDENT";

export const getDefaultAutoscuolaRole = (memberRole: string): AutoscuolaRole =>
  memberRole === "admin" ? "OWNER" : "STUDENT";
