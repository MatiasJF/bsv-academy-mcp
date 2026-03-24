import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { KnowledgeBase } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Look for KB in multiple locations
function getKbPaths(): string[] {
  return [
    resolve(process.cwd(), 'data/knowledge-base.json'),
    resolve(__dirname, '../data/knowledge-base.json'),
    resolve(__dirname, '../../data/knowledge-base.json'),
  ];
}

export async function loadKnowledgeBase(): Promise<KnowledgeBase | null> {
  for (const path of getKbPaths()) {
    try {
      if (existsSync(path)) {
        const data = await readFile(path, 'utf-8');
        return JSON.parse(data) as KnowledgeBase;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function saveKnowledgeBase(kb: KnowledgeBase): Promise<string> {
  const path = resolve(process.cwd(), 'data/knowledge-base.json');
  const dir = dirname(path);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, JSON.stringify(kb, null, 2), 'utf-8');
  return path;
}
