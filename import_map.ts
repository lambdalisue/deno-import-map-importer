/**
 * Maps module specifiers to their resolved URLs.
 *
 * The keys are the module specifiers that appear in import statements,
 * and the values are the URLs they should be resolved to.
 *
 * @example
 * ```typescript
 * const imports: Imports = {
 *   "lodash": "https://cdn.skypack.dev/lodash",
 *   "react": "https://esm.sh/react@18",
 *   "@/": "./src/"
 * };
 * ```
 */
export type Imports = Record<string, string>;

/**
 * Maps scope URLs to their specific import mappings.
 *
 * Scopes allow different parts of an application to use different versions
 * of the same module or different module resolution rules.
 *
 * @example
 * ```typescript
 * const scopes: Scopes = {
 *   "/legacy/": {
 *     "react": "https://esm.sh/react@16"
 *   },
 *   "/modern/": {
 *     "react": "https://esm.sh/react@18"
 *   }
 * };
 * ```
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
