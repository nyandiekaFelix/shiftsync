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
} from "@shiftsync/shared-types";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";

import DashboardHeader from "@/components/dashboard/dashboard-header";
import DashboardControls from "@/components/dashboard/dashboard-controls";
import CalendarGrid from "@/components/dashboard/calendar-grid";
import ShiftDetailModal from "@/components/shifts/shift-detail-modal";

export default function ManagerDashboard() {
  useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleAssignStaff = async (userId: string) => {
    if (!modalShift?.id) return;
    try {
      const result = await shiftService.assignStaff(modalShift.id, userId);
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
    } catch (error: unknown) {
      if (error instanceof ConstraintViolationError) {
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
