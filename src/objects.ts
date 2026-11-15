import { Reader, Writer } from "@ritsuwastaken/farchive";
import { PackageError } from "./error.ts";
import type { Export, Import, Package } from "./package.ts";

export type ObjectRef = number;

export const nameOf = (pkg: Package, index: number): string => {
  const entry = pkg.names[index];
  if (!entry) throw new PackageError(`Name ${index} is out of range (${pkg.names.length} names)`);
  return entry.name;
};

export const resolve = (pkg: Package, ref: ObjectRef): Export | Import | null => {
  if (ref === 0) return null;
  const entry = ref > 0 ? pkg.exports[ref - 1] : pkg.imports[-ref - 1];
  if (!entry) throw new PackageError(`Object ${ref} is out of range`);
  return entry;
};

export const objectName = (pkg: Package, ref: ObjectRef): string => {
  const entry = resolve(pkg, ref);
  return entry ? nameOf(pkg, entry.name) : "None";
};

export const className = (pkg: Package, ref: ObjectRef): string => {
  if (ref < 0) return nameOf(pkg, pkg.imports[-ref - 1]!.className);
  const entry = resolve(pkg, ref) as Export | null;
  if (!entry) return "None";
  return entry.class === 0 ? "Class" : objectName(pkg, entry.class);
};

export const path = (pkg: Package, ref: ObjectRef): string => {
  const parts: string[] = [];
  for (let current = ref, depth = 0; current !== 0 && depth < 64; depth++) {
    const entry = resolve(pkg, current)!;
    parts.unshift(nameOf(pkg, entry.name));
    current = entry.outer;
  }
  return parts.join(".");
};

export const findExport = (pkg: Package, objectPath: string, type?: string): ObjectRef => {
  const lower = objectPath.toLowerCase();
  for (let i = 0; i < pkg.exports.length; i++) {
    const ref = i + 1;
    if (path(pkg, ref).toLowerCase() === lower && (type === undefined || className(pkg, ref).toLowerCase() === type.toLowerCase())) return ref;
  }
  return 0;
};

export const findName = (pkg: Package, name: string): number => pkg.names.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());

export const addName = (pkg: Package, name: string, flags = 0x70010): number => {
  const found = findName(pkg, name);
  if (found >= 0) return found;
  pkg.names.push({ name, flags });
  return pkg.names.length - 1;
};

export interface TextBuffer {
  pos: number;
  top: number;
  text: string;
}

const isNone = (pkg: Package, index: number) => nameOf(pkg, index) === "None";

export const readTextBuffer = (pkg: Package, data: Uint8Array): TextBuffer => {
  const reader = new Reader(data);
  if (!isNone(pkg, reader.index())) throw new PackageError("TextBuffer has properties, which is not supported");
  const pos = reader.i32();
  const top = reader.i32();
  const text = reader.str();
  if (reader.remaining) throw new PackageError(`TextBuffer has ${reader.remaining} unexpected bytes`);
  return { pos, top, text };
};

export const writeTextBuffer = (pkg: Package, value: TextBuffer, original?: Uint8Array): Uint8Array => {
  const writer = new Writer();
  const none = original ? new Reader(original).index() : pkg.names.findIndex((entry) => entry.name === "None");
  if (none < 0) throw new PackageError("The package has no None name");
  writer.index(none);
  writer.i32(value.pos);
  writer.i32(value.top);
  writer.str(value.text);
  return writer.result();
};
