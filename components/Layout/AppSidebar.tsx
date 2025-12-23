"use client";

import {
  Folders,
  Workflow,
  ScrollText,
  LayoutDashboard,
  Settings,
  Bot,
  HeartHandshake,
  Users,
  BriefcaseBusiness,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

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
import Link from "next/link";
import { SidebarGroupLabel } from "../ui/sidebar";
import useRequireRole from "@/hooks/use-require-role";
import { UserRole } from "@/lib/constants";

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
    title: "Practices",
    url: "/practices",
    icon: ScrollText,
  },
  {
    title: "Documents",
    url: "/documents",
    icon: Folders,
  },
];

const adminItems = [
  {
    title: "Users",
    url: "/users",
    icon: Users,
  },
  {
    title: "Overview",
    url: "/overview",
    icon: BriefcaseBusiness,
  },
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
    title: "Chat with us",
    url: "/help",
    icon: HeartHandshake,
  },
];

const user = {
  avatar: "https://ui.shadcn.com/avatars/shadcn.jpg",
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const path = usePathname() || "";

  const mainSection = useMemo(() => {
    if (path === "/") {
      return "home";
    }
    const sections = path.split("/").filter(Boolean);
    return sections[0] || "";
  }, [path]);

  const { isMobile, setOpenMobile } = useSidebar();

  const {isAuthorized } = useRequireRole(UserRole.ADMIN);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden border-solid border-1 border-light-blue-500">
                  <img src="/images/R_logo.png" alt="Reglo Logo" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Reglo srl</span>
                  <span className="truncate text-xs">Pro plan</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex justify-between">
        <div>

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
                          if (isMobile) {
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
                              if (isMobile) {
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
        <SidebarGroup>
          {/* <SidebarGroupLabel>Configurations</SidebarGroupLabel> */}
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
                        if (isMobile) {
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
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
