import type { Role } from "../db/models/User";

export const PERMISSIONS = {
  WORKSPACE_MANAGE: "workspace:manage",
  TEAM_INVITE: "team:invite",
  TEAM_REMOVE: "team:remove",
  TEAM_VIEW: "team:view",
  BRANDING_CONFIGURE: "branding:configure",
  ANALYTICS_VIEW: "analytics:view",
  JOB_CREATE: "job:create",
  JOB_MANAGE: "job:manage",
  CANDIDATE_MANAGE: "candidate:manage",
  CANDIDATE_REVIEW: "candidate:review",
  INTERVIEW_SCHEDULE: "interview:schedule",
  INTERVIEW_FEEDBACK: "interview:feedback",
  OFFER_MANAGE: "offer:manage",
  INTEGRATION_CONNECT: "integration:connect",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<Role, ReadonlyArray<Permission>> = {
  super_admin: Object.values(PERMISSIONS),
  company_admin: [
    PERMISSIONS.WORKSPACE_MANAGE,
    PERMISSIONS.TEAM_INVITE,
    PERMISSIONS.TEAM_REMOVE,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.BRANDING_CONFIGURE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.JOB_CREATE,
    PERMISSIONS.JOB_MANAGE,
    PERMISSIONS.CANDIDATE_MANAGE,
    PERMISSIONS.INTERVIEW_SCHEDULE,
    PERMISSIONS.OFFER_MANAGE,
    PERMISSIONS.INTEGRATION_CONNECT,
  ],
  recruiter: [
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.JOB_CREATE,
    PERMISSIONS.JOB_MANAGE,
    PERMISSIONS.CANDIDATE_MANAGE,
    PERMISSIONS.INTERVIEW_SCHEDULE,
    PERMISSIONS.INTEGRATION_CONNECT,
  ],
  hr_manager: [
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.CANDIDATE_REVIEW,
    PERMISSIONS.CANDIDATE_MANAGE,
    PERMISSIONS.OFFER_MANAGE,
  ],
  hiring_manager: [
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.CANDIDATE_REVIEW,
    PERMISSIONS.INTERVIEW_FEEDBACK,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): ReadonlyArray<Permission> {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  recruiter: "Recruiter",
  hr_manager: "HR Manager",
  hiring_manager: "Hiring Manager",
};
