import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openapi } from "../src/lib/openapi";

/** Escribe docs/openapi.json (lo consume la app móvil con openapi-typescript). */
export const OUTPUT = join(process.cwd(), "..", "docs", "openapi.json");
export const serialize = () => `${JSON.stringify(openapi, null, 2)}\n`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, serialize());
console.log(`OpenAPI exportado en ${OUTPUT}`);
