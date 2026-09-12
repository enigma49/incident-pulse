"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  UserCheck,
  ChevronDown,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const { user, login, logout, switchDemoUser } = useAuth();
  const { connectionStatus, isConnected } = useSocket();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navItems = [
    { label: "Overview", href: "/", icon: Activity },
    { label: "Incident Queue", href: "/incidents", icon: ListOrdered },
    { label: "Alert Stream", href: "/alerts", icon: Bell },
    { label: "Users & Teams", href: "/teams", icon: Users },
  ];

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsSubmitting(true);
    try {
      await login(emailInput, passwordInput);
      setShowLoginModal(false);
    } catch (err: any) {
      setLoginError(err.message || "Failed to log in");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSwitch = async (role: "ADMIN" | "OPERATOR") => {
    try {
      await switchDemoUser(role);
      setShowLoginModal(false);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 sm:px-8 max-w-7xl mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-white">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Shield className="h-5 w-5" />
              </div>
              <span className="tracking-tight">IncidentPulse</span>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                      isActive
                        ? "bg-slate-800 text-white font-semibold"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Controls / Quick Switch */}
          <div className="flex items-center gap-3">
            {/* Socket.IO Realtime Engine Status */}
            <div
              title={`Realtime Collaboration Engine: ${connectionStatus}`}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
                connectionStatus === "connected"
                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/80"
                  : connectionStatus === "connecting"
                  ? "bg-amber-950/60 text-amber-300 border-amber-800/80"
                  : "bg-rose-950/60 text-rose-300 border-rose-800/80"
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
              <span>{connectionStatus === "connected" ? "Live" : connectionStatus === "connecting" ? "Reconnecting..." : "Offline"}</span>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-200">{user.name}</span>
                  <div className="flex items-center gap-1 justify-end">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        user.role === "ADMIN"
                          ? "bg-purple-950 text-purple-300 border border-purple-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800"
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>
                </div>

                {/* Quick Role Switcher */}
                <button
                  onClick={() => handleDemoSwitch(user.role === "ADMIN" ? "OPERATOR" : "ADMIN")}
                  title={`Switch to ${user.role === "ADMIN" ? "Operator" : "Admin"} role`}
                  className="px-2.5 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <UserCheck className="h-3.5 w-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Switch to</span> {user.role === "ADMIN" ? "Operator" : "Admin"}
                </button>

                <button
                  onClick={logout}
                  title="Log out"
                  className="p-2 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDemoSwitch("OPERATOR")}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  Demo Operator
                </button>
                <button
                  onClick={() => handleDemoSwitch("ADMIN")}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors"
                >
                  Demo Admin
                </button>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="p-1.5 text-xs rounded text-slate-400 hover:text-white"
                >
                  <LogIn className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Manual Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100">Sign in to Platform</h3>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded text-xs text-rose-300">
                {loginError}
              </div>
            )}

            <form onSubmit={handleManualLogin} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Email Address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="operator@example.com"
                  required
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded text-sm transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Authenticating..." : "Sign In"}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400 mb-2">Or quick login with demo roles:</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => handleDemoSwitch("OPERATOR")}
                  className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200"
                >
                  Operator Login
                </button>
                <button
                  onClick={() => handleDemoSwitch("ADMIN")}
                  className="px-3 py-1 text-xs bg-purple-950 hover:bg-purple-900 border border-purple-800 rounded text-purple-200"
                >
                  Admin Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

