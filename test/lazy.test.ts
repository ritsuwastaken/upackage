import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Writer } from "@ritsuwastaken/farchive";
import { addName, build, className, parse, PackageError, relocateSound, relocateTexture, type Package, type Relocator } from "../src/index.ts";

const packageWith = (cls: string): Package => {
  const pkg: Package = { version: 123, licensee: 0, flags: 1, guid: new Uint8Array(16), generations: [], names: [], imports: [], exports: [], trailer: new Uint8Array() };
  const none = addName(pkg, "None");
  const core = addName(pkg, "Core");
  const engine = addName(pkg, "Engine");
  pkg.imports.push({ classPackage: core, className: addName(pkg, "Package"), outer: 0, name: engine });
  pkg.imports.push({ classPackage: core, className: addName(pkg, "Class"), outer: -1, name: addName(pkg, cls) });
  pkg.exports.push({ class: 0, super: 0, outer: 0, name: addName(pkg, "Before"), flags: 0, data: new Uint8Array([1, 2, 3]) });
  pkg.exports.push({ class: -2, super: 0, outer: 0, name: addName(pkg, "Lazy"), flags: 0, data: new Uint8Array([none]) });
  return pkg;
};

const lazyArray = (writer: Writer, base: number, bytes: number[]) => {
  const at = writer.length;
  writer.i32(0);
  writer.index(bytes.length);
  bytes.forEach((byte) => writer.u8(byte));
  writer.patchI32(at, base + writer.length);
};

const texture = (base: number, mips: number[][], header = 0) => {
  const writer = new Writer();
  writer.index(0);
  for (let i = 0; i < header; i++) writer.u8(0);
  writer.index(mips.length);
  for (const mip of mips) {
    lazyArray(writer, base, mip);
    writer.i32(mip.length);
    writer.i32(1);
    writer.u8(0);
    writer.u8(0);
  }
  return writer.result();
};

const sound = (base: number, bytes: number[]) => {
  const writer = new Writer();
  writer.index(0);
  writer.index(0);
  lazyArray(writer, base, bytes);
  return writer.result();
};

const placed = (pkg: Package, make: (base: number) => Uint8Array) => {
  const base = parse(build(pkg)).exports[1]!.offset!;
  pkg.exports[1]!.data = make(base);
  return parse(build(pkg));
};

const lazyEnds = (data: Uint8Array, at: number[]) => at.map((offset) => new DataView(data.buffer, data.byteOffset).getInt32(offset, true));

test("moves texture mip offsets with the export", () => {
  const pkg = placed(packageWith("Texture"), (base) => texture(base, [[1, 2, 3, 4], [5]]));
  const before = pkg.exports[1]!;
  pkg.exports[0]!.data = new Uint8Array(13);
  const after = parse(build(pkg)).exports[1]!;
  assert.equal(after.offset! - before.offset!, 10);
  assert.deepEqual(lazyEnds(after.data, [2, 21]), lazyEnds(before.data, [2, 21]).map((end) => end + 10));
  assert.deepEqual(after.data, texture(after.offset!, [[1, 2, 3, 4], [5]]));
});

for (const header of [4, 42, 98]) {
  test(`moves textures with a ${header}-byte lineage 2 header`, () => {
    const pkg = placed(packageWith("Texture"), (base) => texture(base, [[1, 2, 3], [4]], header));
    pkg.exports[0]!.data = new Uint8Array(20);
    const after = parse(build(pkg)).exports[1]!;
    assert.deepEqual(after.data, texture(after.offset!, [[1, 2, 3], [4]], header));
  });
}

test("moves sound data offsets with the export", () => {
  const pkg = placed(packageWith("Sound"), (base) => sound(base, [9, 8, 7]));
  addName(pkg, "Shifts everything after the name table");
  const after = parse(build(pkg)).exports[1]!;
  assert.deepEqual(after.data, sound(after.offset!, [9, 8, 7]));
});

test("keeps lazy offsets when an export is copied to another package", () => {
  const source = placed(packageWith("Texture"), (base) => texture(base, [[1, 2]]));
  const target = packageWith("Texture");
  target.exports[0]!.data = new Uint8Array(500);
  target.exports[1] = { ...source.exports[1]!, name: target.exports[1]!.name };
  const copied = parse(build(target)).exports[1]!;
  assert.deepEqual(copied.data, texture(copied.offset!, [[1, 2]]));
});

test("keeps data a game appends after a sound's samples", () => {
  const extra = [0, 0, 0, 0, 255, 255, 255, 255];
  const pkg = placed(packageWith("Sound"), (base) => new Uint8Array([...sound(base, [1, 2]), ...extra]));
  pkg.exports[0]!.data = new Uint8Array(7);
  const after = parse(build(pkg)).exports[1]!;
  assert.deepEqual(after.data, new Uint8Array([...sound(after.offset!, [1, 2]), ...extra]));
});

test("refuses to move exports whose lazy arrays it can't relocate", () => {
  const pkg = placed(packageWith("SkeletalMesh"), () => new Uint8Array([0, 1, 2, 3]));
  assert.doesNotThrow(() => build(pkg));
  pkg.exports[0]!.data = new Uint8Array(4);
  assert.throws(() => build(pkg), (error) => error instanceof PackageError && /SkeletalMesh.*can't be relocated/.test(error.message));
  const custom: Relocator = (_pkg, _ref, data) => data;
  assert.doesNotThrow(() => build(pkg, { relocators: { SkeletalMesh: custom } }));
});

test("rejects lazy arrays that point outside their export", () => {
  const pkg = placed(packageWith("Texture"), () => texture(-1000, [[1]]));
  pkg.exports[0]!.data = new Uint8Array(4);
  assert.throws(() => build(pkg), PackageError);
});

const files = (process.env.UPACKAGE_FILES ?? "").split(":").filter((dir) => dir && existsSync(dir)).flatMap((dir) => readdirSync(dir).filter((file) => /\.(u|utx|uax|usx|ukx|unr)$/i.test(file)).map((file) => join(dir, file)));

test("relocates every texture and sound in real packages", { skip: files.length === 0 }, () => {
  let checked = 0;
  for (const file of files) {
    const bytes = readFileSync(file);
    let pkg: Package;
    try {
      pkg = parse(bytes);
    } catch {
      continue;
    }
    const lazy = pkg.exports.map((_, i) => i + 1).filter((ref) => ["Texture", "Sound"].includes(className(pkg, ref)));
    if (lazy.length === 0) continue;
    for (const ref of lazy) {
      const entry = pkg.exports[ref - 1]!;
      const relocate = className(pkg, ref) === "Texture" ? relocateTexture : relocateSound;
      assert.deepEqual(relocate(pkg, ref, entry.data, entry.offset!, entry.offset!), entry.data, file);
    }
    addName(pkg, "Shifts every export by this name");
    let moved: Package;
    try {
      moved = parse(build(pkg));
    } catch (error) {
      assert.ok(error instanceof PackageError && /can't be relocated/.test(error.message), `${file}: ${error}`);
      continue;
    }
    for (const ref of lazy) {
      const entry = moved.exports[ref - 1]!;
      const relocate = className(moved, ref) === "Texture" ? relocateTexture : relocateSound;
      assert.deepEqual(relocate(moved, ref, entry.data, entry.offset!, entry.offset!), entry.data, file);
      checked++;
    }
  }
  assert.ok(checked > 0);
  console.log(`relocated ${checked} textures and sounds`);
});
