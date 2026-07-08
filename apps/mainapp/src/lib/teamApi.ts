import type { AcceptInvitePreviewDTO, TeamInviteDTO, TeamMemberDTO, TeamRole, UserDTO } from '@zetsales/shared';
import { api } from './api';

export async function listMembers() {
  const res = await api.get('/auth/team/members');
  return res.data.members as TeamMemberDTO[];
}

export async function updateMemberRole(memberId: string, role: TeamRole) {
  const res = await api.patch(`/auth/team/members/${memberId}`, { role });
  return res.data.member as TeamMemberDTO;
}

export async function removeMember(memberId: string) {
  await api.delete(`/auth/team/members/${memberId}`);
}

export async function listInvites() {
  const res = await api.get('/auth/team/invites');
  return res.data.invites as TeamInviteDTO[];
}

export async function inviteMember(email: string, role: TeamRole) {
  const res = await api.post('/auth/team/invites', { email, role });
  return res.data.invite as TeamInviteDTO;
}

export async function resendInvite(inviteId: string) {
  const res = await api.post(`/auth/team/invites/${inviteId}/resend`);
  return res.data.invite as TeamInviteDTO;
}

export async function revokeInvite(inviteId: string) {
  await api.delete(`/auth/team/invites/${inviteId}`);
}

export async function getInvitePreview(token: string) {
  const res = await api.get(`/auth/team/invites/token/${token}/preview`);
  return res.data.preview as AcceptInvitePreviewDTO;
}

export async function acceptInvite(token: string, password: string) {
  const res = await api.post(`/auth/team/invites/token/${token}/accept`, { password });
  return res.data.user as UserDTO;
}
