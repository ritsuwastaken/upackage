import { ArchiveError, Reader } from "@ritsuwastaken/farchive";
import { lazyClasses, maxTextureHeader, textureCompressionVersion } from "./constants.ts";
import { PackageError } from "./error.ts";
import { className, path } from "./objects.ts";
import { readProperties } from "./properties.ts";
import type { Export, ObjectRef, Package, Relocator } from "./types.ts";

const mipTail = 4 + 4 + 1 + 1;

const shiftLazyArray = (pkg: Package, ref: ObjectRef, reader: Reader, out: DataView, from: number, to: number) => {
  const at = reader.offset;
  const saved = reader.i32();
  reader.index();
  const end = saved - from;
  if (end < reader.offset || end > reader.bytes.length) throw new PackageError(`${path(pkg, ref)} has a lazy array at ${at} that ends at ${saved}, outside its data`, at);
  out.setInt32(at, saved + to - from, true);
  reader.offset = end;
};

const relocate = (pkg: Package, ref: ObjectRef, data: Uint8Array, from: number, to: number, body: (reader: Reader, shift: () => void, properties: ReturnType<typeof readProperties>) => void, trailing = false) => {
  const out = data.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const properties = readProperties(pkg, data);
  const reader = new Reader(data, { offset: properties.end });
  body(reader, () => shiftLazyArray(pkg, ref, reader, view, from, to), properties);
  if (!trailing && reader.offset !== data.length) throw new PackageError(`${path(pkg, ref)} has ${data.length - reader.offset} unexpected bytes after its lazy arrays`, reader.offset);
  return out;
};

const textureLayout = (header: number): Relocator => (pkg, ref, data, from, to) =>
  relocate(pkg, ref, data, from, to, (reader, shift, properties) => {
    reader.skip(header);
    const compressed = pkg.version < textureCompressionVersion && properties.properties.some((property) => property.name === "bHasComp" && property.value === true);
    for (let list = compressed ? 2 : 1; list > 0; list--) {
      const mips = reader.index();
      if (header > 0 && mips === 0) throw new PackageError(`${path(pkg, ref)} has no mipmaps after a ${header}-byte header`, reader.offset);
      for (let i = 0; i < mips; i++) {
        shift();
        reader.skip(mipTail);
      }
    }
  });

export const relocateTexture: Relocator = (pkg, ref, data, from, to) => {
  let failure: unknown;
  for (let header = 0; header <= maxTextureHeader; header++) {
    try {
      return textureLayout(header)(pkg, ref, data, from, to);
    } catch (error) {
      if (!(error instanceof PackageError) && !(error instanceof ArchiveError)) throw error;
      failure ??= error;
    }
  }
  throw failure;
};

export const relocateSound: Relocator = (pkg, ref, data, from, to) =>
  relocate(
    pkg,
    ref,
    data,
    from,
    to,
    (reader, shift) => {
      reader.index();
      shift();
    },
    true,
  );

export const relocators: Readonly<Record<string, Relocator>> = { Texture: relocateTexture, Sound: relocateSound };

export function placeExport(pkg: Package, ref: ObjectRef, entry: Export, to: number, custom: Readonly<Record<string, Relocator>> = {}): Uint8Array {
  const from = entry.offset;
  if (from === undefined || from === to || entry.data.length === 0) return entry.data;
  const name = className(pkg, ref);
  const relocator = custom[name] ?? relocators[name];
  if (relocator) return relocator(pkg, ref, entry.data, from, to);
  if (lazyClasses.includes(name)) throw new PackageError(`${path(pkg, ref)} (${name}) would move from ${from} to ${to}, but its lazy arrays can't be relocated`);
  return entry.data;
}
