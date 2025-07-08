export type Imports = Record<string, string>;

export type Scopes = Record<string, Imports>;

export type ImportMap = {
  readonly imports: Readonly<Imports>;
  readonly scopes?: Readonly<Scopes>;
};
