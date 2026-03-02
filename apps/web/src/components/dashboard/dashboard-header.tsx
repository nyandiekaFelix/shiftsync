"use client";

import { Plus } from "lucide-react";

interface DashboardHeaderProps {
  onOpenCreateModal: () => void;
  isLocationSelected: boolean;
}

export default function DashboardHeader({
  onOpenCreateModal,
  isLocationSelected,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
          Schedule Manager
        </h1>
        <p className="text-gray-400 font-medium">
          Coordinate your team&apos;s shifts and assignments with precision.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenCreateModal}
          disabled={!isLocationSelected}
          className="group flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-3 rounded-2xl hover:bg-white/10 transition-all text-white disabled:opacity-30 disabled:cursor-not-allowed font-bold"
        >
          <div className="bg-indigo-500/20 p-1 rounded-lg group-hover:scale-110 transition-transform">
            <Plus size={20} className="text-indigo-400" />
          </div>
          <span>Create Shift</span>
        </button>
      </div>
    </div>
  );
}
