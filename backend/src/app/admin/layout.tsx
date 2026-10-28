import "./admin.css";
import { ToastProvider } from "./_components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
