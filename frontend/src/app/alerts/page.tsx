"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { Alert, Incident } from "../../types";
import { formatIncidentId, getIncidentLinkTarget, getIncidentRouteId } from "../../lib/incident-id";
import {
  Bell,
  Search,
  Filter,
  Radio,
  Plus,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Layers,
  CheckCircle2,
  Cpu,
  Link as LinkIcon,
  Eye,
  Hash,
  Clock,
} from "lucide-react";

export default function AlertStreamPage() {
  const { user } = useAuth();
  const { socket, joinDashboard, leaveDashboard, reconnectEpoch } = useSocket();

  // Data states
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Incidents for manual correlation
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);

  // Filter states
  const [tab, setTab] = useState<"ALL" | "UNASSIGNED" | "CORRELATED">("ALL");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("");

  // Modals
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simTitle, setSimTitle] = useState("");
  const [simService, setSimService] = useState("payment-service");
  const [simSeverity, setSimSeverity] = useState("P1");
  const [simSource, setSimSource] = useState("Prometheus");
  const [simResource, setSimResource] = useState("");
  const [simDescription, setSimDescription] = useState("");
  const [simResult, setSimResult] = useState<any>(null);
  const [sharedOutageResult, setSharedOutageResult] = useState<any[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSimulatingSharedOutage, setIsSimulatingSharedOutage] = useState(false);

  // Associate Modal
  const [associateAlert, setAssociateAlert] = useState<Alert | null>(null);
  const [targetIncidentId, setTargetIncidentId] = useState("");
  const [isAssociating, setIsAssociating] = useState(false);

  // Detail Modal
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.alerts.list({
        page,
        limit,
        search: search.trim() || undefined,
        service: selectedService || undefined,
        severity: selectedSeverity || undefined,
        status: tab === "ALL" ? undefined : tab,
        unassigned: tab === "UNASSIGNED" ? true : undefined,
      });
      setAlerts(res.data || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, selectedService, selectedSeverity, tab]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const loadActiveIncidents = useCallback(() => {
    api.incidents
      .list({ limit: 100, excludeStatus: "RESOLVED" })
      .then((res) => setActiveIncidents(res.data || []))
      .catch(() => {});
  }, []);

  // Load active incidents for the manual association picker
  useEffect(() => {
    loadActiveIncidents();
  }, [loadActiveIncidents]);

  // Reconnect handling
  useEffect(() => {
    if (reconnectEpoch > 0) {
      fetchAlerts();
    }
  }, [reconnectEpoch, fetchAlerts]);

  // Realtime Socket updates
  useEffect(() => {
    joinDashboard();

    if (!socket) return;

    const handleAlertAssociated = () => {
      fetchAlerts();
    };

    socket.on("alert:associated", handleAlertAssociated);
    socket.on("incident:created", handleAlertAssociated);

    return () => {
      leaveDashboard();
      socket.off("alert:associated", handleAlertAssociated);
      socket.off("incident:created", handleAlertAssociated);
    };
  }, [socket, joinDashboard, leaveDashboard, fetchAlerts]);

  const handleSimulateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSimulating(true);
    setSimResult(null);
    try {
      const res = await api.alerts.create({
        title: simTitle,
        service: simService,
        severity: simSeverity,
        source: simSource,
        resource: simResource.trim() || undefined,
        description: simDescription,
        rawPayload: {
          simulatedBy: user?.name || "Operator",
          metricValue: Math.floor(Math.random() * 500) + 100,
          threshold: 100,
        },
      });
      setSimResult(res);
      fetchAlerts();
    } catch (err: any) {
      alert(err.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulateSharedOutage = async () => {
    setIsSimulatingSharedOutage(true);
    setSharedOutageResult(null);
    setSimResult(null);
    try {
      const scenarios = [
        {
          title: "S3 PutObject timeouts",
          service: "payment-service",
          description: "Write path blocked by S3 dependency outage",
        },
        {
          title: "S3 GetObject 503 errors",
          service: "auth-service",
          description: "Read path blocked by S3 dependency outage",
        },
        {
          title: "S3 upload failures",
          service: "order-service",
          description: "Order artifact uploads failing against S3",
        },
      ];

      const results = [];
      for (const scenario of scenarios) {
        const res = await api.alerts.create({
          title: scenario.title,
          service: scenario.service,
          severity: "P2",
          source: "Prometheus",
          resource: "s3",
          description: scenario.description,
          rawPayload: { sharedOutage: true, resource: "s3" },
        });
        results.push(res);
      }

      setSharedOutageResult(results);
      loadActiveIncidents();
      fetchAlerts();
    } catch (err: any) {
      alert(err.message || "Shared outage simulation failed");
    } finally {
      setIsSimulatingSharedOutage(false);
    }
  };

  const handleManualAssociate = async () => {
    if (!associateAlert || !targetIncidentId) return;
    setIsAssociating(true);
    try {
      await api.alerts.associate(associateAlert._id, targetIncidentId);
      setAssociateAlert(null);
      setTargetIncidentId("");
      fetchAlerts();
    } catch (err: any) {
      alert(err.message || "Failed to associate alert");
    } finally {
      setIsAssociating(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "P1":
      case "CRITICAL":
        return "bg-rose-50 text-rose-700 border-rose-200 font-bold";
      case "P2":
      case "HIGH":
        return "bg-amber-50 text-amber-700 border-amber-200 font-semibold";
      case "P3":
      case "MEDIUM":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      default:
        return "bg-blue-50 text-blue-700 border-blue-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-blue-500" />
            Alert Ingestion & Correlation Stream
          </h1>
          <p className="text-sm text-slate-400">
            Real-time telemetry ingestion, shared-resource clustering, and manual incident linking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
            title="Refresh Alert Stream"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleSimulateSharedOutage}
            disabled={isSimulatingSharedOutage}
            className="px-3.5 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-sm transition-colors flex items-center gap-2 border border-amber-200 disabled:opacity-50"
          >
            <Layers className="h-4 w-4" />
            {isSimulatingSharedOutage ? "Simulating..." : "Simulate Shared Outage"}
          </button>
          <button
            onClick={() => {
              setSimResult(null);
              setSimTitle("");
              setSimDescription("");
              setSimResource("");
              setIsSimulateOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <Plus className="h-4 w-4" />
            Ingest / Simulate Alert
          </button>
        </div>
      </div>

      {sharedOutageResult && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900 space-y-1">
          <p className="font-semibold">Shared outage simulation complete</p>
          <p className="text-xs">
            Ingested three S3 alerts from payment-service, auth-service, and order-service. After the backend clustering lands, they should share one incident.
          </p>
          {sharedOutageResult.map((result, index) => (
            <p key={index} className="text-xs font-mono">
              {result.alert?.service || `alert ${index + 1}`}: {result.action}
              {result.incident ? ` → ${formatIncidentId(result.incident.incidentNumber)}` : ""}
            </p>
          ))}
        </div>
      )}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setTab("ALL");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === "ALL" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-800"
              }`}
            >
              All Alerts ({total})
            </button>
            <button
              onClick={() => {
                setTab("UNASSIGNED");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === "UNASSIGNED" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-800"
              }`}
            >
              Unassigned Stream
            </button>
            <button
              onClick={() => {
                setTab("CORRELATED");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === "CORRELATED" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-800"
              }`}
            >
              Correlated Clusters
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            Live Ingestion Engine Active
          </div>
        </div>

        {/* Filter row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search alert title or description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={selectedService}
            onChange={(e) => {
              setSelectedService(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Services</option>
            <option value="auth-service">auth-service</option>
            <option value="payment-service">payment-service</option>
            <option value="order-service">order-service</option>
            <option value="notification-service">notification-service</option>
            <option value="database-cluster">database-cluster</option>
            <option value="api-gateway">api-gateway</option>
            <option value="search-indexer">search-indexer</option>
          </select>

          <select
            value={selectedSeverity}
            onChange={(e) => {
              setSelectedSeverity(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Severities</option>
            <option value="P1">P1 (Critical)</option>
            <option value="P2">P2 (High)</option>
            <option value="P3">P3 (Medium)</option>
            <option value="P4">P4 (Low)</option>
          </select>
        </div>
      </div>

      {/* Alert Feed Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500" />
            <p className="text-sm text-slate-400">Loading ingested telemetry stream...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-700 space-y-2">
            <AlertTriangle className="h-8 w-8 mx-auto text-rose-400" />
            <p className="text-sm">{error}</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <Bell className="h-8 w-8 mx-auto text-slate-600" />
            <p className="text-base font-semibold text-slate-700">No alerts found</p>
            <p className="text-xs text-slate-500">Try adjusting your search criteria or simulate an incoming alert.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {alerts.map((alert) => {
              const hasIncident = alert.incidentId && (typeof alert.incidentId === "object" ? alert.incidentId._id : alert.incidentId);
              const incidentObj = typeof alert.incidentId === "object" ? alert.incidentId : null;
              const incidentLink = incidentObj
                ? getIncidentRouteId(incidentObj)
                : getIncidentLinkTarget(hasIncident);

              return (
                <div
                  key={alert._id}
                  className="p-4 hover:bg-slate-100 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 text-[11px] rounded border ${getSeverityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                        {alert.service}
                      </span>
                      {alert.resource && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Resource: {alert.resource}
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200">
                        Source: {alert.source || "Prometheus"}
                      </span>
                      {alert.count && alert.count > 1 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          Occurrences: {alert.count}x
                        </span>
                      )}
                      <span className="text-xs text-slate-500 flex items-center gap-1 ml-auto sm:ml-0">
                        <Clock className="h-3 w-3" />
                        {new Date(alert.timestamp).toLocaleTimeString()} ({new Date(alert.timestamp).toLocaleDateString()})
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900">{alert.title}</h3>
                    {alert.description && (
                      <p className="text-xs text-slate-400 line-clamp-1">{alert.description}</p>
                    )}

                    {/* Correlated Incident Banner */}
                    {hasIncident ? (
                      <div className="inline-flex items-center gap-2 pt-1 text-xs">
                        <span className="text-slate-400">Correlated to:</span>
                        <Link
                          href={`/incidents/${incidentLink}`}
                          className="font-semibold text-blue-400 hover:text-blue-700 flex items-center gap-1 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded"
                        >
                          <Layers className="h-3 w-3" />
                          {incidentObj?.title || `Incident ${incidentObj?.incidentNumber ? formatIncidentId(incidentObj.incidentNumber) : hasIncident}`}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 pt-1 text-xs text-amber-400 font-mono">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Unassigned Alert Cluster
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setDetailAlert(alert)}
                      className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-300 flex items-center gap-1"
                      title="Inspect Raw Telemetry & Fingerprint"
                    >
                      <Eye className="h-3.5 w-3.5 text-blue-400" /> Details
                    </button>

                    {!hasIncident && (
                      <button
                        onClick={() => {
                          loadActiveIncidents();
                          setAssociateAlert(alert);
                          setTargetIncidentId(activeIncidents[0] ? getIncidentRouteId(activeIncidents[0]) : "");
                        }}
                        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 shadow-md shadow-blue-600/20"
                      >
                        <LinkIcon className="h-3.5 w-3.5" /> Correlate to Incident
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing page <span className="text-slate-900 font-semibold">{page}</span> of{" "}
              <span className="text-slate-900 font-semibold">{totalPages}</span> ({total} alerts)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simulate / Ingest Alert Modal */}
      {isSimulateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg p-6 bg-white border border-slate-200 rounded-xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-500" />
                Ingest Incoming Telemetry Alert
              </h3>
              <button
                onClick={() => setIsSimulateOpen(false)}
                className="text-slate-400 hover:text-slate-800 text-sm"
              >
                ✕
              </button>
            </div>

            {simResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                  simResult.action === "DEDUPLICATED"
                    ? "bg-purple-50 border-purple-200 text-purple-800"
                    : simResult.action === "CORRELATED_TO_EXISTING"
                    ? "bg-blue-50 border-blue-200 text-blue-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Result: {simResult.action}
                  {simResult.escalated && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px]">
                      SEVERITY ESCALATED
                    </span>
                  )}
                </div>
                {simResult.incident && (
                  <p>
                    Target Incident:{" "}
                    <Link
                      href={`/incidents/${getIncidentRouteId(simResult.incident)}`}
                      className="underline font-mono font-semibold"
                    >
                      {simResult.incident.title} ({formatIncidentId(simResult.incident.incidentNumber)})
                    </Link>
                  </p>
                )}
                <p className="text-[11px] opacity-80">
                  {simResult.action === "DEDUPLICATED"
                    ? "Identical alert fingerprint detected within 5 minutes. Occurrence count incremented."
                    : simResult.action === "CORRELATED_TO_EXISTING"
                    ? "Matched active incident with the same correlation key within 30 minutes."
                    : "No active incident with this correlation key within 30 minutes. Auto-created new incident."}
                </p>
              </div>
            )}

            <form onSubmit={handleSimulateAlert} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Alert Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 504 Gateway Timeout Rate > 5%"
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Target Service *</label>
                  <select
                    value={simService}
                    onChange={(e) => setSimService(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="payment-service">payment-service</option>
                    <option value="auth-service">auth-service</option>
                    <option value="order-service">order-service</option>
                    <option value="database-cluster">database-cluster</option>
                    <option value="api-gateway">api-gateway</option>
                    <option value="notification-service">notification-service</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Severity *</label>
                  <select
                    value={simSeverity}
                    onChange={(e) => setSimSeverity(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="P1">P1 (Critical - Triggers Escalation)</option>
                    <option value="P2">P2 (High)</option>
                    <option value="P3">P3 (Medium)</option>
                    <option value="P4">P4 (Low)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Source Monitor</label>
                  <input
                    type="text"
                    value={simSource}
                    onChange={(e) => setSimSource(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Shared Resource</label>
                  <input
                    type="text"
                    value={simResource}
                    onChange={(e) => setSimResource(e.target.value)}
                    placeholder="e.g. s3, redis, kafka"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={simDescription}
                  onChange={(e) => setSimDescription(e.target.value)}
                  placeholder="Additional telemetry details or stacktrace..."
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSimulateOpen(false)}
                  className="px-3.5 py-1.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isSimulating ? "Ingesting..." : "Send Ingest Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Associate Modal */}
      {associateAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Associate Alert to Incident</h3>
              <button
                onClick={() => setAssociateAlert(null)}
                className="text-slate-400 hover:text-slate-800 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
              <p className="font-semibold text-slate-800">{associateAlert.title}</p>
              <p className="text-slate-400">
                Service: <span className="font-mono text-slate-700">{associateAlert.service}</span> | Severity:{" "}
                <span className="font-mono text-slate-700">{associateAlert.severity}</span>
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Choose Active Incident (OPEN, INVESTIGATING, MITIGATED)</label>
              {activeIncidents.length === 0 ? (
                <p className="mt-1.5 text-xs text-slate-500">No active incidents available to associate.</p>
              ) : (
                <select
                  value={targetIncidentId}
                  onChange={(e) => setTargetIncidentId(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select incident...</option>
                  {activeIncidents.map((inc) => (
                    <option key={inc._id} value={getIncidentRouteId(inc)}>
                      [{inc.severity}] [{inc.status}] {formatIncidentId(inc.incidentNumber)} - {inc.title} ({(inc.services || []).join(", ")})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssociateAlert(null)}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleManualAssociate}
                disabled={isAssociating || !targetIncidentId}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {isAssociating ? "Associating..." : "Confirm Association"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Details & Raw Payload Drawer Modal */}
      {detailAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl p-6 bg-white border border-slate-200 rounded-xl shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Hash className="h-4 w-4 text-blue-400" />
                Alert Telemetry Inspection
              </h3>
              <button
                onClick={() => setDetailAlert(null)}
                className="text-slate-400 hover:text-slate-800 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">Title</span>
                <p className="text-sm font-bold text-slate-900">{detailAlert.title}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Service</span>
                  <p className="font-mono text-slate-800">{detailAlert.service}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Severity</span>
                  <p className="font-mono text-slate-800">{detailAlert.severity}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Source</span>
                  <p className="font-mono text-slate-800">{detailAlert.source}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Occurrences</span>
                  <p className="font-mono text-slate-800">{detailAlert.count || 1}x</p>
                </div>
                {detailAlert.resource && (
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">Resource</span>
                    <p className="font-mono text-slate-800">{detailAlert.resource}</p>
                  </div>
                )}
              </div>

              {detailAlert.fingerprint && (
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
                    Deduplication Fingerprint (SHA-256)
                  </span>
                  <p className="p-2 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] text-purple-700 break-all">
                    {detailAlert.fingerprint}
                  </p>
                </div>
              )}

              <div>
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
                  Raw Telemetry Payload
                </span>
                <pre className="p-3 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] text-slate-700 overflow-x-auto max-h-48">
                  {JSON.stringify(detailAlert.rawPayload || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDetailAlert(null)}
                className="px-4 py-1.5 rounded bg-slate-100 text-slate-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

