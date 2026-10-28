import type { Db } from "./db";

export async function audit(
  db: Db,
  adminId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await db.exec(
    `insert into audit_log (admin_user_id, action, entity, entity_id, before, after)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [adminId, action, entity, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  );
}
