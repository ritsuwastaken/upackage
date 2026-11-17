# @ritsuwastaken/upackage

Read, edit and write package files of Unreal Engine 1 and 2 games: `.u`, `.utx`, `.uax`, `.ukx`, `.usx`, maps. Versions from 68 to 177.

Uses [@ritsuwastaken/farchive](https://github.com/ritsuwastaken/farchive).

## Usage

```bash
npm install @ritsuwastaken/upackage
```

```ts
import { readFile, writeFile } from "node:fs/promises";
import { build, className, parse, path, scriptTexts, setScriptText } from "@ritsuwastaken/upackage";

const pkg = parse(await readFile("Engine.u"));
pkg.exports.forEach((entry, i) => console.log(path(pkg, i + 1), className(pkg, i + 1), entry.data.length));

for (const entry of scriptTexts(pkg)) console.log(entry.class, entry.text.length);
setScriptText(pkg, "Actor", "class Actor extends Object;\r\n");
await writeFile("Engine.u", build(pkg));
```

Script text is the UnrealScript source stored next to each compiled class.

## Moving exports

```ts
build(pkg, { relocators: { StaticMesh: (pkg, ref, data, from, to) => data } });
```
