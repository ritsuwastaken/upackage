import { Reader, Writer } from "@ritsuwastaken/farchive";
import { arrayIndex, binaryStructs, defaultNameFlags, objectFlags, propertyTag, propertyTypes, taggedStructsSince } from "./constants.ts";
import { PackageError } from "./error.ts";
import { className, nameOf } from "./objects.ts";
import type { Color, ObjectProperties, ObjectRef, Package, Property, PropertyList, PropertyType, Rotator, Vector } from "./types.ts";

const exactName = (pkg: Package, name: string): number => {
  const exact = pkg.names.findIndex((entry) => entry.name === name);
  if (exact >= 0) return exact;
  const loose = pkg.names.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (loose >= 0) return loose;
  pkg.names.push({ name, flags: defaultNameFlags });
  return pkg.names.length - 1;
};

const readName = (pkg: Package, reader: Reader) => nameOf(pkg, reader.index());

const readArrayIndex = (reader: Reader): number => {
  const b = reader.u8();
  if (!(b & arrayIndex.twoFlag)) return b;
  if ((b & arrayIndex.fourFlag) === arrayIndex.twoFlag) return ((b & arrayIndex.twoMask) << 8) | reader.u8();
  return ((b & arrayIndex.fourMask) << 24) | (reader.u8() << 16) | (reader.u8() << 8) | reader.u8();
};

const writeArrayIndex = (writer: Writer, value: number) => {
  if (value <= arrayIndex.oneMax) writer.u8(value);
  else if (value <= arrayIndex.twoMax) {
    writer.u8((value >> 8) | arrayIndex.one);
    writer.u8(value & 0xff);
  } else {
    writer.u8((value >>> 24) | arrayIndex.two);
    writer.u8((value >> 16) & 0xff);
    writer.u8((value >> 8) & 0xff);
    writer.u8(value & 0xff);
  }
};

const readBinaryStruct = (struct: string, reader: Reader): Vector | Rotator | Color => {
  if (struct === "Vector") return { x: reader.f32(), y: reader.f32(), z: reader.f32() };
  if (struct === "Rotator") return { pitch: reader.i32(), yaw: reader.i32(), roll: reader.i32() };
  return { b: reader.u8(), g: reader.u8(), r: reader.u8(), a: reader.u8() };
};

const readValue = (pkg: Package, reader: Reader, type: PropertyType, struct: string, size: number, none: number): Property["value"] => {
  switch (type) {
    case "byte":
      return size === 1 ? reader.u8() : reader.take(size);
    case "int":
      return reader.i32();
    case "float":
      return reader.f32();
    case "object":
    case "class":
      return reader.index();
    case "name":
      return readName(pkg, reader);
    case "str":
      return reader.str();
    case "struct":
      if (binaryStructs.includes(struct)) return readBinaryStruct(struct, reader);
      if (pkg.version < taggedStructsSince) return reader.take(size);
      return readList(pkg, reader, none).properties;
    default:
      return reader.take(size);
  }
};

const readList = (pkg: Package, reader: Reader, none = -1): PropertyList => {
  const properties: Property[] = [];
  for (;;) {
    const at = reader.offset;
    const nameIndex = reader.index();
    const name = nameOf(pkg, nameIndex);
    if (name === "None") return { properties, none: nameIndex };
    const packed = reader.u8();
    const type = propertyTypes[packed & propertyTag.type];
    if (!type) throw new PackageError(`Unknown property type ${packed & propertyTag.type} for ${name}`, at);
    const struct = type === "struct" ? readName(pkg, reader) : "";
    const code = packed & propertyTag.size.info;
    const length = code === propertyTag.size.byte ? reader.u8() : code === propertyTag.size.word ? reader.u16() : code === propertyTag.size.int ? reader.i32() : propertyTag.size.codes[code >> 4]!;
    const index = packed & propertyTag.array && type !== "bool" ? readArrayIndex(reader) : 0;
    const start = reader.offset;
    if (type === "bool") {
      properties.push({ name, arrayIndex: index, type, value: (packed & propertyTag.array) !== 0 });
      continue;
    }
    let value = readValue(pkg, reader, type, struct, length, none);
    if (reader.offset !== start + length) {
      reader.seek(start);
      value = reader.take(length);
    }
    properties.push({ name, arrayIndex: index, type, ...(type === "struct" ? { struct } : {}), value } as Property);
  }
};

