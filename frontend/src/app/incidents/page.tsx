"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Incident, IncidentSeverity, IncidentStatus, Team } from "../../types";
import {
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  Radio,
} from "lucide-react";
import { useSocket } from "../../context/SocketContext";
import { getIncidentRouteId, formatIncidentId } from "../../lib/incident-id";

export default function IncidentQueuePage() {
  const { user } = useAuth();
  const { socket, joinDashboard, leaveDashboard, reconnectEpoch, isConnected } = useSocket();
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveBanner, setLiveBanner] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(() => searchParams.get("status") || "");
  const [severity, setSeverity] = useState<string>(() => searchParams.get("severity") || "");
  const [severities, setSeverities] = useState<string>(() => searchParams.get("severities") || "");
  const [excludeStatus, setExcludeStatus] = useState<string>(() => searchParams.get("excludeStatus") || "");
  const [service, setService] = useState<string>(() => searchParams.get("service") || "");
  const [teamId, setTeamId] = useState<string>(() => searchParams.get("teamId") || "");
  const [assigneeId, setAssigneeId] = useState<string>(() => searchParams.get("assigneeId") || "");
  const [sortBy, setSortBy] = useState(() => searchParams.get("sortBy") || "createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const order = searchParams.get("sortOrder");
    return order === "asc" || order === "desc" ? order : "desc";
  });

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("P2");
  const [newServices, setNewServices] = useState<string[]>(["payment-service"]);
  const [newTeamId, setNewTeamId] = useState("");
  const [newTags, setNewTags] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const isAdmin = user?.role === "ADMIN";

  const SERVICE_OPTIONS = [
    "payment-service",
    "auth-service",
    "order-api",
    "inventory-service",
    "gateway",
    "notification-worker",
    "database-cluster",
  ];

  const toggleNewService = (svc: string) => {
    setNewServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc],
    );
  };

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.incidents.list({
        page,
        limit,
        search: search.trim() || undefined,
        status: status || undefined,
        severity: severities ? undefined : severity || undefined,
        severities: severities || undefined,
        excludeStatus: excludeStatus || undefined,
        service: service || undefined,
        teamId: teamId || undefined,
        assigneeId: assigneeId || undefined,
        sortBy,
        sortOrder,
      });
      setIncidents(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message || "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, status, severity, severities, excludeStatus, service, teamId, assigneeId, sortBy, sortOrder]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  useEffect(() => {
    const incidentRef = searchParams.get("incident");
    if (incidentRef) {
      router.replace(`/incidents/${incidentRef}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    api.teams.list().then(setTeams).catch(() => {});
  }, []);

  // Reconnect handling: full REST refetch on socket reconnection
  useEffect(() => {
    if (reconnectEpoch > 0) {
      fetchIncidents();
    }
  }, [reconnectEpoch, fetchIncidents]);

  // Realtime Socket.IO room and event subscriptions
  useEffect(() => {
    joinDashboard();

    if (!socket) return;

    const handleIncidentUpdate = (eventDesc: string) => (incidentData: any) => {
      setLiveBanner(`${eventDesc}: "${incidentData.title || "Incident updated"}"`);
      setTimeout(() => setLiveBanner(null), 4000);
      fetchIncidents();
    };

    const onCreated = handleIncidentUpdate("New Incident Created");
    const onUpdated = handleIncidentUpdate("Incident Updated");
    const onStatus = handleIncidentUpdate("Status Changed");
    const onSeverity = handleIncidentUpdate("Severity Changed");
    const onAssigned = handleIncidentUpdate("Assignee Changed");

    socket.on("incident:created", onCreated);
    socket.on("incident:updated", onUpdated);
    socket.on("incident:status_changed", onStatus);
    socket.on("incident:severity_changed", onSeverity);
    socket.on("incident:assigned", onAssigned);

    return () => {
      leaveDashboard();
      socket.off("incident:created", onCreated);
      socket.off("incident:updated", onUpdated);
      socket.off("incident:status_changed", onStatus);
      socket.off("incident:severity_changed", onSeverity);
      socket.off("incident:assigned", onAssigned);
    };
  }, [socket, joinDashboard, leaveDashboard, fetchIncidents]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setIsCreating(true);
    try {
      const tagsArray = newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (newServices.length === 0) {
        setCreateError("Select at least one service");
        setIsCreating(false);
        return;
      }

      const created = await api.incidents.create({
        title: newTitle,
        description: newDescription,
        severity: newSeverity,
        services: newServices,
        teamId: isAdmin && newTeamId ? newTeamId : undefined,
        tags: tagsArray,
      });

      setIsModalOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewTags("");
      fetchIncidents();
      router.push(`/incidents/${getIncidentRouteId(created)}`);
    } catch (err: any) {
      setCreateError(err.message || "Failed to create incident");
    } finally {
      setIsCreating(false);
    }
  };

  const getSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case "P1":
        return "bg-rose-50 text-rose-700 border-rose-200 font-bold";
      case "P2":
        return "bg-amber-50 text-amber-700 border-amber-200 font-semibold";
      case "P3":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "P4":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  const getStatusBadge = (stat: IncidentStatus) => {
    switch (stat) {
      case "OPEN":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "INVESTIGATING":
        return "bg-purple-50 text-purple-700 border-purple-200 animate-pulse";
      case "MITIGATED":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "RESOLVED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            Incident Queue
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-300">
              {total} Total
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            Real-time operations queue with server-side filtering, sorting, and database-level pagination.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchIncidents}
            disabled={loading}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
            title="Refresh Incidents"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <Plus className="h-4 w-4" />
            Create Incident
          </button>
        </div>
      </div>

      {/* Live Realtime Notification Banner */}
      {liveBanner && (
        <div className="flex items-center gap-2.5 p-3 bg-blue-50 border border-blue-200/80 rounded-xl text-xs text-blue-800 shadow-lg animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
          <span className="font-semibold text-blue-400">Realtime Event:</span>
          <span>{liveBanner}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search title, description, service..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="MITIGATED">Mitigated</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Severities</option>
              <option value="P1">P1 - Critical</option>
              <option value="P2">P2 - High</option>
              <option value="P3">P3 - Medium</option>
              <option value="P4">P4 - Low</option>
            </select>
          </div>

          {/* Service Filter */}
          <div>
            <select
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Services</option>
              <option value="payment-service">payment-service</option>
              <option value="auth-service">auth-service</option>
              <option value="order-api">order-api</option>
              <option value="inventory-service">inventory-service</option>
              <option value="gateway">gateway</option>
              <option value="notification-worker">notification-worker</option>
              <option value="database-cluster">database-cluster</option>
            </select>
          </div>

          {/* Team Filter */}
          <div>
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Teams</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sort and Reset bar */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <ArrowUpDown className="h-3.5 w-3.5" /> Sort by:
            </span>
            <button
              onClick={() => {
                setSortBy("createdAt");
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              }}
              className={`px-2 py-1 rounded ${
                sortBy === "createdAt" ? "bg-blue-50 text-blue-700 font-semibold" : "hover:text-slate-900"
              }`}
            >
              Date {sortBy === "createdAt" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
            <button
              onClick={() => {
                setSortBy("severity");
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              }}
              className={`px-2 py-1 rounded ${
                sortBy === "severity" ? "bg-blue-50 text-blue-700 font-semibold" : "hover:text-slate-900"
              }`}
            >
              Severity {sortBy === "severity" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
            <button
              onClick={() => {
                setSortBy("status");
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              }}
              className={`px-2 py-1 rounded ${
                sortBy === "status" ? "bg-blue-50 text-blue-700 font-semibold" : "hover:text-slate-900"
              }`}
            >
              Status {sortBy === "status" && (sortOrder === "asc" ? "↑" : "↓")}
            </button>
          </div>

          {(search || status || severity || severities || excludeStatus || service || teamId || assigneeId) && (
            <button
              onClick={() => {
                setSearch("");
                setStatus("");
                setSeverity("");
                setSeverities("");
                setExcludeStatus("");
                setService("");
                setTeamId("");
                setAssigneeId("");
                setPage(1);
              }}
              className="text-rose-400 hover:text-rose-700 underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Incidents Table Container */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-500" />
            <p className="text-sm">Querying MongoDB incident index...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              onClick={fetchIncidents}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs rounded"
            >
              Retry
            </button>
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">No Incidents Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No incident documents match your selected filters. Try broadening your query parameters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Incident Title & Service</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Assignee</th>
                  <th className="py-3 px-4 text-right">Created</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {incidents.map((inc) => (
                  <tr
                    key={inc._id}
                    className="hover:bg-slate-100 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/incidents/${getIncidentRouteId(inc)}`)}
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="text-xs font-mono font-semibold text-slate-600">
                        {formatIncidentId(inc.incidentNumber)}
                      </span>
                    </td>
                    {/* Severity */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-1 text-xs rounded border ${getSeverityBadge(
                          inc.severity,
                        )}`}
                      >
                        {inc.severity}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-1 text-xs font-medium rounded border ${getStatusBadge(
                          inc.status,
                        )}`}
                      >
                        {inc.status}
                      </span>
                    </td>

                    {/* Title & Service */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-blue-400 transition-colors line-clamp-1">
                        {inc.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {(inc.services || []).slice(0, 3).map((svc) => (
                          <span
                            key={svc}
                            className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300"
                          >
                            {svc}
                          </span>
                        ))}
                        {(inc.services || []).length > 3 && (
                          <span className="text-[10px] text-slate-400">
                            +{(inc.services || []).length - 3}
                          </span>
                        )}
                        {inc.tags && inc.tags.length > 0 && (
                          <div className="flex gap-1">
                            {inc.tags.slice(0, 2).map((tag, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1 py-0.2 rounded bg-white text-slate-400 border border-slate-200"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Team */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-700">
                      {inc.teamId ? (inc.teamId as any).name : <span className="text-slate-500 italic">Unassigned</span>}
                    </td>

                    {/* Assignee */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-700">
                      {inc.assigneeId ? (
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                            {inc.assigneeId.name.charAt(0)}
                          </div>
                          <span>{inc.assigneeId.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-right text-xs text-slate-400">
                      {new Date(inc.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/incidents/${getIncidentRouteId(inc)}`}
                        className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 inline-flex items-center transition-colors"
                        title="View Details"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="ml-2">
              Showing {total > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} of {total}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <span className="px-2 font-mono">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 flex items-center gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Create Incident Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg p-6 bg-white border border-slate-200 rounded-xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-500" />
                Declare New Incident
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateIncident} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Memory saturation on payment worker"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="P1">P1 - Critical</option>
                    <option value="P2">P2 - High</option>
                    <option value="P3">P3 - Medium</option>
                    <option value="P4">P4 - Low</option>
                  </select>
                </div>

                {isAdmin ? (
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Team</label>
                    <select
                      value={newTeamId}
                      onChange={(e) => setNewTeamId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Team (Optional)</option>
                      {teams.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Tags (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="database, oom, latency"
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Services</label>
                <div className="mt-1 flex flex-wrap gap-2 p-2 bg-slate-50 border border-slate-200 rounded">
                  {SERVICE_OPTIONS.map((svc) => {
                    const selected = newServices.includes(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => toggleNewService(svc)}
                        className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                          selected
                            ? "bg-blue-50 text-blue-700 border-blue-300"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {svc}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isAdmin && (
                <div>
                  <label className="text-xs font-semibold text-slate-700">Tags (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="database, oom, latency"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detailed description of the observed anomaly or alert triggers..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold disabled:opacity-50"
                >
                  {isCreating ? "Declaring Incident..." : "Create Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

