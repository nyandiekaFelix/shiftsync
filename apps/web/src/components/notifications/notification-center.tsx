"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NotificationItem } from "@shiftsync/shared-types";
import { notificationService } from "@/services/notification-service";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items],
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await notificationService.list(false, 20);
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch((error) =>
      console.error("Failed to load notifications", error),
    );
  }, []);

  const handleMarkRead = async (id: string) => {
    await notificationService.markRead(id);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
  };

  const handleMarkAll = async () => {
    await notificationService.markAllRead();
    setItems((prev) =>
      prev.map((item) => ({ ...item, readAt: new Date().toISOString() })),
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg border border-white/10 p-2 text-gray-300 hover:text-white hover:border-white/30"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[360px] rounded-xl border border-white/10 bg-[#121212] p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            <button
              onClick={() => handleMarkAll().catch(() => undefined)}
              className="text-xs text-indigo-300 hover:text-indigo-200"
            >
              Mark all read
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border p-2 ${
                    item.readAt
                      ? "border-white/5 bg-black/20"
                      : "border-indigo-500/30 bg-indigo-500/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-gray-300">
                        {item.message}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {formatDistanceToNow(new Date(item.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!item.readAt ? (
                      <button
                        onClick={() =>
                          handleMarkRead(item.id).catch(() => undefined)
                        }
                        className="text-[11px] text-indigo-300 hover:text-indigo-200"
                      >
                        Read
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
