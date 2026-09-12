"use client";

import { usePathname } from "next/navigation";
import AuthGuard from "./AuthGuard";
import { isPublicPath } from "../lib/auth";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = isPublicPath(pathname);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </AuthGuard>
  );
}
