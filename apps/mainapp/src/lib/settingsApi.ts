import type { BusinessProfileDTO, UpdateBusinessProfileInput } from "@zetsales/shared";
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
