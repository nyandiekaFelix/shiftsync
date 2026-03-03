"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import {
  shiftService,
  ConstraintViolationError,
} from "@/services/shift-service";
import {
  Shift,
  ShiftStatus,
  Location,
  ConstraintIssue,
  ConstraintRuleCode,
  ShiftSyncEvent,
  SwapRequest,
  AuthUser,
  FairnessReport,
  AuditLogEntry,
  Role,
} from "@shiftsync/shared-types";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";

import DashboardHeader from "@/components/dashboard/dashboard-header";
import DashboardControls from "@/components/dashboard/dashboard-controls";
import CalendarGrid from "@/components/dashboard/calendar-grid";
import ShiftDetailModal from "@/components/shifts/shift-detail-modal";
import { getRealtimeSocket } from "@/services/realtime-client";
import { analyticsService } from "@/services/analytics-service";
import { formatTimeInTimeZone } from "@/lib/timezone";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [liveShifts, setLiveShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveLoading, setIsLiveLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [allLocations, setAllLocations] = useState<Location[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalShift, setModalShift] = useState<Shift | undefined>(undefined);
  const [assignmentWarnings, setAssignmentWarnings] = useState<
    Record<string, ConstraintIssue[]>
  >({});
  const [assignmentBlocks, setAssignmentBlocks] = useState<
    Record<string, ConstraintIssue[]>
  >({});
  const [approvalQueue, setApprovalQueue] = useState<SwapRequestItem[]>([]);
  const [fairnessReport, setFairnessReport] = useState<FairnessReport | null>(
    null,
  );
  const [isFairnessLoading, setIsFairnessLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  type SwapRequestItem = SwapRequest & {
    requester?: AuthUser;
    receiver?: AuthUser;
    shift?: Shift & {
      location?: Location;
    };
  };

  const fetchShifts = useCallback(async () => {
    if (!selectedLocation) return;
    setIsLoading(true);
    try {
      const start = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const end = format(endOfMonth(currentDate), "yyyy-MM-dd");
      const data = await shiftService.findAll(selectedLocation, start, end);
      setShifts(data);

      if (isModalOpen && modalShift?.id) {
        const updated = data.find((s) => s.id === modalShift.id);
        if (updated) setModalShift(updated);
      }
    } catch (error) {
      console.error("Failed to fetch shifts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocation, currentDate, isModalOpen, modalShift?.id]);

  const fetchLiveShifts = useCallback(async () => {
    if (!selectedLocation) return;
    setIsLiveLoading(true);
    try {
      const data = await shiftService.getLiveShifts(selectedLocation);
      setLiveShifts(data);
    } catch (error) {
      console.error("Failed to fetch live shifts:", error);
    } finally {
      setIsLiveLoading(false);
    }
  }, [selectedLocation]);

  const fetchApprovalQueue = useCallback(async () => {
    try {
      const queue = await shiftService.listSwapRequests("approval");
      setApprovalQueue(queue as SwapRequestItem[]);
    } catch (error) {
      console.error("Failed to fetch approval queue:", error);
    }
  }, []);

  const fetchFairnessReport = useCallback(async () => {
    if (!selectedLocation || !user) return;
    if (user.role === Role.STAFF) return;

    setIsFairnessLoading(true);
    try {
      const from = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const to = format(endOfMonth(currentDate), "yyyy-MM-dd");
      const report = await analyticsService.getFairnessReport(
        from,
        to,
        selectedLocation,
      );
      setFairnessReport(report);
    } catch (error) {
      console.error("Failed to fetch fairness report:", error);
    } finally {
      setIsFairnessLoading(false);
    }
  }, [selectedLocation, currentDate, user]);

  const fetchAuditLogs = useCallback(async () => {
    if (!user || user.role !== Role.ADMIN) return;

    setIsAuditLoading(true);
    try {
      const from = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const to = format(endOfMonth(currentDate), "yyyy-MM-dd");
      const logs = await analyticsService.getAuditLogs({
        locationId: selectedLocation,
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
        limit: 200,
      });
      setAuditLogs(logs);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setIsAuditLoading(false);
    }
  }, [currentDate, selectedLocation, user]);

  useEffect(() => {
    const initLocations = async () => {
      try {
        const locations = await shiftService.getLocations();
        setAllLocations(locations);
        if (locations.length > 0 && !selectedLocation) {
          setSelectedLocation(locations[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch locations:", error);
      }
    };
    initLocations();
  }, [selectedLocation]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  useEffect(() => {
    fetchLiveShifts();
  }, [fetchLiveShifts]);

  useEffect(() => {
    fetchApprovalQueue();
  }, [fetchApprovalQueue]);

  useEffect(() => {
    fetchFairnessReport();
  }, [fetchFairnessReport]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    if (!selectedLocation || !user) return;

    const socket = getRealtimeSocket();
    const refresh = () => {
      fetchShifts();
      fetchLiveShifts();
      fetchApprovalQueue();
      fetchFairnessReport();
      fetchAuditLogs();
    };

    socket.emit("join.location", { locationId: selectedLocation });

    const onShiftUpdated = () => refresh();
    const onAssignmentCreated = () => {
      toast.info("Assignment updated in real time");
      refresh();
    };
    const onAssignmentRemoved = () => refresh();
    const onSchedulePublished = () => {
      toast.success("Schedule published");
      refresh();
    };
    const onSwapRequestUpdated = () => refresh();

    socket.on(ShiftSyncEvent.SHIFT_UPDATED, onShiftUpdated);
    socket.on(ShiftSyncEvent.SHIFT_ASSIGNMENT_CREATED, onAssignmentCreated);
    socket.on(ShiftSyncEvent.SHIFT_ASSIGNMENT_REMOVED, onAssignmentRemoved);
    socket.on(ShiftSyncEvent.SCHEDULE_PUBLISHED, onSchedulePublished);
    socket.on(ShiftSyncEvent.SWAP_REQUEST_UPDATED, onSwapRequestUpdated);

    const interval = window.setInterval(refresh, 30_000);

    return () => {
      window.clearInterval(interval);
      socket.off(ShiftSyncEvent.SHIFT_UPDATED, onShiftUpdated);
      socket.off(ShiftSyncEvent.SHIFT_ASSIGNMENT_CREATED, onAssignmentCreated);
      socket.off(ShiftSyncEvent.SHIFT_ASSIGNMENT_REMOVED, onAssignmentRemoved);
      socket.off(ShiftSyncEvent.SCHEDULE_PUBLISHED, onSchedulePublished);
      socket.off(ShiftSyncEvent.SWAP_REQUEST_UPDATED, onSwapRequestUpdated);
    };
  }, [
    selectedLocation,
    fetchShifts,
    fetchLiveShifts,
    fetchApprovalQueue,
    fetchFairnessReport,
    fetchAuditLogs,
    user,
  ]);

  const handleApprovalDecision = async (
    requestId: string,
    approve: boolean,
  ) => {
    try {
      await shiftService.approveSwapRequest(
        requestId,
        approve,
        approve ? undefined : "Manager denied request",
      );
      toast.success(approve ? "Request approved" : "Request denied");
      fetchApprovalQueue();
      fetchShifts();
      fetchLiveShifts();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to review request";
      toast.error(message);
    }
  };

  const selectedLocationData = allLocations.find(
    (location) => location.id === selectedLocation,
  );
  const selectedLocationTimezone = selectedLocationData?.timezone ?? "UTC";
  const fairnessTone =
    (fairnessReport?.fairnessScore ?? 100) >= 80
      ? "text-emerald-300"
      : (fairnessReport?.fairnessScore ?? 100) >= 60
        ? "text-amber-300"
        : "text-rose-300";

  const exportAuditCsv = () => {
    if (auditLogs.length === 0) return;

    const header = [
      "createdAt",
      "entityType",
      "entityId",
      "action",
      "actorId",
      "targetUserId",
    ];
    const rows = auditLogs.map((log) => [
      String(log.createdAt),
      log.entityType,
      log.entityId,
      log.action,
      log.actorId ?? "",
      log.targetUserId ?? "",
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit_logs_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateOrUpdateShift = async (shiftData: Partial<Shift>) => {
    const editablePayload: Partial<Shift> = {
      startTime: shiftData.startTime,
      endTime: shiftData.endTime,
      requiredSkill: shiftData.requiredSkill,
      requiredHeadcount: shiftData.requiredHeadcount,
      status: shiftData.status,
    };

    try {
      if (shiftData.id) {
        await shiftService.update(shiftData.id, editablePayload);
        toast.success("Shift updated successfully");
      } else {
        await shiftService.create({
          ...editablePayload,
          locationId: selectedLocation,
          status: ShiftStatus.DRAFT,
        });
        toast.success("Shift created successfully");
      }
      fetchShifts();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save shift";
      toast.error(errorMessage);
      throw error;
    }
  };

  const assignStaffWithFeedback = async (
    userId: string,
    managerOverrideReason?: string,
  ) => {
    if (!modalShift?.id) return;
    const result = await shiftService.assignStaff(
      modalShift.id,
      userId,
      managerOverrideReason,
    );
    setAssignmentBlocks((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setAssignmentWarnings((prev) => ({
      ...prev,
      [userId]: result.warnings,
    }));
    toast.success("Staff assigned successfully");
    if (result.warnings.length > 0) {
      toast.warning(result.warnings.map((w) => w.message).join(" "));
    }
    fetchShifts();
  };

  const handleAssignStaff = async (userId: string) => {
    if (!modalShift?.id) return;
    try {
      await assignStaffWithFeedback(userId);
    } catch (error: unknown) {
      if (error instanceof ConstraintViolationError) {
        if (
          error.payload.rule ===
          ConstraintRuleCode.CONSECUTIVE_DAY_7_OVERRIDE_REQUIRED
        ) {
          const overrideReason = window.prompt(
            "This assignment creates a 7th consecutive work day. Enter manager override notes to proceed:",
          );

          if (overrideReason?.trim()) {
            try {
              await assignStaffWithFeedback(userId, overrideReason);
              return;
            } catch (retryError: unknown) {
              if (retryError instanceof ConstraintViolationError) {
                setAssignmentBlocks((prev) => ({
                  ...prev,
                  [userId]: retryError.payload.details,
                }));
                toast.error(
                  retryError.payload.details
                    .map((detail) => detail.message)
                    .join(" "),
                );
              } else {
                const retryErrorMessage =
                  retryError instanceof Error
                    ? retryError.message
                    : "Failed to assign staff";
                toast.error(retryErrorMessage);
              }
              throw retryError;
            }
          }
        }

        setAssignmentBlocks((prev) => ({
          ...prev,
          [userId]: error.payload.details,
        }));
        const detailLines = error.payload.details
          .map((d) => d.message)
          .join(" ");
        const suggestionText =
          error.payload.suggestions.length > 0
            ? ` Suggestions: ${error.payload.suggestions
                .map((s) => s.name)
                .join(", ")}`
            : "";
        toast.error(`${detailLines}${suggestionText}`);
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to assign staff";
        toast.error(errorMessage);
      }
      throw error;
    }
  };

  const openModal = (shift?: Shift | Partial<Shift>) => {
    setModalShift(shift as Shift);
    setIsModalOpen(true);
  };

  const handleDayClick = (date: Date) => {
    openModal({
      startTime: format(date, "yyyy-MM-dd'T'09:00"),
      endTime: format(date, "yyyy-MM-dd'T'17:00"),
    });
  };

  return (
    <div className="space-y-10 pb-20">
      <DashboardHeader
        onOpenCreateModal={() => openModal()}
        isLocationSelected={!!selectedLocation}
      />

      <DashboardControls
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        selectedLocation={selectedLocation}
        onLocationChange={setSelectedLocation}
        locations={allLocations}
        selectedLocationTimezone={selectedLocationTimezone}
      />

      <CalendarGrid
        currentDate={currentDate}
        shifts={shifts}
        isLoading={isLoading}
        onDayClick={handleDayClick}
        onShiftClick={openModal}
        timeZone={selectedLocationTimezone}
      />

      <section className="rounded-3xl border border-white/10 bg-[#141414] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Live On-Duty Now</h2>
          {isLiveLoading && (
            <span className="text-xs text-gray-400">Refreshing...</span>
          )}
        </div>
        {liveShifts.length === 0 ? (
          <p className="text-sm text-gray-400">No active shifts right now.</p>
        ) : (
          <ul className="space-y-3">
            {liveShifts.map((shift) => (
              <li
                key={shift.id}
                className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200"
              >
                <div className="font-medium">{shift.requiredSkill}</div>
                <div className="text-xs text-gray-400">
                  {formatTimeInTimeZone(
                    shift.startTime,
                    selectedLocationTimezone,
                  )}{" "}
                  -{" "}
                  {formatTimeInTimeZone(
                    shift.endTime,
                    selectedLocationTimezone,
                  )}{" "}
                  • {shift.assignments?.length ?? 0}/{shift.requiredHeadcount}{" "}
                  assigned
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#141414] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Approval Queue</h2>
          <span className="text-xs text-gray-400">
            {approvalQueue.length} pending
          </span>
        </div>
        {approvalQueue.length === 0 ? (
          <p className="text-sm text-gray-400">
            No peer-accepted swap/drop requests waiting for review.
          </p>
        ) : (
          <ul className="space-y-3">
            {approvalQueue.map((request) => (
              <li
                key={request.id}
                className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200"
              >
                <div className="font-medium">
                  {request.shift?.requiredSkill ?? "Shift"} • {request.status}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {request.requester?.name ?? request.requesterId} →{" "}
                  {request.receiver?.name ?? request.receiverId}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleApprovalDecision(request.id, true)}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleApprovalDecision(request.id, false)}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {user?.role !== Role.STAFF && (
        <section className="rounded-3xl border border-white/10 bg-[#141414] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Fairness Analytics
              </h2>
              <p className="text-xs text-gray-400">
                Hours and premium-shift distribution for the selected period.
              </p>
            </div>
            <div className="text-right">
              <p className={`text-xl font-semibold ${fairnessTone}`}>
                {fairnessReport?.fairnessScore ?? 0}
              </p>
              <p className="text-[11px] text-gray-500">Fairness score</p>
            </div>
          </div>

          {isFairnessLoading ? (
            <p className="text-sm text-gray-400">Calculating fairness...</p>
          ) : !fairnessReport || fairnessReport.metrics.length === 0 ? (
            <p className="text-sm text-gray-400">
              No staff metrics found for this range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-gray-200">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase text-gray-400">
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2">Total Hours</th>
                    <th className="px-3 py-2">Premium Hours</th>
                    <th className="px-3 py-2">Shift Count</th>
                    <th className="px-3 py-2">Desired Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {fairnessReport.metrics.map((metric) => (
                    <tr key={metric.userId} className="border-b border-white/5">
                      <td className="px-3 py-2">{metric.name}</td>
                      <td className="px-3 py-2">{metric.totalHours}</td>
                      <td className="px-3 py-2">{metric.premiumHours}</td>
                      <td className="px-3 py-2">{metric.shiftCount}</td>
                      <td
                        className={`px-3 py-2 ${
                          metric.desiredHoursDelta > 0
                            ? "text-amber-300"
                            : metric.desiredHoursDelta < 0
                              ? "text-sky-300"
                              : "text-gray-300"
                        }`}
                      >
                        {metric.desiredHoursDelta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {user?.role === Role.ADMIN && (
        <section className="rounded-3xl border border-white/10 bg-[#141414] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Audit Trail Export
            </h2>
            <button
              onClick={exportAuditCsv}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20"
            >
              Export CSV
            </button>
          </div>

          {isAuditLoading ? (
            <p className="text-sm text-gray-400">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-gray-400">
              No audit records in the selected period.
            </p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full text-left text-xs text-gray-200">
                <thead className="bg-black/20 text-[11px] uppercase text-gray-400">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-t border-white/5">
                      <td className="px-3 py-2">
                        {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="px-3 py-2">
                        {log.entityType} · {log.entityId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2">{log.action}</td>
                      <td className="px-3 py-2">{log.actorId ?? "system"}</td>
                      <td className="px-3 py-2">{log.targetUserId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ShiftDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOrUpdateShift}
        onAssign={handleAssignStaff}
        initialData={modalShift}
        assignmentWarnings={assignmentWarnings}
        assignmentBlocks={assignmentBlocks}
        locationTimezone={selectedLocationTimezone}
      />
    </div>
  );
}
