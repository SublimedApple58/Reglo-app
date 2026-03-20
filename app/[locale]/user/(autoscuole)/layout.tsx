import { AuthDataProvider } from "@/components/providers/auth-data.provider";
import { AutoscuoleShell } from "@/components/Layout/AutoscuoleShell";

export default function AutoscuoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthDataProvider>
      <AutoscuoleShell>{children}</AutoscuoleShell>
    </AuthDataProvider>
  );
}
