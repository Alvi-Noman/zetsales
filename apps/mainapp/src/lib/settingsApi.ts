import type { BusinessProfileDTO, SessionDTO, UpdateBusinessProfileInput } from "@zetsales/shared";
import { api } from "./api";

export async function getBusinessProfile() {
  const res = await api.get("/auth/business/profile");
  return res.data.profile as BusinessProfileDTO;
}

export async function updateBusinessProfile(input: UpdateBusinessProfileInput) {
  await api.patch("/auth/business", input);
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await api.patch("/auth/password", { currentPassword, newPassword });
}

export async function listSessions() {
  const res = await api.get("/auth/sessions");
  return res.data.sessions as SessionDTO[];
}

export async function revokeSession(tokenId: string) {
  await api.delete(`/auth/sessions/${tokenId}`);
}

export async function revokeAllSessions() {
  await api.post("/auth/sessions/revoke-all");
}
