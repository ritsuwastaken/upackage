import type { propertyTypes } from "./constants.ts";

export type ObjectRef = number;

export interface Name {
  name: string;
  flags: number;
}

export interface Import {
  classPackage: number;
  className: number;
  outer: number;
  name: number;
}

export interface Export {
  class: number;
  super: number;
  outer: number;
  name: number;
  flags: number;
  data: Uint8Array;
}

export interface Generation {
  exports: number;
  names: number;
}

export interface Package {
  version: number;
  licensee: number;
  flags: number;
  guid: Uint8Array | null;
  generations: Generation[];
  names: Name[];
  imports: Import[];
  exports: Export[];
  trailer: Uint8Array;
}

export interface TextBuffer {
  pos: number;
  top: number;
  text: string;
}

export interface ScriptText {
  class: string;
  path: string;
  text: string;
}

export type PropertyType = Exclude<(typeof propertyTypes)[number], "">;

export interface Vector {
  x: number;
  y: number;
  z: number;
}

export interface Rotator {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface Color {
  b: number;
  g: number;
  r: number;
  a: number;
}

interface Tag {
  name: string;
  arrayIndex: number;
}

export type Property = Tag &
  (
    | { type: "byte" | "int" | "float"; value: number }
    | { type: "bool"; value: boolean }
    | { type: "object" | "class"; value: ObjectRef }
    | { type: "name" | "str"; value: string }
    | { type: "struct"; struct: string; value: Vector | Rotator | Color | Property[] | Uint8Array }
    | { type: "delegate" | "array" | "vector" | "rotator" | "map" | "fixedArray"; value: Uint8Array }
  );

export interface PropertyList {
  properties: Property[];
  none: number;
}

export interface ObjectProperties extends PropertyList {
  start: number;
  end: number;
}
