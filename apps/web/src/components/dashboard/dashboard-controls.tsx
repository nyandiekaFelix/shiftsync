"use client";

import React from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";

import { Location } from "@shiftsync/shared-types";

interface DashboardControlsProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  selectedLocation: string;
  onLocationChange: (locationId: string) => void;
  locations: Location[];
  selectedLocationTimezone?: string;
}

export default function DashboardControls({
  currentDate,
  onDateChange,
  selectedLocation,
  onLocationChange,
  locations,
  selectedLocationTimezone,
}: DashboardControlsProps) {
  return (
    <div className="flex flex-col lg:flex-row items-center justify-between bg-[#141111] border border-white/5 rounded-[2rem] p-5 shadow-2xl backdrop-blur-xl gap-6">
      <div className="flex flex-col md:flex-row items-center gap-6 text-white w-full lg:w-auto">
        {/* Date Navigation */}
        <div className="flex items-center bg-[#0a0a0a] rounded-2xl p-1.5 border border-white/5 shadow-inner">
          <button
            onClick={() => onDateChange(subMonths(currentDate, 1))}
            className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all active:scale-90"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="px-6 font-bold min-w-[160px] text-center tracking-wide">
            {format(currentDate, "MMMM yyyy")}
          </div>
          <button
            onClick={() => onDateChange(addMonths(currentDate, 1))}
            className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all active:scale-90"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Location Selector */}
        <div className="flex items-center gap-4 bg-[#0a0a0a] border border-white/5 px-5 py-1.5 rounded-2xl w-full md:w-auto shadow-inner group focus-within:ring-2 focus-within:ring-indigo-500/30 transition-all">
          <div className="flex items-center gap-2 text-gray-500 border-r border-white/10 pr-4 mr-1">
            <MapPin size={16} className="text-gray-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              Location
            </span>
          </div>
          <select
            value={selectedLocation}
            onChange={(e) => onLocationChange(e.target.value)}
            className="bg-transparent text-white py-2.5 outline-none cursor-pointer flex-1 md:flex-none min-w-[200px] font-semibold appearance-none"
          >
            {locations.length === 0 && (
              <option value="" disabled>
                No locations available
              </option>
            )}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id} className="bg-[#111111]">
                {loc.name}
              </option>
            ))}
          </select>
          <div className="text-gray-500 pointer-events-none group-hover:translate-x-0.5 transition-transform">
            <ChevronRight size={16} className="rotate-90" />
          </div>
        </div>
        {selectedLocationTimezone && (
          <div className="text-[11px] text-gray-400 bg-[#0a0a0a] border border-white/5 px-3 py-2 rounded-xl">
            Shift times shown in{" "}
            <span className="text-white">{selectedLocationTimezone}</span>
          </div>
        )}
      </div>
    </div>
  );
}
