/// <reference types="vite/client" />

declare module '*.css';

declare module 'virtual:spec-catalog' {
  import type { SpecCatalogEntry } from './lib/spec-catalog';

  export const specCatalog: SpecCatalogEntry[];
}