export function readProperties(pkg: Package, data: Uint8Array, offset = 0): PropertyList & { end: number } {
  const reader = new Reader(data, { offset });
  const list = readList(pkg, reader);
  return { ...list, end: reader.offset };
}

const writeBinaryStruct = (writer: Writer, value: Vector | Rotator | Color) => {
  if ("x" in value) [value.x, value.y, value.z].forEach((part) => writer.f32(part));
  else if ("pitch" in value) [value.pitch, value.yaw, value.roll].forEach((part) => writer.i32(part));
  else [value.b, value.g, value.r, value.a].forEach((part) => writer.u8(part));
};

const writeValue = (pkg: Package, writer: Writer, property: Property, none: number) => {
  const { value } = property;
  if (value instanceof Uint8Array) return writer.bytes(value);
  switch (property.type) {
    case "byte":
      return writer.u8(property.value);
    case "int":
      return writer.i32(property.value);
    case "float":
      return writer.f32(property.value);
    case "object":
    case "class":
      return writer.index(property.value);
    case "name":
      return writer.index(exactName(pkg, property.value));
    case "str":
      return writer.str(property.value);
    case "struct":
      if (Array.isArray(property.value)) return writeList(pkg, writer, property.value, none);
      return writeBinaryStruct(writer, property.value as Vector | Rotator | Color);
  }
};

const sizeCode = (length: number) => {
  const fixed = propertyTag.size.codes.indexOf(length as (typeof propertyTag.size.codes)[number]);
  if (fixed >= 0) return fixed << 4;
  return length <= 0xff ? propertyTag.size.byte : length <= 0xffff ? propertyTag.size.word : propertyTag.size.int;
};

const writeList = (pkg: Package, writer: Writer, properties: readonly Property[], none: number) => {
  for (const property of properties) {
    const body = new Writer({ version: pkg.version });
    if (property.type !== "bool") writeValue(pkg, body, property, none);
    const bytes = body.result();
    const id = propertyTypes.indexOf(property.type);
    const flagged = property.type === "bool" ? property.value : property.arrayIndex > 0;
    const code = sizeCode(bytes.length);
    writer.index(exactName(pkg, property.name));
    writer.u8(id | code | (flagged ? propertyTag.array : 0));
    if (property.type === "struct") writer.index(exactName(pkg, property.struct));
    if (code === propertyTag.size.byte) writer.u8(bytes.length);
    else if (code === propertyTag.size.word) writer.u16(bytes.length);
    else if (code === propertyTag.size.int) writer.i32(bytes.length);
    if (property.arrayIndex > 0 && property.type !== "bool") writeArrayIndex(writer, property.arrayIndex);
    writer.bytes(bytes);
  }
  writer.index(none);
};

export function writeProperties(pkg: Package, properties: readonly Property[], none = exactName(pkg, "None")): Uint8Array {
  const writer = new Writer({ version: pkg.version });
  writeList(pkg, writer, properties, none);
  return writer.result();
}

const stackSize = (data: Uint8Array): number => {
  const reader = new Reader(data);
  const node = reader.index();
  reader.index();
  reader.u64();
  reader.i32();
  if (node !== 0) reader.index();
  return reader.offset;
};

export function objectProperties(pkg: Package, ref: ObjectRef): ObjectProperties {
  const entry = pkg.exports[ref - 1];
  if (!entry) throw new PackageError(`Object ${ref} is not an export`);
  if (className(pkg, ref) === "Class") throw new PackageError(`${nameOf(pkg, entry.name)} is a class; its properties come after the class data`);
  const start = entry.flags & objectFlags.hasStack ? stackSize(entry.data) : 0;
  const { properties, none, end } = readProperties(pkg, entry.data, start);
  return { properties, none, start, end };
}

export function setObjectProperties(pkg: Package, ref: ObjectRef, properties: readonly Property[]): void {
  const entry = pkg.exports[ref - 1]!;
  const current = objectProperties(pkg, ref);
  const body = writeProperties(pkg, properties, current.none);
  const data = new Uint8Array(current.start + body.length + entry.data.length - current.end);
  data.set(entry.data.subarray(0, current.start));
  data.set(body, current.start);
  data.set(entry.data.subarray(current.end), current.start + body.length);
  entry.data = data;
}
