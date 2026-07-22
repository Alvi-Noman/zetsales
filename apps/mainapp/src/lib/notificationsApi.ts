import type { NotificationDTO } from "@zetsales/shared";
import { api } from "./api";

export async function listNotifications() {
  const res = await api.get("/auth/notifications");
  return res.data as { notifications: NotificationDTO[]; unreadCount: number };
}

export async function markAllNotificationsRead() {
  await api.post("/auth/notifications/read-all");
}
