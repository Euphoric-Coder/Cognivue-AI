"use client";

import { shadcn } from "@clerk/ui/themes";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL || "https://happy-animal-123.convex.cloud");

export function Providers({ children }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <TooltipProvider>{children}</TooltipProvider>
    </ConvexProviderWithClerk>
  );
}
