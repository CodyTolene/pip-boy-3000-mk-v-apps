import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { minify } from 'terser';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const watchMode = process.argv.includes('--watch');

const rootDir = path.resolve(__dirname, '..');
const sourceDirs = ['apps', 'games'].map((d) => path.join(rootDir, d));
const allFiles = [];

function findJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findJsFiles(fullPath);
    } else if (
      entry.isFile() &&
      path.extname(entry.name) === '.js' &&
      !entry.name.endsWith('.min.js')
    ) {
      allFiles.push({
        name: path.relative(rootDir, fullPath),
        path: fullPath,
        output: path.join(
          path.dirname(fullPath),
          path.basename(fullPath, '.js') + '.min.js',
        ),
      });
    }
  }
}

for (const dir of sourceDirs) {
  if (fs.existsSync(dir)) {
    findJsFiles(dir);
  }
}

if (allFiles.length === 0) {
  console.log('No JavaScript files found in apps/ or games/.');
  process.exit(0);
}

let selected = 0;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
readline.emitKeypressEvents(process.stdin, rl);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

function render() {
  console.clear();
  const action = watchMode ? 'watch and minify on change' : 'minify';
  console.log(`Select a file to ${action}:\n`);
  allFiles.forEach((f, i) => {
    console.log(`${i === selected ? '>' : ' '} ${f.name}`);
  });
}

async function minifyFile(inputPath, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] Minifying ${inputPath}...`);
  try {
    const code = fs.readFileSync(inputPath, 'utf8');
    const result = await minify(code, { compress: true, mangle: true });
    fs.writeFileSync(output, result.code, 'utf8');
    console.log(`[${ts}] Done: ${output}\n`);
  } catch (e) {
    console.error(`[${ts}] Failed: ${e.message}`);
  }
}

render();

process.stdin.on('keypress', (str, key) => {
  if (key.name === 'up') {
    selected = (selected + allFiles.length - 1) % allFiles.length;
    render();
  } else if (key.name === 'down') {
    selected = (selected + 1) % allFiles.length;
    render();
  } else if (key.name === 'return') {
    const { path: inputPath, output } = allFiles[selected];
    rl.close();

    if (watchMode) {
      console.log(
        `\nWatching ${inputPath} for changes... Press CTRL+C to stop.`,
      );
      minifyFile(inputPath, output);
      fs.watchFile(inputPath, { interval: 300 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
          minifyFile(inputPath, output);
        }
      });
      process.on('SIGINT', () => {
        console.log('\nStopping watcher.');
        fs.unwatchFile(inputPath);
        process.exit(0);
      });
    } else {
      minifyFile(inputPath, output).then(() => {
        console.log('Minification complete.');
        process.exit(0);
      });
    }
  } else if (key.ctrl && key.name === 'c') {
    console.log('\nExiting.');
    rl.close();
    process.exit(0);
  }
});
