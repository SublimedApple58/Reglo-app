"use client";
import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/radix/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/animate-ui/radix/sidebar";
import { signOutUser } from "@/lib/actions/user.actions";
import { getCurrentUserAvatarUrl } from "@/lib/actions/storage.actions";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function NavUser() {
  const { isMobile } = useSidebar();
  const session = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const initials = useMemo(() => {
    const name = session.data?.user?.name?.trim();
    if (!name) return "RG";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [session.data?.user?.name]);

  useEffect(() => {
    if (!session.data) return;
    let isMounted = true;
    const loadAvatar = async () => {
      const res = await getCurrentUserAvatarUrl();
      if (!res.success || !isMounted) return;
      setAvatarUrl(res.data.url);
    };

    loadAvatar();
    return () => {
      isMounted = false;
    };
  }, [session.data?.user?.image]);

  if(!session.data) return null;
  
   return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={avatarUrl ?? undefined} alt="User avatar" />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{session.data.user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {session.data.user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={avatarUrl ?? undefined} alt="User avatar" />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{session.data.user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {session.data.user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconUserCircle />
                <Link rel="stylesheet" href="/user/settings">Account</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconCreditCard />
                <Link rel="stylesheet" href="/user/billing">Billing</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOutUser()}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
