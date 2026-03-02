"use client";

import React from "react";
import { Shift, ShiftStatus } from "@shiftsync/shared-types";
import { Users } from "lucide-react";
import { formatTimeInTimeZone, getTimeZoneLabel } from "@/lib/timezone";

interface ShiftCardProps {
  shift: Shift;
  onClick: (shift: Shift) => void;
  timeZone: string;
}

export default function ShiftCard({
  shift,
  onClick,
  timeZone,
}: ShiftCardProps) {
  const isPublished = shift.status === ShiftStatus.PUBLISHED;
  const assignedCount = shift.assignments?.length || 0;
  const isFullyStaffed = assignedCount >= shift.requiredHeadcount;
  const timeLabel = formatTimeInTimeZone(shift.startTime, timeZone);
  const zoneLabel = getTimeZoneLabel(timeZone);

  return (
    <div
      onClick={() => onClick(shift)}
      className={`
        group relative text-[10px] p-2.5 rounded-xl border flex flex-col gap-2 cursor-pointer transition-all active:scale-[0.97]
        ${
          isPublished
            ? "bg-indigo-500/5 border-indigo-500/20 text-indigo-200 hover:bg-indigo-500/10 hover:border-indigo-500/40"
            : "bg-amber-500/5 border-amber-500/20 text-amber-200 hover:bg-amber-500/10 hover:border-amber-500/40"
        }
      `}
    >
      <div className="flex items-center justify-between font-bold tracking-tight">
        <span className="uppercase text-[9px] opacity-90">
          {shift.requiredHeadcount > 1
            ? `${assignedCount}/${shift.requiredHeadcount}`
            : ""}{" "}
          {shift.requiredSkill}
        </span>
        <span className="bg-black/20 px-1.5 py-0.5 rounded-md font-mono text-[9px]">
          {timeLabel} {zoneLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-black/20 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${isFullyStaffed ? "bg-green-400" : isPublished ? "bg-indigo-400" : "bg-amber-400"}`}
            style={{
              width: `${Math.min(100, (assignedCount / shift.requiredHeadcount) * 100)}%`,
            }}
          />
        </div>
        {!isFullyStaffed && (
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        )}
      </div>

      {/* Tooltip-like indicator on hover */}
      <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-white text-black p-0.5 rounded-full shadow-lg">
          <Users size={10} />
        </div>
      </div>
    </div>
  );
}
