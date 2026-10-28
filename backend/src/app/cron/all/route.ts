import { cronRoute } from "@/lib/cron";
import { backupPush, closeDoses, expirePoints, expireRedemptions, reconcileRedemptions } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Modo plan Hobby (un solo cron diario): ejecuta todas las tareas en orden.
// Con plan Pro se usan las rutas individuales (ver docs/PENDIENTES.md).
export const { GET, POST } = cronRoute(async () => ({
  close_doses: await closeDoses(),
  backup_push: await backupPush(),
  expire_points: await expirePoints(),
  expire_redemptions: await expireRedemptions(),
  reconcile_redemptions: await reconcileRedemptions(),
}));
