"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Radio,
  RefreshCw,
  Server,
  Zap,
  ArrowRight,
  Shield,
  Layers,
  Cpu,
} from "lucide-react";

export default function OperationsOverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const overview = await api.dashboard.overview();
      setData(overview);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load operations dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="space-y-6">
      {/* Header with Cache status indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-blue-500" />
            Operations Overview
          </h1>
          <p className="text-sm text-slate-400">
            Real-time operational health, incident velocity, and Redis-cached metrics overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <Zap className={`h-3.5 w-3.5 ${data.fromCache ? "text-amber-400 fill-amber-400/30" : "text-blue-400"}`} />
              <span className="text-slate-400">Cache:</span>
              <span className={`font-mono font-semibold ${data.fromCache ? "text-amber-400" : "text-blue-400"}`}>
                {data.fromCache ? "HIT (Redis - 30s TTL)" : "MISS (DB Aggregated)"}
              </span>
            </div>
          )}

          <button
            onClick={fetchOverview}
            disabled={refreshing}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Refresh overview metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm text-slate-400">Aggregating incident telemetry & querying Redis cache...</p>
        </div>
      ) : error ? (
        <div className="p-12 text-center space-y-3 bg-slate-900 border border-slate-800 rounded-xl">
          <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
          <p className="text-sm text-rose-300">{error}</p>
          <button
            onClick={fetchOverview}
            className="px-3 py-1.5 rounded bg-slate-800 text-slate-200 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Active Incidents</span>
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-white font-mono">
                {data.openIncidents}
              </div>
              <p className="text-xs text-slate-500">Unresolved operational incidents</p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Critical (P1 & P2)</span>
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-rose-400 font-mono">
                {data.criticalIncidents}
              </div>
              <p className="text-xs text-slate-500">High severity active alerts</p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Mitigated</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-amber-400 font-mono">
                {data.mitigatedIncidents}
              </div>
              <p className="text-xs text-slate-500">Workarounds applied, pending close</p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Total Incident Volume</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-emerald-400 font-mono">
                {data.totalIncidents}
              </div>
              <p className="text-xs text-slate-500">Cumulative historical records</p>
            </div>
          </div>

          {/* Breakdown Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Severity Distribution */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Severity Breakdown</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 space-y-1">
                  <span className="text-xs font-bold text-rose-400">P1 Critical</span>
                  <div className="text-xl font-mono font-bold text-rose-300">
                    {data.severityBreakdown?.P1 || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-900/60 space-y-1">
                  <span className="text-xs font-bold text-amber-400">P2 High</span>
                  <div className="text-xl font-mono font-bold text-amber-300">
                    {data.severityBreakdown?.P2 || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-yellow-950/40 border border-yellow-900/60 space-y-1">
                  <span className="text-xs font-bold text-yellow-400">P3 Medium</span>
                  <div className="text-xl font-mono font-bold text-yellow-300">
                    {data.severityBreakdown?.P3 || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-900/60 space-y-1">
                  <span className="text-xs font-bold text-blue-400">P4 Low</span>
                  <div className="text-xl font-mono font-bold text-blue-300">
                    {data.severityBreakdown?.P4 || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Status Distribution</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-900/60 space-y-1">
                  <span className="text-xs font-semibold text-blue-400">OPEN</span>
                  <div className="text-xl font-mono font-bold text-blue-300">
                    {data.statusBreakdown?.OPEN || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-900/60 space-y-1">
                  <span className="text-xs font-semibold text-purple-400">INVESTIGATING</span>
                  <div className="text-xl font-mono font-bold text-purple-300">
                    {data.statusBreakdown?.INVESTIGATING || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-900/60 space-y-1">
                  <span className="text-xs font-semibold text-amber-400">MITIGATED</span>
                  <div className="text-xl font-mono font-bold text-amber-300">
                    {data.statusBreakdown?.MITIGATED || 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-900/60 space-y-1">
                  <span className="text-xs font-semibold text-emerald-400">RESOLVED</span>
                  <div className="text-xl font-mono font-bold text-emerald-300">
                    {data.statusBreakdown?.RESOLVED || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Active Incidents & Live Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Incidents */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-400" />
                  Recent Operational Incidents
                </h3>
                <Link
                  href="/incidents"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="space-y-2">
                {data.recentIncidents?.map((inc: any) => (
                  <Link
                    key={inc._id}
                    href={`/incidents/${inc._id}`}
                    className="block p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-blue-400 line-clamp-1">
                        {inc.title}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          inc.severity === "P1"
                            ? "bg-rose-950 text-rose-300 border-rose-800"
                            : inc.severity === "P2"
                            ? "bg-amber-950 text-amber-300 border-amber-800"
                            : "bg-blue-950 text-blue-300 border-blue-800"
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                      <span className="font-mono text-slate-500">{inc.service}</span>
                      <span>•</span>
                      <span>{new Date(inc.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Live Audit Activity */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Latest Audit Stream
              </h3>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {data.recentActivity?.map((ev: any) => (
                  <div
                    key={ev._id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-200 font-semibold">{ev.action}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="px-1 py-0.2 bg-slate-900 border border-slate-800 rounded">
                        {ev.actorType}
                      </span>
                      <span>actor: {ev.actorId}</span>
                      {ev.entity && <span>entity: {ev.entity}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
