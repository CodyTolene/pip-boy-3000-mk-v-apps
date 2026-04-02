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
  tags?: string;
  type?: string;
  readme?: string;
  custom?: string;
  storage?: JsonValue[];
  [key: string]: JsonValue | undefined;
};

type CatalogEntry = Metadata & {
  sourcePath: string;
};

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

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

async function readMetadata(filePath: string): Promise<CatalogEntry> {
  const raw = await fs.readFile(filePath, 'utf8');
  const metadata = JSON.parse(raw) as Metadata;

  return {
    ...metadata,
    sourcePath: path
      .relative(rootDir, path.dirname(filePath))
      .replaceAll('\\', '/'),
  };
}

function byNameOrId(a: CatalogEntry, b: CatalogEntry): number {
  const left = (a.name ?? a.id ?? '').toLowerCase();
  const right = (b.name ?? b.id ?? '').toLowerCase();
  return left.localeCompare(right);
}

async function writeCatalog(
  fileName: string,
  entries: CatalogEntry[],
): Promise<void> {
  const outputPath = path.join(rootDir, fileName);
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(entries, null, 2)}\n`,
    'utf8',
  );
}

async function main(): Promise<void> {
  const metadataFiles = await findMetadataFiles(srcDir);
  const entries = await Promise.all(metadataFiles.map(readMetadata));
  const sortedEntries = entries.sort(byNameOrId);

  const games = sortedEntries.filter((entry) => entry.tags === 'game');
  const apps = sortedEntries.filter((entry) => entry.tags !== 'game');

  await Promise.all([
    writeCatalog('games.json', games),
    writeCatalog('apps.json', apps),
  ]);

  process.stdout.write(
    `Wrote ${apps.length} apps to apps.json and ${games.length} games to games.json.\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
