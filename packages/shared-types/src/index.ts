export enum Role {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  STAFF = "STAFF",
}

export enum Skill {
  BARTENDER = "BARTENDER",
  LINE_COOK = "LINE_COOK",
  SERVER = "SERVER",
  HOST = "HOST",
}

export enum AvailabilityType {
  RECURRING = "RECURRING",
  EXCEPTION = "EXCEPTION",
}

export enum SwapStatus {
  PENDING = "PENDING",
  ACCEPTED_BY_PEER = "ACCEPTED_BY_PEER",
  APPROVED = "APPROVED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
}

export enum SwapRequestType {
  SWAP = "SWAP",
  DROP = "DROP",
}

export enum ShiftStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  skills: Skill[];
  certifiedLocations: string[];
  deletedAt?: Date | null;
}

export interface Location {
  id: string;
  name: string;
  timezone: string;
  address?: string | null;
  deletedAt?: Date | null;
}

export interface Shift {
  id: string;
  locationId: string;
  startTime: Date | string;
  endTime: Date | string;
  requiredSkill: Skill;
  requiredHeadcount: number;
  status: ShiftStatus;
  deletedAt?: Date | null;
  assignments?: Assignment[];
}

export interface Assignment {
  id: string;
  shiftId: string;
  userId: string;
  deletedAt?: Date | null;
}

export interface Availability {
  id: string;
  userId: string;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  date?: Date | string | null;
  type: AvailabilityType;
  deletedAt?: Date | null;
}

export interface SwapRequest {
  id: string;
  type: SwapRequestType;
  requesterId: string;
  receiverId?: string | null;
  shiftId: string;
  status: SwapStatus;
  expiresAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  resolutionNote?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  deletedAt?: Date | null;
}

// Auth Types
export interface LoginCredentials {
  email: string;
  password?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  certifiedLocations: string[];
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export enum ConstraintSeverity {
  BLOCK = "BLOCK",
  WARN = "WARN",
}

export enum ConstraintRuleCode {
  SKILL_MISMATCH = "SKILL_MISMATCH",
  CERTIFICATION_MISMATCH = "CERTIFICATION_MISMATCH",
  AVAILABILITY_VIOLATION = "AVAILABILITY_VIOLATION",
  DOUBLE_BOOKING = "DOUBLE_BOOKING",
  MIN_REST = "MIN_REST",
  DAILY_WARNING_8H = "DAILY_WARNING_8H",
  DAILY_LIMIT_12H = "DAILY_LIMIT_12H",
  WEEKLY_WARNING_35H = "WEEKLY_WARNING_35H",
  WEEKLY_OVERTIME_40H = "WEEKLY_OVERTIME_40H",
  CONSECUTIVE_DAY_6 = "CONSECUTIVE_DAY_6",
  CONSECUTIVE_DAY_7_OVERRIDE_REQUIRED = "CONSECUTIVE_DAY_7_OVERRIDE_REQUIRED",
}

export interface ConstraintIssue {
  rule: ConstraintRuleCode;
  severity: ConstraintSeverity;
  message: string;
  conflictingShiftId?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface AssignmentSuggestion {
  userId: string;
  name: string;
}

export interface AssignmentConstraintFeedback {
  warnings: ConstraintIssue[];
}

export interface AssignStaffResponse extends AssignmentConstraintFeedback {
  assignment: Assignment;
}

export interface ConstraintViolationPayload {
  statusCode: number;
  error: string;
  message: string;
  rule: ConstraintRuleCode;
  details: ConstraintIssue[];
  suggestions: AssignmentSuggestion[];
}

export enum ShiftSyncEvent {
  SHIFT_UPDATED = "shift.updated",
  SHIFT_ASSIGNMENT_CREATED = "shift.assignment.created",
  SHIFT_ASSIGNMENT_REMOVED = "shift.assignment.removed",
  SCHEDULE_PUBLISHED = "schedule.published",
  STAFF_ASSIGNMENT_UPDATED = "staff.assignment.updated",
  SWAP_REQUEST_UPDATED = "swap.request.updated",
}

export interface ShiftRealtimeEvent {
  event: ShiftSyncEvent;
  shiftId: string;
  locationId: string;
  occurredAt: string;
}

export interface StaffAssignmentRealtimeEvent extends ShiftRealtimeEvent {
  staffId: string;
  assignmentId?: string;
}
