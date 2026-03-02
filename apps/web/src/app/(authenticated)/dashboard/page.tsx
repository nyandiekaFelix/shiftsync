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
} from "@shiftsync/shared-types";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";

import DashboardHeader from "@/components/dashboard/dashboard-header";
import DashboardControls from "@/components/dashboard/dashboard-controls";
import CalendarGrid from "@/components/dashboard/calendar-grid";
import ShiftDetailModal from "@/components/shifts/shift-detail-modal";
import { getRealtimeSocket } from "@/services/realtime-client";

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
    if (!selectedLocation || !user) return;

    const socket = getRealtimeSocket();
    const refresh = () => {
      fetchShifts();
      fetchLiveShifts();
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

    socket.on(ShiftSyncEvent.SHIFT_UPDATED, onShiftUpdated);
    socket.on(ShiftSyncEvent.SHIFT_ASSIGNMENT_CREATED, onAssignmentCreated);
    socket.on(ShiftSyncEvent.SHIFT_ASSIGNMENT_REMOVED, onAssignmentRemoved);
    socket.on(ShiftSyncEvent.SCHEDULE_PUBLISHED, onSchedulePublished);

    const interval = window.setInterval(refresh, 30_000);

    return () => {
      window.clearInterval(interval);
      socket.off(ShiftSyncEvent.SHIFT_UPDATED, onShiftUpdated);
      socket.off(ShiftSyncEvent.SHIFT_ASSIGNMENT_CREATED, onAssignmentCreated);
      socket.off(ShiftSyncEvent.SHIFT_ASSIGNMENT_REMOVED, onAssignmentRemoved);
      socket.off(ShiftSyncEvent.SCHEDULE_PUBLISHED, onSchedulePublished);
    };
  }, [selectedLocation, fetchShifts, fetchLiveShifts, user]);

  const selectedLocationData = allLocations.find(
    (location) => location.id === selectedLocation,
  );
  const selectedLocationTimezone = selectedLocationData?.timezone ?? "UTC";

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
                  {format(new Date(shift.startTime), "HH:mm")} -{" "}
                  {format(new Date(shift.endTime), "HH:mm")} •{" "}
                  {shift.assignments?.length ?? 0}/{shift.requiredHeadcount}{" "}
                  assigned
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
