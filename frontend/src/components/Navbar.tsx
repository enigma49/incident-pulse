"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  Shield,
  Activity,
  ListOrdered,
  Users,
  Bell,
  LogIn,
  LogOut,
} from "lucide-react";

import { isPublicPath } from "../lib/auth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { connectionStatus } = useSocket();

  if (isPublicPath(pathname)) {
    return null;
  }

  const navItems = [
    { label: "Overview", href: "/", icon: Activity },
    { label: "Incident Queue", href: "/incidents", icon: ListOrdered },
    { label: "Alert Stream", href: "/alerts", icon: Bell },
    { label: "Users & Teams", href: "/teams", icon: Users },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur shadow-sm">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Shield className="h-5 w-5" />
            </div>
            <span className="tracking-tight">IncidentPulse</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold"
                      : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div
            title={`Realtime Collaboration Engine: ${connectionStatus}`}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
              connectionStatus === "connected"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : connectionStatus === "connecting"
                  ? "bg-amber-50 text-amber-700 border-amber-200/80"
                  : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {connectionStatus === "connected" && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connectionStatus === "connected"
                    ? "bg-emerald-500"
                    : connectionStatus === "connecting"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
              />
            </span>
            <span>
              {connectionStatus === "connected"
                ? "Live"
                : connectionStatus === "connecting"
                  ? "Reconnecting..."
                  : "Offline"}
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-800">{user.name}</span>
                <div className="flex items-center gap-1 justify-end">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      user.role === "ADMIN"
                        ? "bg-purple-50 text-purple-700 border border-purple-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                title="Log out"
                className="p-2 rounded bg-white hover:bg-slate-100 text-slate-400 hover:text-rose-400 border border-slate-200 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
