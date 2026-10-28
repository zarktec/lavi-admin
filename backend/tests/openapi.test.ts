import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { openapi } from "@/lib/openapi";

const V1 = join(process.cwd(), "src", "app", "v1");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Rutas de app (sin /v1/admin ni el propio documento) → "método ruta". */
function appRoutes(): string[] {
  const out: string[] = [];
  for (const file of routeFiles(V1)) {
    const rel = relative(V1, join(file, "..")).split(sep);
    if (rel[0] === "admin" || rel[0] === "openapi.json") continue;
    const path = `/v1/${rel.join("/")}`.replace(/\[(\w+)\]/g, "{$1}");
    const src = readFileSync(file, "utf8");
    for (const m of METHODS) {
      if (new RegExp(`export const ${m.toUpperCase()}\\b`).test(src)) out.push(`${m} ${path}`);
    }
  }
  return out.sort();
}

function documented(): string[] {
  const out: string[] = [];
  for (const [path, item] of Object.entries(openapi.paths)) {
    for (const m of METHODS) if (m in item) out.push(`${m} ${path}`);
  }
  return out.sort();
}

describe("OpenAPI de la app móvil", () => {
  it("documenta exactamente las rutas de src/app/v1 (sin admin)", () => {
    expect(documented()).toEqual(appRoutes());
  });

  it("todas las operaciones tienen operationId único, resumen y etiqueta", () => {
    const ids = new Set<string>();
    for (const item of Object.values(openapi.paths)) {
      for (const m of METHODS) {
        const op = (item as Record<string, any>)[m];
        if (!op) continue;
        expect(op.operationId).toBeTruthy();
        expect(ids.has(op.operationId)).toBe(false);
        ids.add(op.operationId);
        expect(op.summary).toBeTruthy();
        expect(op.tags?.length).toBe(1);
      }
    }
  });

  it("todas las referencias $ref se resuelven", () => {
    const refs: string[] = [];
    JSON.stringify(openapi, (_k, v) => {
      if (v && typeof v === "object" && typeof v.$ref === "string") refs.push(v.$ref);
      return v;
    });
    expect(refs.length).toBeGreaterThan(20);
    for (const ref of refs) {
      const target = ref.replace("#/", "").split("/").reduce<any>((o, k) => o?.[k], openapi);
      expect(target, ref).toBeTruthy();
    }
  });

  it("las propiedades requeridas existen en cada esquema", () => {
    const check = (name: string, schema: any) => {
      for (const part of schema.allOf ?? [schema]) {
        for (const key of part.required ?? []) {
          const props = [...(schema.allOf ?? [schema])].flatMap((p: any) => Object.keys(p.properties ?? {}));
          expect(props, `${name}.${key}`).toContain(key);
        }
      }
    };
    for (const [name, schema] of Object.entries(openapi.components.schemas)) check(name, schema);
  });

  it("las rutas con sesión exigen Bearer y las públicas lo declaran", () => {
    expect(openapi.security).toEqual([{ bearerAuth: [] }]);
    const publicOps = ["getAppConfig", "createSession", "refreshSession"];
    for (const item of Object.values(openapi.paths)) {
      for (const m of METHODS) {
        const op = (item as Record<string, any>)[m];
        if (op && publicOps.includes(op.operationId)) expect(op.security).toEqual([]);
      }
    }
  });

  it("docs/openapi.json está al día (npm run openapi:export)", () => {
    const file = readFileSync(join(process.cwd(), "..", "docs", "openapi.json"), "utf8");
    expect(JSON.parse(file)).toEqual(JSON.parse(JSON.stringify(openapi)));
  });
});
