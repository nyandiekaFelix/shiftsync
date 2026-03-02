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
  ACCEPTED = "ACCEPTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
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
  requesterId: string;
  receiverId: string;
  shiftId: string;
  status: SwapStatus;
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
