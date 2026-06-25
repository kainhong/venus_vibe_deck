import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const envFiles = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
];

for (const path of envFiles) {
  if (existsSync(path)) {
    loadDotenv({ path, override: false });
  }
}
