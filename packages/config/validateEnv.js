import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findWorkspaceRoot(startDir) {
    let dir = startDir;
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return startDir;
}

const workspaceRoot = findWorkspaceRoot(__dirname);
const nodeEnv = process.env.NODE_ENV || 'development';

const envFiles = [
    `.env.${nodeEnv}.local`,
    `.env.local`,
    `.env.${nodeEnv}`,
    '.env'
];

for (const file of envFiles) {
    const filePath = path.resolve(workspaceRoot, file);
    if (fs.existsSync(filePath)) {
        config({ path: filePath });
    }
}

const envSchema = z.object({
    PORT: z.string().optional(),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    NODE_ENV: z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}
export const env = parsed.data;

