import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import { ok, parseBody } from "@/lib/http";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";

export const GET = adminHandle("settings.view", async () => {
  try {
    return ok({ settings: await getSettings(db), complete: true });
  } catch {
    const rows = await db.many<{ key: string; value: unknown }>("select key, value from settings");
    return ok({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), complete: false });
  }
});

export const PUT = adminHandle("settings.manage", async (req, _p, a) => {
  const patch = await parseBody(req, settingsSchema.partial());
  await tx(async (t) => {
    const { before, after } = await saveSettings(t, patch, a.admin.id);
    await audit(t, a.admin.id, "settings.update", "settings", null, before, after);
  });
  return ok({ settings: await getSettings(db) });
});
