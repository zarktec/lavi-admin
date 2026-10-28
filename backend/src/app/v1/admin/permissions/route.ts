import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

export const GET = adminHandle("superadmin", async () => ok({ permissions: await db.many("select code, description from permissions order by code") }));
