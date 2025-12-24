import { SidebarInset } from "../ui/sidebar";
import { ClientHeader } from "./ClientHeader";

export default function ClientPageWrapper({
  children = "",
  title = "",
}: {
  children?: React.ReactNode;
  title?: string;
}): React.ReactElement {
  return (
    <SidebarInset>
      <ClientHeader
        title={<h1 className="text-base font-medium">{title}</h1>}
      />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* <SectionCards /> */}
            <div className="px-4 lg:px-6">{children}</div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
