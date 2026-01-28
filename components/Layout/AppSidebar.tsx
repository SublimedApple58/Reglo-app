"use client";

import {
  Folders,
  Workflow,
  LayoutDashboard,
  Settings,
  Bot,
  HeartHandshake,
  Users,
  FolderKanban,
  ClipboardCheck,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/animate-ui/radix/sidebar";

import { NavUser } from "../ui/nav-user";
import { SidebarGroupLabel } from "../ui/sidebar";
import {
  companyAtom,
  companyListAtom,
  companyRefreshAtom,
} from "@/atoms/company.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/radix/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { setActiveCompany } from "@/lib/actions/company.actions";
import { integrationsRefreshAtom } from "@/atoms/integrations.store";

const items = [
  {
    title: "Home",
    url: "/home",
    icon: LayoutDashboard,
  },
  {
    title: "Workflows",
    url: "/workflows",
    icon: Workflow,
  },
  {
    title: "Doc manager",
    url: "/doc_manager",
    icon: FolderKanban,
  },
  {
    title: "Documents",
    url: "/documents",
    icon: Folders,
  },
  {
    title: "Compilazioni",
    url: "/compilazioni",
    icon: ClipboardCheck,
  },
];

const adminItems = [
  {
    title: "Users",
    url: "/users",
    icon: Users,
  },
  // {
  //   title: "Overview",
  //   url: "/overview",
  //   icon: BriefcaseBusiness,
  // },
]

const configurationItems = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "Assistant",
    url: "/assistant",
    icon: Bot,
  },
  {
    title: "Ask support",
    url: "/help",
    icon: HeartHandshake,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const path = usePathname() || "";
  const company = useAtomValue(companyAtom);
  const companyList = useAtomValue(companyListAtom);
  const setCompanyRefresh = useSetAtom(companyRefreshAtom);
  const setIntegrationsRefresh = useSetAtom(integrationsRefreshAtom);
  const toast = useFeedbackToast();
  const companyName = company?.name ?? "Reglo srl";
  const companyRole = company?.role ?? null;
  const isMobile = useIsMobile();

  const mainSection = useMemo(() => {
    if (path === "/") {
      return "home";
    }
    const sections = path.split("/").filter(Boolean);
    return sections[0] || "";
  }, [path]);

  const localePrefix = useMemo(() => {
    const segments = path.split("/").filter(Boolean);
    if (!segments.length) return "";
    const candidate = segments[0];
    if (candidate.length <= 3) {
      return `/${candidate}`;
    }
    return "";
  }, [path]);

  const { isMobile: sidebarIsMobile, setOpenMobile } = useSidebar();

  const isAuthorized = companyRole === "admin";

  const activeCompany =
    companyList.find((entry) => entry.id === company?.id) ??
    (company
      ? { ...company, plan: "Pro plan", logoUrl: company.logoUrl }
      : null);

  const handleCompanySwitch = async (companyId: string) => {
    if (!company || companyId === company.id) return;
    const res = await setActiveCompany({ companyId });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile cambiare company.",
      });
      return;
    }
    setCompanyRefresh(true);
    setIntegrationsRefresh(true);
    router.refresh();
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="px-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="gap-3 rounded-xl px-3 py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden border border-border/70 shadow-sm">
                    {activeCompany?.logoUrl ? (
                      <Image
                        src={activeCompany.logoUrl}
                        alt="Company logo"
                        width={32}
                        height={32}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold">
                        {(activeCompany?.name ?? companyName ?? "C")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {activeCompany?.name ?? companyName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activeCompany?.plan ?? "Pro plan"}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                align="start"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Company
                </DropdownMenuLabel>
                {companyList.map((entry, index) => (
                  <DropdownMenuItem
                    key={entry.id}
                    onClick={() => handleCompanySwitch(entry.id)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                      {entry.logoUrl ? (
                        <Image
                          src={entry.logoUrl}
                          alt={entry.name}
                          width={20}
                          height={20}
                          className="h-4 w-4 rounded-sm object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold">
                          {entry.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {entry.name}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {entry.plan}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 p-2"
                  onClick={() => router.push(`${localePrefix}/select-company`)}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                    <Plus className="size-4" />
                  </div>
                  <div className="font-medium text-muted-foreground">
                    Cambia company
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex justify-between px-1">
        <div className="space-y-4">
          <SidebarGroup>
            {/* <SidebarGroupLabel>Application</SidebarGroupLabel> */}
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title} style={{ cursor: "pointer" }}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        (item.title === "Home" && path === "/") ||
                        mainSection === item.title.toLowerCase()
                      }
                    >
                      <div
                        onClick={() => {
                          router.push(`/user/${item.url}`);
                          if (sidebarIsMobile) {
                            setOpenMobile(false);
                          }
                        }}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {isAuthorized && (
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                  <SidebarMenu>
                    {adminItems.map((item) => (
                      <SidebarMenuItem key={item.title} style={{ cursor: "pointer" }}>
                        <SidebarMenuButton
                          asChild
                          isActive={mainSection === item.title.toLowerCase()}
                        >
                          <div
                            onClick={() => {
                              router.push(`/admin/${item.url}`);
                              if (sidebarIsMobile) {
                                setOpenMobile(false);
                              }
                            }}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </div>
        {/* <Separator style={{ width: "90%", marginInline: "auto" }} /> */}
        <SidebarGroup className="px-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {configurationItems.map((item) => (
                <SidebarMenuItem key={item.title} style={{ cursor: "pointer" }}>
                  <SidebarMenuButton
                    asChild
                    isActive={mainSection === item.title.toLowerCase()}
                  >
                    <div
                      onClick={() => {
                        router.push(`/user/${item.url}`);
                        if (sidebarIsMobile) {
                          setOpenMobile(false);
                        }
                      }}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-1">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
