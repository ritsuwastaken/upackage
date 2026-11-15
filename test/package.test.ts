import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { packageTag } from "@ritsuwastaken/farchive";
import { addName, build, className, findExport, parse, path, PackageError, scriptTexts, setScriptText, stripScriptText, writeTextBuffer, type Package } from "../src/index.ts";

const sample = (): Package => {
  const pkg: Package = {
    version: 123,
    licensee: 35,
    flags: 1,
    guid: new Uint8Array(16).fill(7),
    generations: [{ exports: 0, names: 0 }],
    names: [],
    imports: [],
    exports: [],
    trailer: new Uint8Array(),
  };
  const none = addName(pkg, "None");
  const core = addName(pkg, "Core");
  const pack = addName(pkg, "Package");
  const cls = addName(pkg, "Class");
  const textBuffer = addName(pkg, "TextBuffer");
  pkg.imports.push({ classPackage: core, className: pack, outer: 0, name: core });
  pkg.imports.push({ classPackage: core, className: cls, outer: -1, name: textBuffer });
  pkg.exports.push({ class: 0, super: 0, outer: 0, name: addName(pkg, "MyWnd"), flags: 0x40007, data: new Uint8Array([1, 2, 3]) });
  pkg.exports.push({ class: -2, super: 0, outer: 1, name: addName(pkg, "ScriptText"), flags: 0x400007, data: new Uint8Array() });
  pkg.exports[1]!.data = writeTextBuffer(pkg, { pos: 0, top: 0, text: "class MyWnd extends Object;\r\n" });
  void none;
  return pkg;
};

test("builds and parses a package", () => {
  const pkg = sample();
  const bytes = build(pkg);
  const back = parse(bytes);
  assert.deepEqual(back, { ...pkg, generations: [{ exports: 2, names: 7 }] });
  assert.deepEqual(build(back), bytes);
  assert.equal(path(back, 2), "MyWnd.ScriptText");
  assert.equal(className(back, 1), "Class");
  assert.equal(className(back, 2), "TextBuffer");
  assert.equal(findExport(back, "mywnd.scripttext"), 2);
});

test("reads and replaces script text", () => {
  const pkg = sample();
  assert.deepEqual(scriptTexts(pkg), [{ class: "MyWnd", path: "MyWnd", text: "class MyWnd extends Object;\r\n" }]);
  const long = `class MyWnd extends Object;\r\n${"// é Привет\r\n".repeat(100)}`;
  setScriptText(pkg, "mywnd", long);
  assert.equal(scriptTexts(parse(build(pkg)))[0]!.text, long);
  assert.throws(() => setScriptText(pkg, "Other", ""), /No script text for Other/);
});

test("strips script text", () => {
  const pkg = sample();
  assert.equal(stripScriptText(pkg), 1);
  const back = parse(build(pkg));
  assert.deepEqual(scriptTexts(back), []);
  assert.equal(back.exports[1]!.data.length, 10);
});

test("explains broken files", () => {
  assert.throws(() => parse(new Uint8Array(64)), /Not a package file/);
  const bytes = build(sample());
  assert.throws(() => parse(bytes.subarray(0, 60)), PackageError);
});

const folder = process.env.UPACKAGE_FILES;
test("real packages rebuild byte for byte", { skip: !folder || !existsSync(folder) }, () => {
  for (const file of readdirSync(folder!)) {
    const bytes = new Uint8Array(readFileSync(join(folder!, file)));
    if (bytes.length < 4 || new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) !== packageTag) continue;
    assert.deepEqual(build(parse(bytes)), bytes, file);
  }
});
