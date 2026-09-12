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
  RefreshCw,
  Zap,
  ArrowRight,
  Shield,
  Layers,
  Cpu,
  Users,
  ShieldAlert,
  Bot,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";

export default function OperationsOverviewPage() {
  const { user } = useAuth();
  const { socket, joinDashboard, leaveDashboard, reconnectEpoch, isConnected } = useSocket();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

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

  // Refetch authoritative overview on socket reconnection
  useEffect(() => {
    if (reconnectEpoch > 0) {
      fetchOverview();
    }
  }, [reconnectEpoch, fetchOverview]);

  // Join dashboard room & listen for realtime mutation broadcasts
  useEffect(() => {
    joinDashboard();

    if (!socket) return;

    const handleRealtimeUpdate = (evtName: string) => (payload: any) => {
      setLastEvent(`${evtName} (${new Date().toLocaleTimeString()})`);
      fetchOverview();
    };

    const onCreated = handleRealtimeUpdate("Incident Created");
    const onUpdated = handleRealtimeUpdate("Incident Updated");
    const onStatus = handleRealtimeUpdate("Status Changed");
    const onSeverity = handleRealtimeUpdate("Severity Changed");
    const onAssigned = handleRealtimeUpdate("Incident Assigned");
    const onAlert = handleRealtimeUpdate("Alert Correlated");
    const onAIEvent = handleRealtimeUpdate("AI Engine Event");

    socket.on("incident:created", onCreated);
    socket.on("incident:updated", onUpdated);
    socket.on("incident:status_changed", onStatus);
    socket.on("incident:severity_changed", onSeverity);
    socket.on("incident:assigned", onAssigned);
    socket.on("alert:associated", onAlert);
    socket.on("ai:investigation_event", onAIEvent);

    return () => {
      leaveDashboard();
      socket.off("incident:created", onCreated);
      socket.off("incident:updated", onUpdated);
      socket.off("incident:status_changed", onStatus);
      socket.off("incident:severity_changed", onSeverity);
      socket.off("incident:assigned", onAssigned);
      socket.off("alert:associated", onAlert);
      socket.off("ai:investigation_event", onAIEvent);
    };
  }, [socket, joinDashboard, leaveDashboard, fetchOverview]);

  const aiOverview = data?.aiOverview || {
    total: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    pendingApprovalActions: 0,
    executedActions: 0,
    rejectedActions: 0,
    avgConfidence: 0,
    recentInvestigations: [],
  };

  return (
    <div className="space-y-6">
      {/* Header with Cache status indicator & Realtime sync */}
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
          {lastEvent && (
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Live: {lastEvent}</span>
            </div>
          )}

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
          {/* Top Metric Cards (5 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

            {/* Pending Human Approval Gate Card */}
            <div className="p-5 rounded-xl bg-slate-900 border border-purple-900/60 bg-gradient-to-br from-slate-900 to-purple-950/20 space-y-2">
              <div className="flex items-center justify-between text-xs text-purple-300">
                <span className="font-medium">Awaiting Approval</span>
                <ShieldAlert className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-purple-300 font-mono">
                {aiOverview.pendingApprovalActions}
              </div>
              <p className="text-xs text-purple-400/80">AI actions awaiting human sign-off</p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Total Volume</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-emerald-400 font-mono">
                {data.totalIncidents}
              </div>
              <p className="text-xs text-slate-500">Cumulative historical incidents</p>
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

          {/* Phase 8: AI Investigation Engine & Human Oversight Operations */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-purple-950/80 border border-purple-800 text-purple-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    AI Investigation Engine & Human Oversight
                  </h3>
                  <p className="text-xs text-slate-400">
                    Asynchronous BullMQ worker telemetry, confidence metrics, and human-in-the-loop action queue.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  Workers: {aiOverview.running > 0 ? `${aiOverview.running} active` : "Idle"}
                </span>
                <span className="px-2 py-1 rounded bg-purple-950/60 border border-purple-800 text-purple-300">
                  Avg Confidence: {aiOverview.avgConfidence}%
                </span>
              </div>
            </div>

            {/* AI Metrics Sub-grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400">Total Run</span>
                <div className="text-lg font-mono font-bold text-slate-200">{aiOverview.total}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-emerald-400">Completed</span>
                <div className="text-lg font-mono font-bold text-emerald-300">{aiOverview.completed}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-blue-400">Queued / Active</span>
                <div className="text-lg font-mono font-bold text-blue-300">
                  {aiOverview.queued + aiOverview.running}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/80 space-y-1">
                <span className="text-[11px] text-purple-300 font-semibold">Pending Review</span>
                <div className="text-lg font-mono font-bold text-purple-200">
                  {aiOverview.pendingApprovalActions}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-emerald-400">Executed</span>
                <div className="text-lg font-mono font-bold text-emerald-300">{aiOverview.executedActions}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-rose-400">Rejected</span>
                <div className="text-lg font-mono font-bold text-rose-300">{aiOverview.rejectedActions}</div>
              </div>
            </div>

            {/* AI Insights & Pending Actions Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
              {/* Pending Human Approval Queue */}
              <div className="p-4 rounded-xl bg-slate-950 border border-purple-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-purple-400" />
                    Human Review Queue
                  </h4>
                  <span className="text-[10px] font-mono text-purple-400 px-1.5 py-0.5 rounded bg-purple-950 border border-purple-800">
                    {aiOverview.pendingApprovalActions} Pending
                  </span>
                </div>

                {aiOverview.pendingApprovalActions === 0 ? (
                  <div className="p-6 rounded-lg bg-slate-900/50 border border-slate-800 text-center space-y-1">
                    <CheckCircle className="h-5 w-5 text-emerald-400 mx-auto" />
                    <p className="text-xs text-slate-300 font-medium">All Proposed Actions Reviewed</p>
                    <p className="text-[11px] text-slate-500">
                      No automated mitigation actions currently pending operator sign-off.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {aiOverview.recentInvestigations
                      ?.filter((inv: any) => inv.proposedAction?.status === "PENDING_APPROVAL")
                      .map((inv: any) => (
                        <div
                          key={inv._id}
                          className="p-3 rounded-lg bg-slate-900 border border-purple-800/60 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-purple-200">
                              {inv.proposedAction.type}
                            </span>
                            <Link
                              href={`/incidents/${inv.incidentId?._id || inv.incidentId}`}
                              className="text-[10px] text-purple-300 hover:text-white flex items-center gap-1 font-mono bg-purple-950 px-2 py-0.5 rounded border border-purple-700"
                            >
                              Review & Execute <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-2">
                            {inv.proposedAction.description || inv.proposedAction.reason}
                          </p>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Incident: {inv.incidentId?.title || inv.incidentId}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Recent AI Investigations Stream */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-blue-400" />
                  Recent Investigation Findings
                </h4>

                {aiOverview.recentInvestigations?.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No investigations performed yet. Trigger one from an incident detail page.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {aiOverview.recentInvestigations?.map((inv: any) => (
                      <Link
                        key={inv._id}
                        href={`/incidents/${inv.incidentId?._id || inv.incidentId}`}
                        className="block p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors group"
                      >
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-slate-200 group-hover:text-blue-400 line-clamp-1">
                            {inv.incidentId?.title || "Incident Investigation"}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-950 border border-slate-800 rounded text-slate-400 shrink-0">
                            {inv.confidence}% Conf
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {inv.summary || "Investigation completed"}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1 font-mono">
                          <span>{inv.aiModel || inv.provider}</span>
                          <span>•</span>
                          <span>{new Date(inv.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team Workload Distribution Table (Phase 8) */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-400" />
                Team Operational Workload
              </h3>
              <Link
                href="/teams"
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
              >
                Manage Teams <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {data.teamWorkload?.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No team workload data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400 font-medium">
                    <tr>
                      <th className="pb-2.5 font-semibold">Team Name</th>
                      <th className="pb-2.5 font-semibold">Service Responsibilities</th>
                      <th className="pb-2.5 font-semibold text-center">Active Load</th>
                      <th className="pb-2.5 font-semibold text-center">Critical (P1/P2)</th>
                      <th className="pb-2.5 font-semibold text-right">Capacity Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {data.teamWorkload?.map((team: any) => {
                      const isHighLoad = team.activeIncidents >= 5;
                      const hasCritical = team.criticalIncidents > 0;
                      return (
                        <tr key={team._id} className="hover:bg-slate-950/40 transition-colors">
                          <td className="py-2.5 font-semibold text-slate-200">{team.name}</td>
                          <td className="py-2.5 text-slate-400">
                            <div className="flex flex-wrap gap-1">
                              {team.serviceResponsibility?.map((srv: string) => (
                                <span
                                  key={srv}
                                  className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400"
                                >
                                  {srv}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 font-mono text-center text-slate-200">
                            {team.activeIncidents}
                          </td>
                          <td className="py-2.5 font-mono text-center">
                            <span
                              className={
                                team.criticalIncidents > 0 ? "text-rose-400 font-bold" : "text-slate-500"
                              }
                            >
                              {team.criticalIncidents}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                hasCritical
                                  ? "bg-rose-950/60 border-rose-800 text-rose-300"
                                  : isHighLoad
                                  ? "bg-amber-950/60 border-amber-800 text-amber-300"
                                  : "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                              }`}
                            >
                              {hasCritical ? "Critical Alert" : isHighLoad ? "High Load" : "Nominal"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Operational Incidents & Live Activity Grid */}
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
