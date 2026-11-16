import { ArchiveError, packageTag, Reader, versions, Writer } from "@ritsuwastaken/farchive";
import { minVersion } from "./constants.ts";
import { PackageError } from "./error.ts";
import type { Package } from "./types.ts";

const count = (reader: Reader, value: number, what: string, at: number) => {
  if (value < 0 || value > reader.bytes.length) throw new PackageError(`Invalid ${what} count ${value}`, at);
  return value;
};

export function parse(bytes: Uint8Array): Package {
  try {
    return read(bytes);
  } catch (error) {
    if (error instanceof ArchiveError && !(error instanceof PackageError)) throw new PackageError(error.detail, error.offset);
    throw error;
  }
}

function read(bytes: Uint8Array): Package {
  const reader = new Reader(bytes);
  if (reader.u32() !== packageTag) throw new PackageError("Not a package file", 0);
  const version = reader.u16();
  const licensee = reader.u16();
  const flags = reader.u32();
  const nameCount = count(reader, reader.i32(), "name", 12);
  const nameOffset = reader.i32();
  const exportCount = count(reader, reader.i32(), "export", 20);
  const exportOffset = reader.i32();
  const importCount = count(reader, reader.i32(), "import", 28);
  const importOffset = reader.i32();
  if (version < minVersion || version >= versions.int32Indexes) throw new PackageError(`Package version ${version} is not supported`);
  const guid = reader.take(16);
  const generations = Array.from({ length: count(reader, reader.i32(), "generation", reader.offset - 4) }, () => ({ exports: reader.i32(), names: reader.i32() }));

  reader.offset = nameOffset;
  const names = Array.from({ length: nameCount }, () => ({ name: reader.str(), flags: reader.u32() }));

  reader.offset = importOffset;
  const imports = Array.from({ length: importCount }, () => ({ classPackage: reader.index(), className: reader.index(), outer: reader.i32(), name: reader.index() }));

  reader.offset = exportOffset;
  const exports = Array.from({ length: exportCount }, () => {
    const entry = { class: reader.index(), super: reader.index(), outer: reader.i32(), name: reader.index(), flags: reader.u32() };
    const size = reader.index();
    const offset = size > 0 ? reader.index() : 0;
    if (size < 0 || offset < 0 || offset + size > bytes.length) throw new PackageError(`Export data out of range (${offset}+${size})`, reader.offset);
    return { ...entry, data: bytes.slice(offset, offset + size) };
  });
  const end = Math.max(reader.offset, importOffset, nameOffset);
  const trailer = bytes.slice(end);
  const check = (index: number, what: string) => {
    if (index < 0 || index >= names.length) throw new PackageError(`${what} refers to name ${index}, but the package has ${names.length}`);
  };
  imports.forEach((entry, i) => [entry.classPackage, entry.className, entry.name].forEach((index) => check(index, `Import ${i}`)));
  exports.forEach((entry, i) => check(entry.name, `Export ${i}`));
  return { version, licensee, flags, guid, generations, names, imports, exports, trailer };
}

export function build(pkg: Package): Uint8Array {
  const writer = new Writer();
  writer.u32(packageTag);
  writer.u16(pkg.version);
  writer.u16(pkg.licensee);
  writer.u32(pkg.flags);
  const at = writer.length;
  for (let i = 0; i < 6; i++) writer.i32(0);
  writer.bytes(pkg.guid ?? new Uint8Array(16));
  const generations = pkg.generations.length ? pkg.generations.slice() : [{ exports: 0, names: 0 }];
  generations[generations.length - 1] = { exports: pkg.exports.length, names: pkg.names.length };
  writer.i32(generations.length);
  for (const generation of generations) {
    writer.i32(generation.exports);
    writer.i32(generation.names);
  }
  const nameOffset = writer.length;
  for (const entry of pkg.names) {
    writer.str(entry.name);
    writer.u32(entry.flags);
  }
  const offsets = pkg.exports.map((entry) => {
    const offset = writer.length;
    writer.bytes(entry.data);
    return offset;
  });
  const importOffset = writer.length;
  for (const entry of pkg.imports) {
    writer.index(entry.classPackage);
    writer.index(entry.className);
    writer.i32(entry.outer);
    writer.index(entry.name);
  }
  const exportOffset = writer.length;
  pkg.exports.forEach((entry, i) => {
    writer.index(entry.class);
    writer.index(entry.super);
    writer.i32(entry.outer);
    writer.index(entry.name);
    writer.u32(entry.flags);
    writer.index(entry.data.length);
    if (entry.data.length > 0) writer.index(offsets[i]!);
  });
  writer.bytes(pkg.trailer);
  [pkg.names.length, nameOffset, pkg.exports.length, exportOffset, pkg.imports.length, importOffset].forEach((value, i) => writer.patchI32(at + i * 4, value));
  return writer.result();
}
