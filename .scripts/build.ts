import { promises as fs } from 'node:fs';
import path from 'node:path';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type Metadata = {
  id?: string;
  name?: string;
  author?: string;
  version?: string;
  description?: string;
  icon?: string;
  previews?: string[];
  tags?: string;
  type?: string;
  readme?: string;
  storage?: JsonValue[];
  storageOptional?: JsonValue[];
  [key: string]: JsonValue | undefined;
};

const rootDir = process.cwd();

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function joinWebPath(...parts: string[]): string {
  return normalizePath(parts.join('/').replaceAll(/\/+/g, '/'));
}

function isRelativeAssetPath(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !/^[a-z]+:/i.test(value);
}

function prefixAssetPath(
  value: string | undefined,
  entryDir: string,
): string | undefined {
  if (value === undefined || !isRelativeAssetPath(value)) {
    return value;
  }

  return joinWebPath(entryDir, value);
}

function rewriteStorage(
  storage: JsonValue[] | undefined,
  entryDir: string,
): JsonValue[] | undefined {
  if (!storage) {
    return storage;
  }

  return storage.map((item) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') {
      return item;
    }

    const url = item.url;
    if (typeof url !== 'string') {
      return item;
    }

    const prefixedUrl = prefixAssetPath(url, entryDir);
    return {
      ...item,
      url: prefixedUrl,
    } as JsonValue;
  });
}

async function findMetadataFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return findMetadataFiles(fullPath);
      }

      return entry.isFile() && entry.name === 'metadata.json' ? [fullPath] : [];
    }),
  );

  return files.flat();
}

function byNameOrId(a: Metadata, b: Metadata): number {
  const left = (a.name ?? a.id ?? '').toLowerCase();
  const right = (b.name ?? b.id ?? '').toLowerCase();
  return left.localeCompare(right);
}

async function buildCatalog(directoryName: string): Promise<number> {
  const sectionDir = path.join(rootDir, directoryName);
  const metadataFiles = await findMetadataFiles(sectionDir);
  const entries = await Promise.all(
    metadataFiles.map(async (filePath) => {
      const raw = await fs.readFile(filePath, 'utf8');
      const metadata = JSON.parse(raw) as Metadata;
      const entryDir = normalizePath(
        path.relative(sectionDir, path.dirname(filePath)),
      );

      return {
        ...metadata,
        icon: prefixAssetPath(metadata.icon, entryDir),
        previews: metadata.previews?.map((preview) =>
          prefixAssetPath(preview, entryDir),
        ),
        readme: prefixAssetPath(metadata.readme, entryDir),
        storage: rewriteStorage(metadata.storage, entryDir),
        storageOptional: rewriteStorage(metadata.storageOptional, entryDir),
      } as Metadata;
    }),
  );

  await fs.writeFile(
    path.join(sectionDir, `${directoryName}.json`),
    `${JSON.stringify(entries.sort(byNameOrId), null, 2)}\n`,
    'utf8',
  );

  return entries.length;
}

async function main(): Promise<void> {
  const [appCount, gameCount] = await Promise.all([
    buildCatalog('apps'),
    buildCatalog('games'),
  ]);

  process.stdout.write(
    `Wrote ${appCount} apps to apps/apps.json and ${gameCount} games to games/games.json.\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
