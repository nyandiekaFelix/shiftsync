"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Shift,
  Skill,
  ShiftStatus,
  AuthUser,
  Assignment,
} from "@shiftsync/shared-types";
import {
  X,
  Clock,
  Users,
  Briefcase,
  Search,
  UserPlus,
  CheckCircle2,
  ChevronRight,
  Settings,
} from "lucide-react";
import { format } from "date-fns";
import { shiftService } from "@/services/shift-service";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ShiftDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (shift: Partial<Shift>) => Promise<void>;
  onAssign: (userId: string) => Promise<void>;
  initialData?: Shift;
}

type Tab = "details" | "staff";

export default function ShiftDetailModal({
  isOpen,
  onClose,
  onSubmit,
  onAssign,
  initialData,
}: ShiftDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [formData, setFormData] = useState<Partial<Shift>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Staff Assignment State
  const [search, setSearch] = useState("");
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [availableStaff, setAvailableStaff] = useState<AuthUser[]>([]);

  const isEdit = !!initialData?.id;
  const assignedUserIds =
    initialData?.assignments?.map((a: Assignment) => a.userId) || [];

  const fetchStaff = useCallback(async () => {
    if (!initialData?.locationId || !initialData?.requiredSkill) return;
    try {
      const data = await shiftService.getUsers(
        initialData.locationId,
        initialData.requiredSkill,
      );
      setAvailableStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch staff:", err);
      toast.error("Failed to load available staff");
    }
  }, [initialData?.locationId, initialData?.requiredSkill]);

  useEffect(() => {
    if (isOpen) {
      const start = initialData?.startTime
        ? new Date(initialData.startTime)
        : new Date(new Date().setHours(new Date().getHours() + 1, 0, 0, 0));
      const end = initialData?.endTime
        ? new Date(initialData.endTime)
        : new Date(start.getTime() + 8 * 60 * 60 * 1000);

      setFormData({
        startTime: format(start, "yyyy-MM-dd'T'HH:mm"),
        endTime: format(end, "yyyy-MM-dd'T'HH:mm"),
        requiredSkill: initialData?.requiredSkill || Skill.SERVER,
        requiredHeadcount: initialData?.requiredHeadcount || 1,
        status: initialData?.status || ShiftStatus.DRAFT,
      });
      setError("");

      if (!isEdit) setActiveTab("details");

      if (isEdit) {
        fetchStaff();
      }
    }
  }, [isOpen, initialData, isEdit, fetchStaff]);

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    const start = new Date(formData.startTime as string);
    const end = new Date(formData.endTime as string);

    if (start >= end) {
      setError("End time must be after start time");
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit({ ...initialData, ...formData });
      if (!isEdit) onClose();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save shift";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssign = async (userId: string) => {
    setAssigningUserId(userId);
    try {
      await onAssign(userId);
    } catch {
      // toast error handled by parent (handleAssignStaff in dashboard)
    } finally {
      setAssigningUserId(null);
    }
  };

  if (!isOpen) return null;

  const filteredStaff = availableStaff.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0a0a0a]/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl bg-[#111111] border border-white/5 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 fade-in duration-300">
        {/* Header */}
        <div className="p-8 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {isEdit ? "Shift Management" : "Create New Shift"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isEdit
                ? "Manage details and staff for this session"
                : "Set up a new working session for your team"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs - Only show if editing */}
        {isEdit && (
          <div className="px-8 pb-4">
            <div className="flex bg-white/5 p-1.5 rounded-2xl">
              <button
                onClick={() => setActiveTab("details")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  activeTab === "details"
                    ? "bg-white text-black shadow-lg"
                    : "text-gray-400 hover:text-white",
                )}
              >
                <Settings size={16} />
                Details
              </button>
              <button
                onClick={() => setActiveTab("staff")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  activeTab === "staff"
                    ? "bg-white text-black shadow-lg"
                    : "text-gray-400 hover:text-white",
                )}
              >
                <Users size={16} />
                Staffing
                {assignedUserIds.length > 0 && (
                  <span
                    className={cn(
                      "ml-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      activeTab === "staff"
                        ? "bg-black text-white"
                        : "bg-indigo-500 text-white",
                    )}
                  >
                    {assignedUserIds.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "details" ? (
            <form
              onSubmit={handleDetailsSubmit}
              className="p-8 space-y-6 overflow-y-auto custom-scrollbar"
            >
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400 ml-1">
                    Start Time
                  </label>
                  <div className="relative group">
                    <Clock
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors"
                      size={18}
                    />
                    <input
                      type="datetime-local"
                      value={
                        typeof formData.startTime === "string"
                          ? formData.startTime
                          : ""
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, startTime: e.target.value })
                      }
                      className="w-full bg-white/[0.03] border border-white/5 text-white pl-11 pr-4 py-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/[0.05] transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400 ml-1">
                    End Time
                  </label>
                  <div className="relative group">
                    <Clock
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors"
                      size={18}
                    />
                    <input
                      type="datetime-local"
                      value={
                        typeof formData.endTime === "string"
                          ? formData.endTime
                          : ""
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, endTime: e.target.value })
                      }
                      className="w-full bg-white/[0.03] border border-white/5 text-white pl-11 pr-4 py-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/[0.05] transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 ml-1">
                  Required Skill
                </label>
                <div className="relative group">
                  <Briefcase
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors"
                    size={18}
                  />
                  <select
                    value={formData.requiredSkill || Skill.SERVER}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requiredSkill: e.target.value as Skill,
                      })
                    }
                    className="w-full bg-white/[0.03] border border-white/5 text-white pl-11 pr-10 py-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/[0.05] transition-all appearance-none cursor-pointer"
                  >
                    {Object.values(Skill).map((skill) => (
                      <option
                        key={skill}
                        value={skill}
                        className="bg-[#111111]"
                      >
                        {skill}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <ChevronRight size={16} className="rotate-90" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 ml-1">
                  Staff Capacity
                </label>
                <div className="relative group">
                  <Users
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors"
                    size={18}
                  />
                  <input
                    type="number"
                    min="1"
                    value={formData.requiredHeadcount ?? 1}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requiredHeadcount: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full bg-white/[0.03] border border-white/5 text-white pl-11 pr-4 py-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/[0.05] transition-all"
                    required
                  />
                </div>
                <p className="text-[10px] text-gray-500 ml-1 uppercase tracking-wider font-bold">
                  Recommended for {formData.requiredSkill} roles
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm animate-in shake duration-300">
                  {error}
                </div>
              )}

              <div className="flex gap-4 pt-4">
                {!isEdit && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    "flex-[2] py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2",
                    "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)]",
                    "disabled:opacity-50 disabled:shadow-none active:scale-[0.98]",
                  )}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-3 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>{isEdit ? "Save Changes" : "Create Session"}</>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden p-8 pt-4">
              <div className="relative mb-6">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Find certified staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/5 text-white pl-11 pr-4 py-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {filteredStaff.length > 0 ? (
                  filteredStaff.map((staff) => {
                    const isAssigned = assignedUserIds.includes(staff.id);
                    return (
                      <div
                        key={staff.id}
                        className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg border border-indigo-500/10">
                            {staff.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white tracking-wide">
                              {staff.name}
                            </div>
                            <div className="text-xs text-gray-500 font-medium">
                              {staff.email}
                            </div>
                          </div>
                        </div>
                        {isAssigned ? (
                          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-wider border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                            <CheckCircle2 size={14} />
                            Assigned
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAssign(staff.id)}
                            disabled={assigningUserId === staff.id}
                            className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-50 shadow-sm active:scale-95"
                          >
                            {assigningUserId === staff.id ? (
                              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <UserPlus size={20} />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                      <Search size={32} className="opacity-20" />
                    </div>
                    <p className="text-sm font-medium">
                      No certified staff found for this role.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Users size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                    Target Coverage
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.min(100, (assignedUserIds.length / (formData.requiredHeadcount || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs font-bold text-white tabular-nums">
                      {assignedUserIds.length} / {formData.requiredHeadcount}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
