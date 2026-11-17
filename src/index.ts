export { defaultNameFlags, lazyClasses, minVersion, objectFlags, propertyTypes, taggedStructsSince } from "./constants.ts";
export { PackageError } from "./error.ts";
export { addName, className, findExport, findName, nameOf, objectName, path, readTextBuffer, resolve, writeTextBuffer } from "./objects.ts";
export { placeExport, relocateSound, relocateTexture, relocators } from "./lazy.ts";
export { build, parse } from "./package.ts";
export { objectProperties, readProperties, setObjectProperties, writeProperties } from "./properties.ts";
export { scriptTexts, setScriptText, stripScriptText } from "./script-text.ts";
export type { BuildOptions, Color, Export, Generation, Import, Name, ObjectProperties, ObjectRef, Package, Property, PropertyList, PropertyType, Relocator, Rotator, ScriptText, TextBuffer, Vector } from "./types.ts";
