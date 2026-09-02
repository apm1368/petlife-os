import { create } from "zustand";

interface NotificationState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

/** Deliberately just the unread count — the full notification list is owned by NotificationCenterView's own local state, not duplicated here (the bell only ever needs the count). */
export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
}));
