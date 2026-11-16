import { PackageError } from "./error.ts";
import { className, nameOf, objectName, path, readTextBuffer, writeTextBuffer } from "./objects.ts";
import type { Package, ScriptText } from "./types.ts";

const scriptTextExports = (pkg: Package) =>
  pkg.exports.flatMap((entry, i) => {
    const ref = i + 1;
    if (className(pkg, ref) !== "TextBuffer" || nameOf(pkg, entry.name) !== "ScriptText" || entry.outer === 0) return [];
    return [{ ref, owner: entry.outer }];
  });

export function scriptTexts(pkg: Package): ScriptText[] {
  return scriptTextExports(pkg).map(({ ref, owner }) => ({
    class: objectName(pkg, owner),
    path: path(pkg, owner),
    text: readTextBuffer(pkg, pkg.exports[ref - 1]!.data).text,
  })).filter((entry) => entry.text !== "");
}

export function setScriptText(pkg: Package, classPath: string, text: string): void {
  const lower = classPath.toLowerCase();
  const found = scriptTextExports(pkg).find(({ owner }) => path(pkg, owner).toLowerCase() === lower || objectName(pkg, owner).toLowerCase() === lower);
  if (!found) throw new PackageError(`No script text for ${classPath}`);
  const entry = pkg.exports[found.ref - 1]!;
  const current = readTextBuffer(pkg, entry.data);
  entry.data = writeTextBuffer(pkg, { ...current, text }, entry.data);
}

export function stripScriptText(pkg: Package): number {
  const list = scriptTextExports(pkg);
  for (const { ref } of list) {
    const entry = pkg.exports[ref - 1]!;
    entry.data = writeTextBuffer(pkg, { pos: 0, top: 0, text: "" }, entry.data);
  }
  return list.length;
}
