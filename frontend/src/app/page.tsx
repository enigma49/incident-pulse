"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { getIncidentLinkTarget, getIncidentRouteId } from "../lib/incident-id";
import { useAuth } from "../context/AuthContext";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
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
  const router = useRouter();
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

  const clickableCardClass =
    "block p-5 rounded-xl bg-white border border-slate-200 space-y-2 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer";
  const clickableBreakdownClass =
    "block p-3 rounded-lg border space-y-1 hover:shadow-sm transition-all cursor-pointer";
  const clickableMetricSubClass =
    "block p-3 rounded-lg border space-y-1 hover:shadow-sm transition-all cursor-pointer text-center";
  const clickableListItemClass =
    "block p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer";

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

  const incidentHref = (
    incidentRef: any,
  ) => {
    const target = getIncidentLinkTarget(incidentRef);
    return target ? `/incidents/${target}` : "/incidents";
  };

  const pendingApprovalInvestigations =
    aiOverview.recentInvestigations?.filter(
      (inv: { proposedAction?: { status?: string } }) => inv.proposedAction?.status === "PENDING_APPROVAL",
    ) ?? [];

  const firstPendingApprovalHref = incidentHref(pendingApprovalInvestigations[0]?.incidentId);
  const firstRecentInvestigationHref = incidentHref(aiOverview.recentInvestigations?.[0]?.incidentId);

  const firstCompletedInvestigation = aiOverview.recentInvestigations?.find(
    (inv: { status?: string }) => inv.status === "COMPLETED",
  );
  const firstActiveInvestigation = aiOverview.recentInvestigations?.find(
    (inv: { status?: string }) => inv.status === "QUEUED" || inv.status === "RUNNING",
  );

  const getAuditEventHref = (ev: {
    incidentId?: any;
    entity?: string;
    entityId?: string;
  }) => {
    if (ev.incidentId) {
      return incidentHref(ev.incidentId);
    }
    if (ev.entity === "Incident" && ev.entityId) {
      return `/incidents/${ev.entityId}`;
    }
    return "/incidents";
  };

  return (
    <div className="space-y-6">
      {/* Header with realtime sync */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-blue-500" />
            Operations Overview
          </h1>
          <p className="text-sm text-slate-400">
            Real-time operational health and incident velocity overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastEvent && (
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Live: {lastEvent}</span>
            </div>
          )}

          <button
            onClick={fetchOverview}
            disabled={refreshing}
            className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
          <p className="text-sm text-slate-400">Aggregating incident telemetry...</p>
        </div>
      ) : error ? (
        <div className="p-12 text-center space-y-3 bg-white border border-slate-200 rounded-xl">
          <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
          <p className="text-sm text-rose-700">{error}</p>
          <button
            onClick={fetchOverview}
            className="px-3 py-1.5 rounded bg-slate-100 text-slate-800 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Top Metric Cards (5 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Link href="/incidents?status=OPEN" className={clickableCardClass}>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Active Incidents</span>
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
                {data.openIncidents}
              </div>
              <p className="text-xs text-slate-500">Unresolved operational incidents</p>
            </Link>

            <Link
              href="/incidents?severities=P1,P2&excludeStatus=RESOLVED"
              className={clickableCardClass}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Critical (P1 & P2)</span>
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-rose-400 font-mono">
                {data.criticalIncidents}
              </div>
              <p className="text-xs text-slate-500">High severity active alerts</p>
            </Link>

            <Link href="/incidents?status=MITIGATED" className={clickableCardClass}>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Mitigated</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-amber-400 font-mono">
                {data.mitigatedIncidents}
              </div>
              <p className="text-xs text-slate-500">Workarounds applied, pending close</p>
            </Link>

            {/* Pending Human Approval Gate Card */}
            <Link
              href={firstPendingApprovalHref}
              className={`${clickableCardClass} border-purple-200 bg-gradient-to-br from-white to-purple-50`}
            >
              <div className="flex items-center justify-between text-xs text-purple-700">
                <span className="font-medium">Awaiting Approval</span>
                <ShieldAlert className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-purple-700 font-mono">
                {aiOverview.pendingApprovalActions}
              </div>
              <p className="text-xs text-purple-600">AI actions awaiting human sign-off</p>
            </Link>

            <Link href="/incidents" className={clickableCardClass}>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium">Total Volume</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold tracking-tight text-emerald-400 font-mono">
                {data.totalIncidents}
              </div>
              <p className="text-xs text-slate-500">Cumulative historical incidents</p>
            </Link>
          </div>

          {/* Breakdown Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Severity Distribution */}
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Severity Breakdown</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Link
                  href="/incidents?severity=P1"
                  className={`${clickableBreakdownClass} bg-rose-50 border-rose-200 hover:border-rose-300`}
                >
                  <span className="text-xs font-bold text-rose-400">P1 Critical</span>
                  <div className="text-xl font-mono font-bold text-rose-700">
                    {data.severityBreakdown?.P1 || 0}
                  </div>
                </Link>
                <Link
                  href="/incidents?severity=P2"
                  className={`${clickableBreakdownClass} bg-amber-50 border-amber-200 hover:border-amber-300`}
                >
                  <span className="text-xs font-bold text-amber-400">P2 High</span>
                  <div className="text-xl font-mono font-bold text-amber-700">
                    {data.severityBreakdown?.P2 || 0}
                  </div>
                </Link>
                <Link
                  href="/incidents?severity=P3"
                  className={`${clickableBreakdownClass} bg-yellow-50 border-yellow-200 hover:border-yellow-300`}
                >
                  <span className="text-xs font-bold text-yellow-400">P3 Medium</span>
                  <div className="text-xl font-mono font-bold text-yellow-700">
                    {data.severityBreakdown?.P3 || 0}
                  </div>
                </Link>
                <Link
                  href="/incidents?severity=P4"
                  className={`${clickableBreakdownClass} bg-blue-50 border-blue-200 hover:border-blue-300`}
                >
                  <span className="text-xs font-bold text-blue-400">P4 Low</span>
                  <div className="text-xl font-mono font-bold text-blue-700">
                    {data.severityBreakdown?.P4 || 0}
                  </div>
                </Link>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Status Distribution</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Link
                  href="/incidents?status=OPEN"
                  className={`${clickableBreakdownClass} bg-blue-50 border-blue-200 hover:border-blue-300`}
                >
                  <span className="text-xs font-semibold text-blue-400">OPEN</span>
                  <div className="text-xl font-mono font-bold text-blue-700">
                    {data.statusBreakdown?.OPEN || 0}
                  </div>
                </Link>
                <Link
                  href="/incidents?status=INVESTIGATING"
                  className={`${clickableBreakdownClass} bg-purple-50 border-purple-200 hover:border-purple-300`}
                >
                  <span className="text-xs font-semibold text-purple-400">INVESTIGATING</span>
                  <div className="text-xl font-mono font-bold text-purple-700">
                    {data.statusBreakdown?.INVESTIGATING || 0}
                  </div>
                </Link>
                <Link
                  href="/incidents?status=MITIGATED"
                  className={`${clickableBreakdownClass} bg-amber-50 border-amber-200 hover:border-amber-300`}
                >
                  <span className="text-xs font-semibold text-amber-400">MITIGATED</span>
                  <div className="text-xl font-mono font-bold text-amber-700">
                    {data.statusBreakdown?.MITIGATED || 0}
                  </div>
                </Link>
                <Link
                  href="/incidents?status=RESOLVED"
                  className={`${clickableBreakdownClass} bg-emerald-50 border-emerald-200 hover:border-emerald-300`}
                >
                  <span className="text-xs font-semibold text-emerald-400">RESOLVED</span>
                  <div className="text-xl font-mono font-bold text-emerald-700">
                    {data.statusBreakdown?.RESOLVED || 0}
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Phase 8: AI Investigation Engine & Human Oversight Operations */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    AI Investigation Engine & Human Oversight
                  </h3>
                  <p className="text-xs text-slate-400">
                    Asynchronous BullMQ worker telemetry, confidence metrics, and human-in-the-loop action queue.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <Link
                  href={firstActiveInvestigation ? incidentHref(firstActiveInvestigation.incidentId) : "/incidents?status=INVESTIGATING"}
                  className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  Workers: {aiOverview.running > 0 ? `${aiOverview.running} active` : "Idle"}
                </Link>
                <Link
                  href={firstRecentInvestigationHref}
                  className="px-2 py-1 rounded bg-purple-50 border border-purple-200 text-purple-700 hover:border-purple-300 hover:shadow-sm transition-all"
                >
                  Avg Confidence: {aiOverview.avgConfidence}%
                </Link>
              </div>
            </div>

            {/* AI Metrics Sub-grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center">
              <Link href={firstRecentInvestigationHref} className={`${clickableMetricSubClass} bg-slate-50 border-slate-200`}>
                <span className="text-[11px] text-slate-400">Total Run</span>
                <div className="text-lg font-mono font-bold text-slate-800">{aiOverview.total}</div>
              </Link>
              <Link
                href={firstCompletedInvestigation ? incidentHref(firstCompletedInvestigation.incidentId) : "/incidents?status=RESOLVED"}
                className={`${clickableMetricSubClass} bg-slate-50 border-slate-200`}
              >
                <span className="text-[11px] text-emerald-400">Completed</span>
                <div className="text-lg font-mono font-bold text-emerald-700">{aiOverview.completed}</div>
              </Link>
              <Link
                href={firstActiveInvestigation ? incidentHref(firstActiveInvestigation.incidentId) : "/incidents?status=INVESTIGATING"}
                className={`${clickableMetricSubClass} bg-slate-50 border-slate-200`}
              >
                <span className="text-[11px] text-blue-400">Queued / Active</span>
                <div className="text-lg font-mono font-bold text-blue-700">
                  {aiOverview.queued + aiOverview.running}
                </div>
              </Link>
              <Link
                href={firstPendingApprovalHref}
                className={`${clickableMetricSubClass} bg-purple-50 border-purple-200 hover:border-purple-300`}
              >
                <span className="text-[11px] text-purple-700 font-semibold">Pending Review</span>
                <div className="text-lg font-mono font-bold text-purple-800">
                  {aiOverview.pendingApprovalActions}
                </div>
              </Link>
              <Link href="/incidents?status=MITIGATED" className={`${clickableMetricSubClass} bg-slate-50 border-slate-200`}>
                <span className="text-[11px] text-emerald-400">Executed</span>
                <div className="text-lg font-mono font-bold text-emerald-700">{aiOverview.executedActions}</div>
              </Link>
              <Link href="/incidents?status=OPEN" className={`${clickableMetricSubClass} bg-slate-50 border-slate-200`}>
                <span className="text-[11px] text-rose-400">Rejected</span>
                <div className="text-lg font-mono font-bold text-rose-700">{aiOverview.rejectedActions}</div>
              </Link>
            </div>

            {/* AI Insights & Pending Actions Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
              {/* Pending Human Approval Queue */}
              <div className="p-4 rounded-xl bg-slate-50 border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-purple-400" />
                    Human Review Queue
                  </h4>
                  <Link
                    href={firstPendingApprovalHref}
                    className="text-[10px] font-mono text-purple-400 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 hover:border-purple-300 transition-colors"
                  >
                    {aiOverview.pendingApprovalActions} Pending
                  </Link>
                </div>

                {aiOverview.pendingApprovalActions === 0 ? (
                  <Link
                    href="/incidents"
                    className="block p-6 rounded-lg bg-slate-50 border border-slate-200 text-center space-y-1 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <CheckCircle className="h-5 w-5 text-emerald-400 mx-auto" />
                    <p className="text-xs text-slate-700 font-medium">All Proposed Actions Reviewed</p>
                    <p className="text-[11px] text-slate-500">
                      No automated mitigation actions currently pending operator sign-off.
                    </p>
                  </Link>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {aiOverview.recentInvestigations
                      ?.filter((inv: any) => inv.proposedAction?.status === "PENDING_APPROVAL")
                      .map((inv: any) => (
                        <Link
                          key={inv._id}
                          href={`/incidents/${getIncidentLinkTarget(inv.incidentId)}`}
                          className="block p-3 rounded-lg bg-white border border-purple-200 space-y-1.5 hover:border-purple-300 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-purple-800">
                              {inv.proposedAction.type}
                            </span>
                            <span className="text-[10px] text-purple-700 flex items-center gap-1 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-300">
                              Review & Execute <ExternalLink className="h-2.5 w-2.5" />
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-700 line-clamp-2">
                            {inv.proposedAction.description || inv.proposedAction.reason}
                          </p>
                          {inv.incidentId?.title && (
                            <div className="text-[10px] text-slate-500">
                              Incident: {inv.incidentId.title}
                            </div>
                          )}
                        </Link>
                      ))}
                  </div>
                )}
              </div>

              {/* Recent AI Investigations Stream */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-blue-400" />
                  Recent Investigation Findings
                </h4>

                {aiOverview.recentInvestigations?.length === 0 ? (
                  <Link
                    href="/incidents"
                    className="block text-xs text-slate-500 text-center py-6 hover:text-slate-700 transition-colors"
                  >
                    No investigations performed yet. Trigger one from an incident detail page.
                  </Link>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {aiOverview.recentInvestigations?.map((inv: any) => (
                      <Link
                        key={inv._id}
                        href={`/incidents/${getIncidentLinkTarget(inv.incidentId)}`}
                        className="block p-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors group"
                      >
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-slate-800 group-hover:text-blue-400 line-clamp-1">
                            {inv.incidentId?.title || "Incident Investigation"}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-50 border border-slate-200 rounded text-slate-400 shrink-0">
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
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <Link
                href="/incidents"
                className="text-sm font-bold text-slate-800 flex items-center gap-2 hover:text-purple-700 transition-colors"
              >
                <Users className="h-4 w-4 text-purple-400" />
                Team Operational Workload
              </Link>
              <Link
                href="/teams"
                className="text-xs text-purple-400 hover:text-purple-700 flex items-center gap-1 font-medium"
              >
                Manage Teams <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {data.teamWorkload?.length === 0 ? (
              <Link href="/incidents" className="block text-xs text-slate-500 text-center py-4 hover:text-slate-700 transition-colors">
                No team workload data available.
              </Link>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-400 font-medium">
                    <tr>
                      <th className="pb-2.5 font-semibold">Team Name</th>
                      <th className="pb-2.5 font-semibold">Service Responsibilities</th>
                      <th className="pb-2.5 font-semibold text-center">Active Load</th>
                      <th className="pb-2.5 font-semibold text-center">Critical (P1/P2)</th>
                      <th className="pb-2.5 font-semibold text-right">Capacity Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.teamWorkload?.map((team: any) => {
                      const teamId = String(team._id);
                      const isHighLoad = team.activeIncidents >= 5;
                      const hasCritical = team.criticalIncidents > 0;
                      const teamQueueHref = `/incidents?teamId=${teamId}`;
                      const teamCriticalHref = `/incidents?teamId=${teamId}&severities=P1,P2&excludeStatus=RESOLVED`;
                      return (
                        <tr
                          key={teamId}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => router.push(teamQueueHref)}
                        >
                          <td className="py-2.5 font-semibold text-slate-800">{team.name}</td>
                          <td className="py-2.5 text-slate-400">
                            <div className="flex flex-wrap gap-1">
                              {team.serviceResponsibility?.map((srv: string) => (
                                <button
                                  key={srv}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/incidents?teamId=${teamId}&service=${encodeURIComponent(srv)}`,
                                    );
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-400 hover:border-slate-300 hover:text-slate-600 transition-colors"
                                >
                                  {srv}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td
                            className="py-2.5 font-mono text-center text-slate-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(teamQueueHref);
                            }}
                          >
                            {team.activeIncidents}
                          </td>
                          <td
                            className="py-2.5 font-mono text-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(teamCriticalHref);
                            }}
                          >
                            <span
                              className={
                                team.criticalIncidents > 0 ? "text-rose-400 font-bold" : "text-slate-500"
                              }
                            >
                              {team.criticalIncidents}
                            </span>
                          </td>
                          <td
                            className="py-2.5 text-right"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(hasCritical ? teamCriticalHref : teamQueueHref);
                            }}
                          >
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                hasCritical
                                  ? "bg-rose-50 border-rose-200 text-rose-700"
                                  : isHighLoad
                                  ? "bg-amber-50 border-amber-200 text-amber-700"
                                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
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
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-400" />
                  Recent Operational Incidents
                </h3>
                <Link
                  href="/incidents"
                  className="text-xs text-blue-400 hover:text-blue-700 flex items-center gap-1 font-medium"
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="space-y-2">
                {data.recentIncidents?.length === 0 ? (
                  <Link
                    href="/incidents"
                    className="block p-6 rounded-lg bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    No recent incidents. View the full incident queue.
                  </Link>
                ) : null}
                {data.recentIncidents?.map((inc: any) => (
                  <Link
                    key={inc._id}
                    href={`/incidents/${getIncidentRouteId(inc)}`}
                    className="block p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-400 line-clamp-1">
                        {inc.title}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          inc.severity === "P1"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : inc.severity === "P2"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                      <span className="font-mono text-slate-500">
                        {(inc.services || []).join(", ") || "—"}
                      </span>
                      <span>•</span>
                      <span>{new Date(inc.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Live Audit Activity */}
            <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Latest Audit Stream
              </h3>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {data.recentActivity?.length === 0 ? (
                  <Link
                    href="/incidents"
                    className="block p-6 rounded-lg bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    No recent audit activity. View the incident queue.
                  </Link>
                ) : null}
                {data.recentActivity?.map((ev: any) => (
                  <Link
                    key={ev._id}
                    href={getAuditEventHref(ev)}
                    className={clickableListItemClass}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-800 font-semibold">{ev.action}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
