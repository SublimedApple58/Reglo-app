import { AuthDataProvider } from "@/components/providers/auth-data.provider";
import { AutoscuoleShell } from "@/components/Layout/AutoscuoleShell";
import { ServiceGate } from "@/components/ui/service-gate";

export default function AutoscuoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthDataProvider>
      <AutoscuoleShell>
        <ServiceGate service="AUTOSCUOLE">
          {children}
        </ServiceGate>
      </AutoscuoleShell>
    </AuthDataProvider>
  );
}
