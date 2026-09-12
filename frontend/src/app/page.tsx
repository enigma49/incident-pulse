"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, Server, Database, Radio, Activity, Cpu } from "lucide-react";

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiUrl]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100">
      <div className="w-full max-w-4xl p-8 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
              IP
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">IncidentPulse</h1>
              <p className="text-sm text-slate-400">AI Incident & Operations Management Platform</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Phase 1 Foundation Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Server className="h-4 w-4 text-blue-400" />
              API Gateway & Health
            </div>
            <p className="text-xs text-slate-400">NestJS Modular Core</p>
            <div className="text-sm font-mono text-emerald-400">
              {loading ? "Checking..." : error ? `Error: ${error}` : health?.status?.toUpperCase()}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Database className="h-4 w-4 text-emerald-400" />
              Data Persistence
            </div>
            <p className="text-xs text-slate-400">MongoDB 7 + Mongoose</p>
            <div className="text-sm font-mono text-emerald-400">
              {loading ? "..." : health?.database ? `${health.database.status}` : "Standby"}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Radio className="h-4 w-4 text-purple-400" />
              Cache & Queue Broker
            </div>
            <p className="text-xs text-slate-400">Redis 7 + BullMQ</p>
            <div className="text-sm font-mono text-purple-400">
              {loading ? "..." : health?.redis ? `${health.redis.status}` : "Standby"}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2 font-mono">
          <div className="text-slate-300 font-semibold mb-1">Standard Demo Operator Credentials:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-blue-400">Admin:</span> admin@example.com / Admin123!
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-blue-400">Operator:</span> operator@example.com / Operator123!
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

