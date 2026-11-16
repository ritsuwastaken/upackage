import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { packageTag } from "@ritsuwastaken/farchive";
import { addName, build, className, objectProperties, parse, readProperties, setObjectProperties, writeProperties, type Package, type Property } from "../src/index.ts";

const empty = (): Package => {
  const pkg: Package = { version: 123, licensee: 0, flags: 1, guid: new Uint8Array(16), generations: [{ exports: 0, names: 0 }], names: [], imports: [], exports: [], trailer: new Uint8Array() };
  addName(pkg, "None");
  return pkg;
};

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const sample: Property[] = [
  { name: "Count", arrayIndex: 0, type: "int", value: 7 },
  { name: "Scale", arrayIndex: 0, type: "float", value: 1.5 },
  { name: "Mode", arrayIndex: 0, type: "byte", value: 3 },
  { name: "bHidden", arrayIndex: 0, type: "bool", value: true },
  { name: "bOff", arrayIndex: 0, type: "bool", value: false },
  { name: "Tag", arrayIndex: 0, type: "name", value: "Door" },
  { name: "Title", arrayIndex: 0, type: "str", value: "Привет" },
  { name: "Owner", arrayIndex: 0, type: "object", value: -3 },
  { name: "Slots", arrayIndex: 2, type: "int", value: 9 },
  { name: "Slots", arrayIndex: 300, type: "int", value: 10 },
  { name: "Slots", arrayIndex: 70000, type: "int", value: 11 },
  { name: "Location", arrayIndex: 0, type: "struct", struct: "Vector", value: { x: 1, y: 2, z: 3 } },
  { name: "Rotation", arrayIndex: 0, type: "struct", struct: "Rotator", value: { pitch: 1, yaw: -2, roll: 3 } },
  { name: "Tint", arrayIndex: 0, type: "struct", struct: "Color", value: { b: 1, g: 2, r: 3, a: 4 } },
  { name: "Range", arrayIndex: 0, type: "struct", struct: "RangeVector", value: [{ name: "Min", arrayIndex: 0, type: "float", value: -1 }, { name: "Max", arrayIndex: 0, type: "float", value: 1 }] },
  { name: "Items", arrayIndex: 0, type: "array", value: new Uint8Array([2, 1, 2]) },
  { name: "Long", arrayIndex: 0, type: "str", value: "x".repeat(400) },
];

test("properties round-trip", () => {
  const pkg = empty();
  const bytes = writeProperties(pkg, sample);
  const read = readProperties(pkg, bytes);
  assert.deepEqual(read.properties, sample);
  assert.equal(read.end, bytes.length);
  assert.deepEqual(writeProperties(pkg, read.properties, read.none), bytes);
});

test("tags follow the engine encoding", () => {
  const pkg = empty();
  const count = addName(pkg, "Count");
  const flag = addName(pkg, "bOn");
  assert.equal(hex(writeProperties(pkg, [{ name: "Count", arrayIndex: 0, type: "int", value: 1 }])), `${count.toString(16).padStart(2, "0")}220100000000`);
  assert.equal(hex(writeProperties(pkg, [{ name: "bOn", arrayIndex: 0, type: "bool", value: true }])), `${flag.toString(16).padStart(2, "0")}d30000`);
  assert.equal(hex(writeProperties(pkg, [{ name: "bOn", arrayIndex: 0, type: "bool", value: false }])), `${flag.toString(16).padStart(2, "0")}530000`);
  assert.equal(hex(writeProperties(pkg, [{ name: "Count", arrayIndex: 5, type: "int", value: 1 }])), `${count.toString(16).padStart(2, "0")}a2050100000000`);
});

test("values that don't decode stay raw", () => {
  const pkg = empty();
  const bytes = writeProperties(pkg, [{ name: "Odd", arrayIndex: 0, type: "byte", value: new Uint8Array([1, 2]) }]);
  assert.deepEqual(readProperties(pkg, bytes).properties, [{ name: "Odd", arrayIndex: 0, type: "byte", value: new Uint8Array([1, 2]) }]);
});

test("object properties keep the data around them", () => {
  const pkg = empty();
  const core = addName(pkg, "Core");
  pkg.imports.push({ classPackage: core, className: addName(pkg, "Class"), outer: 0, name: addName(pkg, "Thing") });
  const tail = new Uint8Array([9, 9, 9]);
  const stack = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const props = writeProperties(pkg, [{ name: "Count", arrayIndex: 0, type: "int", value: 1 }]);
  pkg.exports.push({ class: -1, super: 0, outer: 0, name: addName(pkg, "A"), flags: 0x02000000, data: new Uint8Array([...stack, ...props, ...tail]) });
  const read = objectProperties(pkg, 1);
  assert.equal(read.start, stack.length);
  assert.deepEqual(read.properties, [{ name: "Count", arrayIndex: 0, type: "int", value: 1 }]);
  setObjectProperties(pkg, 1, [{ name: "Count", arrayIndex: 0, type: "int", value: 2 }, { name: "Mode", arrayIndex: 0, type: "byte", value: 1 }]);
  const back = parse(build(pkg));
  assert.deepEqual(objectProperties(back, 1).properties, [{ name: "Count", arrayIndex: 0, type: "int", value: 2 }, { name: "Mode", arrayIndex: 0, type: "byte", value: 1 }]);
  assert.deepEqual(back.exports[0]!.data.subarray(0, stack.length), stack);
  assert.deepEqual(back.exports[0]!.data.subarray(-3), tail);
});

const folder = process.env.UPACKAGE_FILES;
test("real object properties rewrite byte for byte", { skip: !folder || !existsSync(folder) }, () => {
  for (const file of readdirSync(folder!)) {
    const bytes = new Uint8Array(readFileSync(join(folder!, file)));
    if (bytes.length < 4 || new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) !== packageTag) continue;
    const pkg = parse(bytes);
    pkg.exports.forEach((entry, i) => {
      if (className(pkg, i + 1) === "Class") return;
      const read = objectProperties(pkg, i + 1);
      assert.deepEqual(writeProperties(pkg, read.properties, read.none), entry.data.subarray(read.start, read.end), `${file} export ${i + 1}`);
    });
  }
});
