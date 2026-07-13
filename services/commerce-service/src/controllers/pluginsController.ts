import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { PLUGIN_MODULES, type ModuleKey } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export async function getInstalledPlugins(req: AuthenticatedRequest, res: Response) {
  const business = await getDb()
    .collection('businesses')
    .findOne({ _id: new ObjectId(req.user!.tenantId!) }, { projection: { installedPlugins: 1 } });
  res.status(200).json({ success: true, installedPlugins: business?.installedPlugins ?? [] });
}

export async function updateInstalledPlugins(req: AuthenticatedRequest, res: Response) {
  const requested: unknown = req.body?.plugins;
  if (!Array.isArray(requested) || !requested.every((p) => typeof p === 'string')) {
    res.status(400).json({ success: false, message: 'plugins must be an array of plugin keys' });
    return;
  }
  const installedPlugins = (requested as string[]).filter((p): p is ModuleKey =>
    PLUGIN_MODULES.includes(p as ModuleKey)
  );
  await getDb()
    .collection('businesses')
    .updateOne({ _id: new ObjectId(req.user!.tenantId!) }, { $set: { installedPlugins } });
  res.status(200).json({ success: true, installedPlugins });
}
