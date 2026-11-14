// Genera out/precache-manifest.js con todos los archivos de la exportación estática.
import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const OUT = "out";
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(OUT);
const skip = /(sw\.js|precache-manifest\.js|\.map|404\.html|_not-found)/;
const urls = [];
const hash = createHash("sha1");
for (const f of files) {
  const rel = "/" + relative(OUT, f).split("\\").join("/");
  if (skip.test(rel)) continue;
  hash.update(rel + statSync(f).size);
  if (rel.endsWith("/index.html")) urls.push(rel.slice(0, -"index.html".length));
  else urls.push(rel);
}
const version = hash.digest("hex").slice(0, 10);
writeFileSync(join(OUT, "precache-manifest.js"), `self.__REB_VERSION=${JSON.stringify(version)};self.__REB_PRECACHE=${JSON.stringify(urls)};\n`);
console.log(`precache: ${urls.length} archivos, versión ${version}`);
