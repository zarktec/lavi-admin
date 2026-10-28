import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { Client } from "pg";

// Carga valores iniciales de los ajustes globales (solo los que falten) y, si se define
// SUPERADMIN_EMAIL, crea la invitación inicial del superadministrador e imprime su enlace.
//   SUPERADMIN_EMAIL=persona@empresa.com npm run seed
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();

  const settings = JSON.parse(readFileSync(join(process.cwd(), "seed", "settings.seed.json"), "utf8")) as Record<string, unknown>;
  for (const [key, value] of Object.entries(settings)) {
    const r = await client.query("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do nothing", [key, JSON.stringify(value)]);
    if (r.rowCount) console.log("Ajuste inicial:", key);
  }

  const email = process.env.SUPERADMIN_EMAIL;
  if (email) {
    const exists = await client.query("select 1 from admin_users a join roles r on r.id = a.role_id where r.is_superadmin and a.status <> 'disabled'");
    if (exists.rowCount) {
      console.log("Ya existe un superadministrador; no se crea invitación.");
    } else {
      const token = randomBytes(32).toString("base64url");
      const role = await client.query("select id from roles where is_superadmin limit 1");
      await client.query(
        "insert into invitations (email, name, role_id, token_hash, expires_at) values ($1, $2, $3, $4, now() + interval '24 hours')",
        [email, "Superadministrador", role.rows[0].id, createHash("sha256").update(token).digest("hex")],
      );
      const base = process.env.ADMIN_BASE_URL ?? "http://localhost:3000";
      console.log(`\nInvitación de superadministrador (vence en 24 h):\n${base}/admin/invite?token=${token}\n`);
    }
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
