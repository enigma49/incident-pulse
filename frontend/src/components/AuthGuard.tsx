"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { buildLoginPath, isPublicPath } from "../lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (isLoading || isPublic) {
      return;
    }

    if (!user) {
      router.replace(buildLoginPath(pathname));
    }
  }, [user, isLoading, isPublic, pathname, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (isLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-slate-500">Checking authentication...</p>
      </div>
    );
  }

  return <>{children}</>;
}
