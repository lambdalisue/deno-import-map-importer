import { as, is, type Predicate } from "@core/unknownutil";

/**
 * Maps module specifiers to their resolved URLs.
 *
 * The keys are the module specifiers that appear in import statements,
 * and the values are the URLs they should be resolved to.
 */
export type Imports = Record<string, string>;

/**
 * Maps scope URLs to their specific import mappings.
 *
 * Scopes allow different parts of an application to use different versions
 * of the same module or different module resolution rules.
 */
export type Scopes = Record<string, Imports>;

/**
 * Represents a complete import map configuration.
 *
 * Import maps provide a way to control module resolution in JavaScript applications,
 * allowing you to map bare specifiers to URLs, create aliases, and define
 * scope-specific resolution rules.
 *
 * @see https://github.com/WICG/import-maps
 *
 * @example
 * ```typescript
 * const importMap: ImportMap = {
 *   imports: {
 *     "lodash": "https://cdn.skypack.dev/lodash",
 *     "@utils/": "./src/utils/"
 *   },
 *   scopes: {
 *     "/vendor/": {
 *       "lodash": "https://cdn.jsdelivr.net/npm/lodash@4"
 *     }
 *   }
 * };
 * ```
 */
export type ImportMap = {
  /** Global import mappings that apply to all modules */
  readonly imports: Readonly<Imports>;
  /** Scope-specific import mappings that override global mappings within specific URL scopes */
  readonly scopes?: Readonly<Scopes>;
};

/**
 * Type predicate for validating Imports objects.
 */
export const isImports: Predicate<Imports> = is.RecordOf(is.String, is.String);

/**
 * Type predicate for validating Scopes objects.
 */
export const isScopes: Predicate<Scopes> = is.RecordOf(isImports, is.String);

/**
 * Type predicate for validating ImportMap objects.
 * Ensures the object has the required structure with proper types.
 */
export const isImportMap: Predicate<ImportMap> = is.ObjectOf({
  imports: as.Readonly(isImports),
  scopes: as.Optional(as.Readonly(isScopes)),
});
