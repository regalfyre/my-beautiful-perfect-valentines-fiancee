// scripts/generate-manifests.mjs
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const PHOTO_DIR = path.join(ROOT, "assets", "photos");
const POEM_DIR  = path.join(ROOT, "assets", "poems");
const OUT_DIR   = path.join(ROOT, "data");

const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir) {
  const out = [];
  if (!(await exists(dir))) return out;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(full));
    else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (exts.has(ext)) out.push(full);
    }
  }
  return out;
}

function toWebPath(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join("/");
  return "./" + rel.split("/").map(encodeURIComponent).join("/");
}

function sortNice(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function writeJSON(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function main() {
  const photosAbs = (await walk(PHOTO_DIR))
    .filter(p => path.basename(p).toLowerCase() !== "placeholder.txt");

  const poemsAbs = (await walk(POEM_DIR))
    .filter(p => path.basename(p).toLowerCase() !== "placeholder.txt");

  const photos = photosAbs.map(toWebPath).sort(sortNice).map(url => ({ url }));
  const poems  = poemsAbs.map(toWebPath).sort(sortNice).map(url => ({ url }));

  await writeJSON(path.join(OUT_DIR, "photos.json"), { photos });
  await writeJSON(path.join(OUT_DIR, "poems.json"), { poems });

  console.log(`Generated data/photos.json (${photos.length})`);
  console.log(`Generated data/poems.json (${poems.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
