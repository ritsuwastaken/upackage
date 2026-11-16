export const minVersion = 68;
export const taggedStructsSince = 118;
export const defaultNameFlags = 0x70010;
export const maxPathDepth = 64;

export const objectFlags = {
  hasStack: 0x02000000,
} as const;

export const propertyTypes = [
  "",
  "byte",
  "int",
  "bool",
  "float",
  "object",
  "name",
  "delegate",
  "class",
  "array",
  "struct",
  "vector",
  "rotator",
  "str",
  "map",
  "fixedArray",
] as const;

export const propertyTag = {
  type: 0x0f,
  array: 0x80,
  size: {
    info: 0x70,
    codes: [1, 2, 4, 12, 16],
    byte: 0x50,
    word: 0x60,
    int: 0x70,
  },
} as const;

export const arrayIndex = {
  one: 0x80,
  two: 0xc0,
  twoFlag: 0x80,
  fourFlag: 0xc0,
  twoMask: 0x7f,
  fourMask: 0x3f,
  oneMax: 127,
  twoMax: 16383,
} as const;

export const binaryStructs: readonly string[] = ["Vector", "Rotator", "Color"];
