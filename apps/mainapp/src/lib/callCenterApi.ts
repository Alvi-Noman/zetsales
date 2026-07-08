import type { CallCenterOverviewDTO } from '@zetsales/shared';
import { api } from './api';

export interface CallCenterOverviewParams {
  range?: string;
  from?: string | null;
  to?: string | null;
  storeId?: string;
}

export async function getCallCenterOverview(params?: CallCenterOverviewParams) {
  const res = await api.get('/commerce/call-center/overview', { params });
  return res.data.callCenter as CallCenterOverviewDTO;
}
