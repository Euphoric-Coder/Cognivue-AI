"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrainCircuit, LayoutDashboard, Settings, Library, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardWrapper({ children }) {
  const { user, isLoaded } = useUser();
  const createOrUpdateUser = useMutation(api.users.createOrUpdateUser);
  const pathname = usePathname();
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (isLoaded && user && !synced) {
      createOrUpdateUser({
        clerkId: user.id,
        name: user.fullName || user.firstName || "User",
        email: user.primaryEmailAddress?.emailAddress || "",
        imageUrl: user.imageUrl,
      }).then(() => setSynced(true))
        .catch(console.error);
    }
  }, [isLoaded, user, synced, createOrUpdateUser]);

  const NavLinks = () => (
    <>
      <div className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wider">
        Learning
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/dashboard");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <span className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-1",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <Icon className="h-4 w-4" />
              {item.name}
            </span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/20">
      {/* Top Navbar for Mobile / Global Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 shadow-sm">
        <Sheet>
          <SheetTrigger className={buttonVariants({ variant: "outline", size: "icon", className: "md:hidden" })}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 pt-10">
            <nav className="flex flex-col gap-2">
              <NavLinks />
            </nav>
          </SheetContent>
        </Sheet>
        <Link className="flex items-center gap-2 font-semibold" href="/dashboard">
          <BrainCircuit className="h-6 w-6 text-primary" />
          <span className="hidden md:inline-block">Cognivue AI</span>
        </Link>
        <div className="w-full flex-1" />
        <UserButton afterSignOutUrl="/" />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar for Desktop */}
        <aside className="hidden md:flex w-64 flex-col border-r bg-background pt-4">
          <nav className="flex-1 px-4">
            <NavLinks />
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
