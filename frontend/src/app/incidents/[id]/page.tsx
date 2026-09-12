"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import {
  Incident,
  Alert,
  Task,
  Comment,
  AuditEvent,
  AIInvestigation,
  IncidentSeverity,
  IncidentStatus,
  User,
  Team,
} from "../../../types";
import {
  ArrowLeft,
  Shield,
  CheckCircle,
  AlertTriangle,
  Clock,
  Send,
  Plus,
  Trash2,
  Cpu,
  UserCheck,
  RefreshCw,
  Tag,
  CheckSquare,
  Square,
  Activity,
  ChevronDown,
  Layers,
  Radio,
  ShieldAlert,
  Check,
  XCircle,
} from "lucide-react";
import { useSocket } from "../../../context/SocketContext";
import { formatIncidentId, getIncidentLinkTarget, getIncidentRouteId } from "../../../lib/incident-id";

function incidentMatchesQuery(inc: Incident, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const idLabel = formatIncidentId(inc.incidentNumber).toLowerCase();
  const compactQ = q.replace(/^inc-/, "");
  return (
    idLabel.includes(q) ||
    idLabel.replace(/^inc-/, "").includes(compactQ) ||
    inc._id.toLowerCase().includes(q) ||
    inc.title.toLowerCase().includes(q) ||
    (inc.services || []).some((serviceName) => serviceName.toLowerCase().includes(q))
  );
}

function resolveMergedBanner(
  mergedIntoId: string | Incident | null | undefined,
  mergedInto: Incident | null,
): { href: string; label: string } | null {
  const populated =
    mergedInto ||
    (mergedIntoId && typeof mergedIntoId === "object" ? mergedIntoId : null);

  if (populated) {
    return {
      href: `/incidents/${getIncidentLinkTarget(populated)}`,
      label: formatIncidentId(populated.incidentNumber),
    };
  }

  if (typeof mergedIntoId === "string" && mergedIntoId) {
    return {
      href: `/incidents/${mergedIntoId}`,
      label: mergedIntoId.startsWith("INC-") ? mergedIntoId : "surviving ticket",
    };
  }

  return null;
}

export default function IncidentDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();
  const { socket, joinIncident, leaveIncident, reconnectEpoch, isConnected } = useSocket();

  // State
  const [incident, setIncident] = useState<Incident | null>(null);
  const [relatedIncidents, setRelatedIncidents] = useState<Incident[]>([]);
  const [mergedInto, setMergedInto] = useState<Incident | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [aiInvestigation, setAiInvestigation] = useState<AIInvestigation | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Phase 7: Action approval & rejection states
  const [isApprovingAction, setIsApprovingAction] = useState(false);
  const [isRejectingAction, setIsRejectingAction] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [candidateIncidents, setCandidateIncidents] = useState<Incident[]>([]);
  const [relateTargetId, setRelateTargetId] = useState("");
  const [relateSearch, setRelateSearch] = useState("");
  const [isRelating, setIsRelating] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  const isAdmin = user?.role === "ADMIN";
  const currentUserId = user?.id || user?._id || "";
  const isAssignedToMe =
    !!incident?.assigneeId &&
    (incident.assigneeId._id === currentUserId ||
      (incident.assigneeId as any) === currentUserId ||
      (typeof incident.assigneeId === "object" &&
        (incident.assigneeId as User).id === currentUserId));

  const fetchIncidentDetail = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.incidents.get(id);
      const loaded: Incident = data.incident;
      setIncident(loaded);
      setRelatedIncidents(
        loaded.relatedIncidents?.length
          ? loaded.relatedIncidents
          : data.relatedIncidents || [],
      );
      const mergedRef = loaded.mergedIntoId;
      setMergedInto(
        data.mergedInto ||
          (mergedRef && typeof mergedRef === "object" ? mergedRef : null),
      );
      setAlerts(data.alerts || []);
      setTasks(data.tasks || []);
      setComments(data.comments || []);
      setAuditEvents(data.auditEvents || []);
      setAiInvestigation(data.aiInvestigation || null);
    } catch (err: any) {
      if (silent) {
        setActionError(err.message || "Failed to refresh incident");
      } else {
        setError(err.message || "Failed to load incident detail");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchIncidentDetail();
    Promise.all([
      api.users.list(),
      api.teams.list(),
      api.incidents.list({ limit: 100, excludeStatus: "RESOLVED" }),
    ])
      .then(([u, t, incidentsRes]) => {
        setUsers(u);
        setTeams(t);
        setCandidateIncidents(incidentsRes.data || []);
      })
      .catch(() => {});
  }, [fetchIncidentDetail]);

  const loadCandidateIncidents = useCallback(() => {
    api.incidents
      .list({ limit: 100, excludeStatus: "RESOLVED" })
      .then((incidentsRes) => setCandidateIncidents(incidentsRes.data || []))
      .catch(() => {});
  }, []);

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const refreshAudit = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.incidents.get(id);
      setAuditEvents(data.auditEvents || []);
    } catch {}
  }, [id]);

  // Reconnect handling: full REST refetch on socket reconnection
  useEffect(() => {
    if (reconnectEpoch > 0) {
      fetchIncidentDetail();
    }
  }, [reconnectEpoch, fetchIncidentDetail]);

  // Realtime Socket.IO room subscription and event listeners
  useEffect(() => {
    if (!incident?._id) return;
    const socketIncidentId = incident._id;
    joinIncident(socketIncidentId);

    if (!socket) return;

    const matchesIncident = (updatedIncident: any) =>
      updatedIncident._id === socketIncidentId ||
      updatedIncident.incidentNumber === incident.incidentNumber;

    const onStatusChanged = (updatedIncident: any) => {
      if (matchesIncident(updatedIncident)) {
        setIncident((prev) =>
          prev
            ? { ...prev, status: updatedIncident.status, resolvedAt: updatedIncident.resolvedAt }
            : null
        );
        showNotification(`Live update: Status changed to ${updatedIncident.status}`);
        refreshAudit();
      }
    };

    const onSeverityChanged = (updatedIncident: any) => {
      if (matchesIncident(updatedIncident)) {
        setIncident((prev) =>
          prev ? { ...prev, severity: updatedIncident.severity } : null
        );
        showNotification(`Live update: Severity changed to ${updatedIncident.severity}`);
        refreshAudit();
      }
    };

    const onAssigned = (updatedIncident: any) => {
      if (matchesIncident(updatedIncident)) {
        setIncident((prev) =>
          prev
            ? {
                ...prev,
                assigneeId: updatedIncident.assigneeId,
                teamId: updatedIncident.teamId,
              }
            : null
        );
        showNotification("Live update: Incident assignment updated");
        refreshAudit();
      }
    };

    const onUpdated = (updatedIncident: any) => {
      if (matchesIncident(updatedIncident)) {
        setIncident((prev) => (prev ? { ...prev, ...updatedIncident } : null));
        refreshAudit();
      }
    };

    const onCommentCreated = (comment: Comment) => {
      setComments((prev) => {
        if (prev.some((c) => c._id === comment._id)) return prev;
        return [...prev, comment];
      });
      refreshAudit();
    };

    const onTaskCreated = (task: Task) => {
      setTasks((prev) => {
        if (prev.some((t) => t._id === task._id)) return prev;
        return [...prev, task];
      });
      refreshAudit();
    };

    const onTaskUpdated = (task: Task) => {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t)));
      refreshAudit();
    };

    const onTaskDeleted = ({ taskId }: { taskId: string }) => {
      setTasks((prev) => prev.filter((t) => t._id !== taskId));
      refreshAudit();
    };

    const onAlertAssociated = (alert: Alert) => {
      setAlerts((prev) => {
        if (prev.some((a) => a._id === alert._id)) return prev;
        return [alert, ...prev];
      });
      refreshAudit();
    };

    const onAIEvent = (aiEvent: { type: string; data?: any }) => {
      showNotification(`AI Engine: ${aiEvent.type}`);
      if (aiEvent.type === "investigation_queued") {
        setAiInvestigation((prev) => ({
          ...(prev || ({} as any)),
          status: "QUEUED",
          summary: "Investigation enqueued in BullMQ background queue...",
        }));
      } else if (
        aiEvent.type === "investigation_started" ||
        aiEvent.type === "gathering_context" ||
        aiEvent.type === "context_ready" ||
        aiEvent.type === "reasoning" ||
        aiEvent.type === "validating_output"
      ) {
        setAiInvestigation((prev) => ({
          ...(prev || ({} as any)),
          status: "RUNNING",
          summary: aiEvent.data?.step || prev?.summary || "Investigating incident telemetry...",
        }));
      } else if (
        aiEvent.type === "completed" ||
        aiEvent.type === "action_executed" ||
        aiEvent.type === "action_rejected"
      ) {
        fetchIncidentDetail();
      } else if (aiEvent.type === "failed") {
        setAiInvestigation((prev) => ({
          ...(prev || ({} as any)),
          status: "FAILED",
          error: aiEvent.data?.error || "Investigation failed",
        }));
      }
    };

    socket.on("incident:status_changed", onStatusChanged);
    socket.on("incident:severity_changed", onSeverityChanged);
    socket.on("incident:assigned", onAssigned);
    socket.on("incident:updated", onUpdated);
    socket.on("comment:created", onCommentCreated);
    socket.on("task:created", onTaskCreated);
    socket.on("task:updated", onTaskUpdated);
    socket.on("task:deleted", onTaskDeleted);
    socket.on("alert:associated", onAlertAssociated);
    socket.on("ai:investigation_event", onAIEvent);

    return () => {
      leaveIncident(socketIncidentId);
      socket.off("incident:status_changed", onStatusChanged);
      socket.off("incident:severity_changed", onSeverityChanged);
      socket.off("incident:assigned", onAssigned);
      socket.off("incident:updated", onUpdated);
      socket.off("comment:created", onCommentCreated);
      socket.off("task:created", onTaskCreated);
      socket.off("task:updated", onTaskUpdated);
      socket.off("task:deleted", onTaskDeleted);
      socket.off("alert:associated", onAlertAssociated);
      socket.off("ai:investigation_event", onAIEvent);
    };
  }, [incident?._id, incident?.incidentNumber, socket, joinIncident, leaveIncident, refreshAudit, fetchIncidentDetail]);

  const [isTriggeringAI, setIsTriggeringAI] = useState(false);

  const handleTriggerInvestigation = async () => {
    if (!id) return;
    setIsTriggeringAI(true);
    try {
      const res = await api.ai.investigate(id);
      setAiInvestigation(res.investigation);
      showNotification(res.message || "AI Investigation queued");
    } catch (err: any) {
      setError(err.message || "Failed to trigger AI investigation");
    } finally {
      setIsTriggeringAI(false);
    }
  };

  // Phase 7: Approve & Execute Action
  const handleApproveAction = async (force = false) => {
    if (!id || !aiInvestigation?._id) return;
    setIsApprovingAction(true);
    setActionError(null);
    try {
      const res = await api.ai.approveAction(id, aiInvestigation._id, force);
      showNotification(`Action approved & executed: ${res.action?.type || "Success"}`);
      await fetchIncidentDetail();
    } catch (err: any) {
      setActionError(err.message || "Failed to approve and execute action");
    } finally {
      setIsApprovingAction(false);
    }
  };

  // Phase 7: Reject Proposed Action
  const handleRejectAction = async () => {
    if (!id || !aiInvestigation?._id) return;
    setIsRejectingAction(true);
    setActionError(null);
    try {
      await api.ai.rejectAction(id, aiInvestigation._id, rejectReason);
      showNotification("Proposed action was rejected");
      setShowRejectModal(false);
      setRejectReason("");
      await fetchIncidentDetail();
    } catch (err: any) {
      setActionError(err.message || "Failed to reject action");
    } finally {
      setIsRejectingAction(false);
    }
  };

  // Status Change
  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident) return;
    try {
      const updated = await api.incidents.changeStatus(incident._id, newStatus);
      setIncident((prev) => (prev ? { ...prev, status: updated.status, resolvedAt: updated.resolvedAt } : null));
      showNotification(`Status updated to ${newStatus}`);
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Severity Change
  const handleSeverityChange = async (newSeverity: IncidentSeverity) => {
    if (!incident) return;
    try {
      const updated = await api.incidents.changeSeverity(incident._id, newSeverity);
      setIncident((prev) => (prev ? { ...prev, severity: updated.severity } : null));
      showNotification(`Severity changed to ${newSeverity}`);
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Assign to Me / Unassign Me
  const handleAssignToMe = async () => {
    if (!incident || !user) return;
    try {
      const updated = await api.incidents.assign(incident._id, { assigneeId: user.id || user._id });
      setIncident((prev) => (prev ? { ...prev, assigneeId: updated.assigneeId } : null));
      showNotification(`Assigned to ${user.name}`);
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUnassignMe = async () => {
    if (!incident || !user) return;
    try {
      const updated = await api.incidents.assign(incident._id, { assigneeId: "" });
      setIncident((prev) => (prev ? { ...prev, assigneeId: updated.assigneeId } : null));
      showNotification("Unassigned yourself from this incident");
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Assign to User / Team (admin only in UI; backend enforces)
  const handleAssignUser = async (targetUserId: string) => {
    if (!incident) return;
    try {
      const updated = await api.incidents.assign(incident._id, { assigneeId: targetUserId || undefined });
      setIncident((prev) => (prev ? { ...prev, assigneeId: updated.assigneeId } : null));
      showNotification("Assignee updated");
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAssignTeam = async (targetTeamId: string) => {
    if (!incident) return;
    try {
      const updated = await api.incidents.assign(incident._id, { teamId: targetTeamId || undefined });
      setIncident((prev) => (prev ? { ...prev, teamId: updated.teamId } : null));
      showNotification("Team updated");
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident || !newComment.trim()) return;
    setIsPostingComment(true);
    try {
      const created = await api.comments.create(incident._id, newComment.trim());
      setComments((prev) => [...prev, created]);
      setNewComment("");
      showNotification("Comment posted");
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPostingComment(false);
    }
  };

  // Add Task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident || !newTaskTitle.trim()) return;
    setIsCreatingTask(true);
    try {
      const created = await api.tasks.create(incident._id, { title: newTaskTitle.trim() });
      setTasks((prev) => [...prev, created]);
      setNewTaskTitle("");
      showNotification("Task created");
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Toggle Task Status
  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      const updated = await api.tasks.update(task._id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.tasks.delete(taskId);
      setTasks((prev) => prev.filter((t) => t._id !== taskId));
      refreshAudit();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRelateIncident = async () => {
    if (!incident || !relateTargetId) return;
    setIsRelating(true);
    setActionError(null);
    try {
      await api.incidents.relate(getIncidentRouteId(incident), relateTargetId);
      setRelateTargetId("");
      setRelateSearch("");
      showNotification("Related incident linked");
      await fetchIncidentDetail(true);
      loadCandidateIncidents();
    } catch (err: any) {
      setActionError(err.message || "Failed to relate incident");
    } finally {
      setIsRelating(false);
    }
  };

  const handleUnrelateIncident = async (relatedId: string) => {
    if (!incident) return;
    setActionError(null);
    try {
      await api.incidents.unrelate(getIncidentRouteId(incident), relatedId);
      showNotification("Related incident removed");
      await fetchIncidentDetail(true);
      loadCandidateIncidents();
    } catch (err: any) {
      setActionError(err.message || "Failed to unrelate incident");
    }
  };

  const handleMergeIncident = async () => {
    if (!incident || !relateTargetId) return;
    setIsMerging(true);
    setActionError(null);
    try {
      await api.incidents.merge(getIncidentRouteId(incident), relateTargetId);
      setShowMergeConfirm(false);
      setRelateTargetId("");
      setRelateSearch("");
      showNotification("Incident merged successfully");
      await fetchIncidentDetail(true);
      loadCandidateIncidents();
    } catch (err: any) {
      setActionError(err.message || "Failed to merge incident");
    } finally {
      setIsMerging(false);
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

  if (loading) {
    return (
      <div className="p-20 text-center text-slate-400 space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500" />
        <p className="text-sm font-medium">Hydrating incident investigation context...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="p-16 text-center space-y-4 bg-white border border-slate-200 rounded-xl">
        <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Incident Unavailable</h2>
        <p className="text-sm text-slate-400">{error || "The requested incident record was not found."}</p>
        <Link
          href="/incidents"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Queue
        </Link>
      </div>
    );
  }

  const relatedTickets =
    relatedIncidents.length > 0 ? relatedIncidents : incident.relatedIncidents || [];
  const relatedIdFallbacks =
    relatedTickets.length === 0 ? incident.relatedIncidentIds || [] : [];
  const relatedIdSet = new Set<string>([
    incident._id,
    ...relatedTickets.map((related) => related._id),
    ...relatedTickets.map((related) => getIncidentRouteId(related)),
    ...relatedIdFallbacks,
  ]);
  const filteredCandidates = candidateIncidents.filter((candidate) => {
    if (relatedIdSet.has(candidate._id) || relatedIdSet.has(getIncidentRouteId(candidate))) {
      return false;
    }
    return incidentMatchesQuery(candidate, relateSearch);
  });
  const selectedCandidate = candidateIncidents.find(
    (candidate) =>
      getIncidentRouteId(candidate) === relateTargetId || candidate._id === relateTargetId,
  );
  const mergedBanner = resolveMergedBanner(incident.mergedIntoId, mergedInto);

  return (
    <div className="space-y-6">
      {/* Toast banner */}
      {actionSuccess && (
        <div className="fixed top-20 right-8 z-50 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          {actionSuccess}
        </div>
      )}

      {/* Back button & quick navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Incident Queue
        </Link>
        <span className="text-xs font-mono text-slate-500">
          ID: {formatIncidentId(incident.incidentNumber)}
        </span>
      </div>

      {mergedBanner && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          Merged into{" "}
          <Link href={mergedBanner.href} className="font-semibold underline">
            {mergedBanner.label}
          </Link>
          . Alerts and blast radius now live on the surviving ticket.
        </div>
      )}

      {/* Incident Header & Quick Actions Bar */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 text-xs rounded border ${getSeverityBadge(incident.severity)}`}>
                {incident.severity}
              </span>
              <span className={`px-2.5 py-0.5 text-xs rounded border ${getStatusBadge(incident.status)}`}>
                {incident.status}
              </span>
              {(incident.services || []).slice(0, 3).map((svc) => (
                <span
                  key={svc}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300"
                >
                  {svc}
                </span>
              ))}
              {(incident.services || []).length > 3 && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-300">
                  +{(incident.services || []).length - 3}
                </span>
              )}
              {incident.resolvedAt && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Resolved
                </span>
              )}
              <span
                title="Realtime collaboration active"
                className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 font-mono"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Sync
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{incident.title}</h1>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Change Dropdown */}
            <select
              value={incident.status}
              onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
              className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="OPEN">Mark OPEN</option>
              <option value="INVESTIGATING">Mark INVESTIGATING</option>
              <option value="MITIGATED">Mark MITIGATED</option>
              <option value="RESOLVED">Mark RESOLVED</option>
            </select>

            {/* Severity Dropdown */}
            <select
              value={incident.severity}
              onChange={(e) => handleSeverityChange(e.target.value as IncidentSeverity)}
              className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="P1">P1 - Critical</option>
              <option value="P2">P2 - High</option>
              <option value="P3">P3 - Medium</option>
              <option value="P4">P4 - Low</option>
            </select>

            {/* Quick Assign / Unassign */}
            {!isAssignedToMe ? (
              <button
                onClick={handleAssignToMe}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium border border-slate-300 transition-colors flex items-center gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5 text-blue-400" />
                Assign to Me
              </button>
            ) : (
              <button
                onClick={handleUnassignMe}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium border border-slate-300 transition-colors flex items-center gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                Unassign Me
              </button>
            )}

            {incident.status !== "RESOLVED" && (
              <button
                onClick={() => handleStatusChange("RESOLVED")}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Resolve
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Left (Investigation & Context) / Right (Metadata, AI, Audit) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Incident Description */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-xs">Description & Scope</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Services:</span>
              {(incident.services || []).map((serviceName) => (
                <span
                  key={serviceName}
                  className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono"
                >
                  {serviceName}
                </span>
              ))}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
            {incident.tags && incident.tags.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <Tag className="h-3.5 w-3.5 text-slate-500" />
                <div className="flex flex-wrap gap-1.5">
                  {incident.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-xs rounded bg-slate-50 text-slate-400 border border-slate-200 font-mono"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Related Tickets */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                Related Tickets ({relatedTickets.length || relatedIdFallbacks.length})
              </h3>
            </div>

            {relatedTickets.length === 0 && relatedIdFallbacks.length === 0 ? (
              <p className="text-xs text-slate-500">No related tickets yet.</p>
            ) : (
              <div className="space-y-2">
                {relatedTickets.map((related) => (
                  <div
                    key={related._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div>
                      <Link
                        href={`/incidents/${getIncidentLinkTarget(related)}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {formatIncidentId(related.incidentNumber)} - {related.title}
                      </Link>
                      <p className="text-slate-500 mt-1">
                        {(related.services || []).join(", ") || "—"} | {related.status} | {related.severity}
                      </p>
                    </div>
                    {incident.status !== "RESOLVED" && (
                      <button
                        onClick={() => handleUnrelateIncident(getIncidentRouteId(related))}
                        className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                ))}
                {relatedIdFallbacks.map((relatedId) => (
                  <div
                    key={relatedId}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                  >
                    <Link
                      href={`/incidents/${relatedId}`}
                      className="font-semibold text-blue-600 hover:underline font-mono"
                    >
                      {relatedId}
                    </Link>
                    {incident.status !== "RESOLVED" && (
                      <button
                        onClick={() => handleUnrelateIncident(relatedId)}
                        className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {actionError && (
              <div className="p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-700 flex items-start justify-between gap-2">
                <span>{actionError}</span>
                <button
                  onClick={() => setActionError(null)}
                  className="text-rose-400 hover:text-rose-800 font-bold"
                >
                  ×
                </button>
              </div>
            )}

            {incident.status !== "RESOLVED" && !incident.mergedIntoId && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <label className="text-xs font-semibold text-slate-700">Relate or merge with another ticket</label>
                <input
                  type="text"
                  value={relateSearch}
                  onChange={(e) => setRelateSearch(e.target.value)}
                  placeholder="Search by INC-xxxx, title, or service..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <select
                  value={relateTargetId}
                  onChange={(e) => setRelateTargetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900"
                >
                  <option value="">Select incident...</option>
                  {filteredCandidates.map((candidate) => (
                    <option key={candidate._id} value={getIncidentRouteId(candidate)}>
                      [{candidate.status}] {formatIncidentId(candidate.incidentNumber)} - {candidate.title} ({(candidate.services || []).join(", ")})
                    </option>
                  ))}
                </select>
                {filteredCandidates.length === 0 && (
                  <p className="text-[11px] text-slate-500">No matching active tickets.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleRelateIncident}
                    disabled={!relateTargetId || isRelating || isMerging}
                    className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {isRelating ? "Linking..." : "Relate"}
                  </button>
                  <button
                    onClick={() => setShowMergeConfirm(true)}
                    disabled={!relateTargetId || isRelating || isMerging}
                    className="px-3 py-1.5 rounded bg-amber-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Merge Into{selectedCandidate ? ` ${formatIncidentId(selectedCandidate.incidentNumber)}` : ""}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Correlated Alerts */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Correlated Incoming Alerts ({alerts.length})
              </h3>
              <span className="text-xs text-slate-500">Services: {(incident.services || []).join(", ")}</span>
            </div>

            {alerts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No alerts correlated with this incident yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {alerts.map((al) => (
                  <div
                    key={al._id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{al.title}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(al.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-400">{al.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono">
                        {al.service}
                      </span>
                      {al.resource && (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-mono">
                          {al.resource}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono">
                        {al.source}
                      </span>
                      <span>Severity: {al.severity}</span>
                      {al.rawPayload && Object.keys(al.rawPayload).length > 0 && (
                        <span className="text-blue-400 font-mono">
                          payload: {JSON.stringify(al.rawPayload)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mitigation Tasks */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-blue-400" />
                Remediation & Action Tasks ({tasks.filter((t) => t.status === "COMPLETED").length}/{tasks.length})
              </h3>
            </div>

            {/* Task list */}
            {tasks.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No tasks added for this incident yet.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task._id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      task.status === "COMPLETED"
                        ? "bg-slate-50 border-slate-200 text-slate-500 line-through"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer flex-1"
                      onClick={() => handleToggleTask(task)}
                    >
                      {task.status === "COMPLETED" ? (
                        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-500 hover:text-slate-700 shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-medium">{task.title}</p>
                        {task.description && <p className="text-[11px] text-slate-400 no-underline">{task.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {task.assigneeId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-400">
                          {task.assigneeId.name}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteTask(task._id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete Task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Task Input */}
            <form onSubmit={handleAddTask} className="flex gap-2 pt-2 border-t border-slate-200">
              <input
                type="text"
                required
                placeholder="Add mitigation task (e.g. restart pod, scale database pool)..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isCreatingTask}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add Task
              </button>
            </form>
          </div>

          {/* Real-time Operator Discussion & Notes */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Incident Discussion & Triage Log</h3>

            {comments.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No comments logged yet. Be the first to note progress.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {comments.map((cm) => (
                  <div key={cm._id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{cm.userId?.name || "Operator"}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-white text-slate-400 border border-slate-200">
                          {cm.userId?.role || "OPERATOR"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {new Date(cm.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{cm.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Post comment form */}
            <form onSubmit={handleAddComment} className="flex gap-2 pt-2 border-t border-slate-200">
              <input
                type="text"
                required
                placeholder="Log an observation, runbook link, or status update..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isPostingComment}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5 text-blue-400" /> Post
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (Sidebar: Metadata, AI, Audit) */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Incident Metadata</h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-1">Services</span>
                <div className="flex flex-wrap gap-1">
                  {(incident.services || []).map((svc) => (
                    <span
                      key={svc}
                      className="font-mono text-slate-800 font-semibold px-2 py-1 rounded bg-slate-50 border border-slate-200 inline-block"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-slate-500 block mb-1">Responsible Team</span>
                {isAdmin ? (
                  <select
                    value={incident.teamId?._id || (incident.teamId as any) || ""}
                    onChange={(e) => handleAssignTeam(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {teams.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
                    {incident.teamId ? (incident.teamId as Team).name || "Assigned" : "Unassigned"}
                  </p>
                )}
              </div>

              <div>
                <span className="text-slate-500 block mb-1">Assigned Operator</span>
                {isAdmin ? (
                  <select
                    value={incident.assigneeId?._id || (incident.assigneeId as any) || ""}
                    onChange={(e) => handleAssignUser(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id || u._id} value={u.id || u._id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
                    {incident.assigneeId
                      ? (incident.assigneeId as User).name || "Assigned"
                      : "Unassigned"}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1 text-slate-400">
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="text-slate-700 font-mono">
                    {new Date(incident.createdAt).toLocaleDateString()}{" "}
                    {new Date(incident.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Updated:</span>
                  <span className="text-slate-700 font-mono">
                    {new Date(incident.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
                {incident.resolvedAt && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Resolved:</span>
                    <span className="font-mono">{new Date(incident.resolvedAt).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Investigation Status / Findings Card */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  AI Investigation Engine
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    aiInvestigation?.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                      : aiInvestigation?.status === "RUNNING"
                      ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse font-semibold"
                      : aiInvestigation?.status === "QUEUED"
                      ? "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
                      : aiInvestigation?.status === "FAILED"
                      ? "bg-rose-50 text-rose-700 border-rose-200 font-semibold"
                      : "bg-slate-100 text-slate-400 border-slate-300"
                  }`}
                >
                  {aiInvestigation ? aiInvestigation.status : "NOT_STARTED"}
                </span>

                <button
                  onClick={handleTriggerInvestigation}
                  disabled={isTriggeringAI || aiInvestigation?.status === "RUNNING"}
                  className="px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 flex items-center gap-1 shadow-md shadow-purple-700/20"
                >
                  <RefreshCw className={`h-3 w-3 ${isTriggeringAI ? "animate-spin" : ""}`} />
                  {aiInvestigation ? "Re-investigate" : "Run AI Analysis"}
                </button>
              </div>
            </div>

            {/* Provider and Confidence Header */}
            {aiInvestigation && aiInvestigation.status === "COMPLETED" && (
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span>Engine:</span>
                  <span className="font-mono text-purple-700 font-semibold uppercase">
                    {aiInvestigation.provider || "mock"}
                  </span>
                  {aiInvestigation.latencyMs && (
                    <span className="text-slate-500 font-mono">({aiInvestigation.latencyMs}ms)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Confidence:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {aiInvestigation.confidence}%
                  </span>
                </div>
              </div>
            )}

            {/* Live Stepper for Queued / Running */}
            {aiInvestigation && (aiInvestigation.status === "RUNNING" || aiInvestigation.status === "QUEUED") && (
              <div className="p-4 rounded-lg bg-slate-50 border border-purple-200 space-y-3 animate-pulse">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-700">
                  <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
                  <span>
                    {aiInvestigation.status === "QUEUED"
                      ? "Queued in BullMQ background queue..."
                      : "Autonomous investigation in progress..."}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{aiInvestigation.summary}</p>
                <div className="space-y-1.5 pt-1 text-[11px] text-slate-400 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span>1. Enqueued to `incident-investigation` BullMQ queue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span>2. Gathering telemetry, correlated alerts, tasks, and team activity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span>3. Provider reasoning via OpenRouter / Mock fallback</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>4. Validating output with Zod & grounding evidence references</span>
                  </div>
                </div>
              </div>
            )}

            {/* Failed Error View */}
            {aiInvestigation && aiInvestigation.status === "FAILED" && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  Investigation Failed
                </div>
                <p className="text-[11px] text-rose-800">{aiInvestigation.error || "An error occurred during AI analysis."}</p>
                <button
                  onClick={handleTriggerInvestigation}
                  className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-[11px] font-semibold"
                >
                  Retry Investigation
                </button>
              </div>
            )}

            {/* Completed Investigation View */}
            {aiInvestigation && aiInvestigation.status === "COMPLETED" && (
              <div className="space-y-3.5 text-xs">
                {/* Summary */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                    Executive Summary
                  </span>
                  <p className="text-slate-800 leading-relaxed">{aiInvestigation.summary}</p>
                </div>

                {/* Hypotheses */}
                {aiInvestigation.hypotheses && aiInvestigation.hypotheses.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      Formulated Hypotheses ({aiInvestigation.hypotheses.length})
                    </span>
                    <div className="space-y-2">
                      {aiInvestigation.hypotheses.map((hypo, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800 text-xs">{hypo.title}</span>
                            <span className="font-mono text-purple-400 text-[11px] font-bold">
                              {hypo.confidence}%
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px] leading-normal">{hypo.explanation}</p>
                          <div className="w-full bg-white h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-500 h-full rounded-full transition-all"
                              style={{ width: `${hypo.confidence}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence Grounding */}
                {aiInvestigation.evidence && (aiInvestigation.evidence as any).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      Grounded Evidence References
                    </span>
                    <div className="space-y-1.5">
                      {(aiInvestigation.evidence as any[]).map((ev, idx) => {
                        const isObj = typeof ev === "object";
                        const type = isObj ? ev.type : "reference";
                        const id = isObj ? ev.id : "";
                        const reason = isObj ? ev.reason : ev;

                        return (
                          <div
                            key={idx}
                            className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] space-y-0.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase font-mono text-[9px]">
                                {type}
                              </span>
                              {id && (
                                <span className="font-mono text-slate-400 text-[10px]">
                                  #{id}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-700 text-[11px]">{reason}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {aiInvestigation.recommendations && (aiInvestigation.recommendations as any).length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      Actionable Recommendations
                    </span>
                    <div className="space-y-1.5">
                      {(aiInvestigation.recommendations as any[]).map((rec, idx) => {
                        const isObj = typeof rec === "object";
                        return (
                          <div
                            key={idx}
                            className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px]"
                          >
                            <p className="font-semibold text-slate-800">
                              {idx + 1}. {isObj ? rec.title : rec}
                            </p>
                            {isObj && rec.explanation && (
                              <p className="text-slate-400 text-[10px] mt-0.5">{rec.explanation}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Proposed Mitigation Action (Phase 7 Human Approval & Controlled Execution) */}
                {aiInvestigation.proposedAction ? (
                  <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-purple-400 shrink-0" />
                        <span className="font-bold text-purple-800 text-xs">Proposed Mitigation Action</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          aiInvestigation.proposedAction.status === 'EXECUTED'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : aiInvestigation.proposedAction.status === 'REJECTED'
                            ? 'bg-rose-50 border-rose-300 text-rose-700'
                            : 'bg-purple-100 border-purple-300 text-purple-800'
                        }`}
                      >
                        {aiInvestigation.proposedAction.status}
                      </span>
                    </div>

                    <p className="text-slate-800 text-xs font-medium leading-relaxed">
                      {aiInvestigation.proposedAction.description || aiInvestigation.proposedAction.reason}
                    </p>

                    <div className="p-2.5 rounded bg-slate-50 border border-purple-200 text-xs font-mono space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">Action Type:</span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 font-bold text-[11px]">
                          {aiInvestigation.proposedAction.type}
                        </span>
                      </div>
                      {aiInvestigation.proposedAction.parameters && (
                        <div className="text-[11px] text-slate-400">
                          <span className="text-slate-500">Parameters: </span>
                          <span className="text-purple-800">
                            {JSON.stringify(aiInvestigation.proposedAction.parameters)}
                          </span>
                        </div>
                      )}
                      {aiInvestigation.proposedAction.reason && (
                        <div className="text-[11px] text-slate-700">
                          <span className="text-purple-400 font-semibold">Rationale: </span>
                          {aiInvestigation.proposedAction.reason}
                        </div>
                      )}
                    </div>

                    {/* Action Review Outcomes if already reviewed */}
                    {aiInvestigation.proposedAction.status === 'EXECUTED' && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Action Approved & Executed</span>
                        </div>
                        <p className="text-[11px] text-slate-700">
                          Approved by <span className="font-mono text-emerald-800">{aiInvestigation.proposedAction.reviewedBy || 'Operator'}</span>
                          {aiInvestigation.proposedAction.reviewedAt && ` at ${new Date(aiInvestigation.proposedAction.reviewedAt).toLocaleTimeString()}`}.
                        </p>
                        {aiInvestigation.proposedAction.executionResult && (
                          <div className="text-[10px] font-mono text-emerald-400 bg-slate-50 p-1.5 rounded mt-1">
                            Execution Result: {JSON.stringify(aiInvestigation.proposedAction.executionResult)}
                          </div>
                        )}
                      </div>
                    )}

                    {aiInvestigation.proposedAction.status === 'REJECTED' && (
                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <XCircle className="h-3.5 w-3.5 text-rose-400" />
                          <span>Action Rejected by Operator</span>
                        </div>
                        <p className="text-[11px] text-slate-700">
                          Rejected by <span className="font-mono text-rose-800">{aiInvestigation.proposedAction.reviewedBy || 'Operator'}</span>
                          {aiInvestigation.proposedAction.reviewedAt && ` at ${new Date(aiInvestigation.proposedAction.reviewedAt).toLocaleTimeString()}`}.
                        </p>
                        {aiInvestigation.proposedAction.rejectionReason && (
                          <p className="text-[11px] text-rose-800">
                            <span className="text-slate-400">Reason: </span>
                            {aiInvestigation.proposedAction.rejectionReason}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Human Approval Gate Controls (When PENDING_APPROVAL) */}
                    {aiInvestigation.proposedAction.status === 'PENDING_APPROVAL' && (
                      <div className="space-y-2.5 pt-1.5 border-t border-purple-200">
                        <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-700 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span>Human Safety Gate: Controlled action awaits operator authorization prior to execution.</span>
                        </div>

                        {actionError && (
                          <div className="p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-700 flex items-start justify-between gap-2">
                            <span>{actionError}</span>
                            <button
                              onClick={() => setActionError(null)}
                              className="text-rose-400 hover:text-rose-800 font-bold"
                            >
                              ×
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2.5 pt-0.5">
                          <button
                            onClick={() => handleApproveAction(false)}
                            disabled={isApprovingAction || isRejectingAction}
                            className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow transition-colors"
                          >
                            {isApprovingAction ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                <span>Executing Action...</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                <span>Approve & Execute</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => setShowRejectModal(true)}
                            disabled={isApprovingAction || isRejectingAction}
                            className="py-2 px-3.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-50 text-slate-700 hover:text-rose-800 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5 text-rose-400" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-400 text-center">
                    <p className="font-semibold text-slate-700">No Automated Action Proposed</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      The AI model determined that manual operator investigation is preferred over automated remediation.
                    </p>
                  </div>
                )}
              </div>
            )}

            {!aiInvestigation && (
              <div className="p-4 rounded bg-slate-50 border border-slate-200 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  No investigation performed on this incident yet. Click &quot;Run AI Analysis&quot; to enqueue an asynchronous investigation.
                </p>
              </div>
            )}
          </div>

          {/* Activity / Audit Timeline */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-blue-400" />
              Audit Trail Timeline
            </h3>

            {auditEvents.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No audit events recorded yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {auditEvents.map((ev) => (
                  <div
                    key={ev._id}
                    className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800 font-mono">{ev.action}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phase 7: Action Rejection Modal Dialog */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-400" />
                Reject AI Proposed Action
              </h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="text-slate-400 hover:text-slate-800 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to reject the proposed action{" "}
              <span className="font-mono text-purple-700 font-semibold">
                &quot;{aiInvestigation?.proposedAction?.type}&quot;
              </span>
              ? An auditable event will be logged recording your decision and rationale.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Rejection Rationale (Optional):
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Service workload already mitigated via cache warm-up; manual verification preferred..."
                rows={3}
                className="w-full text-xs rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-slate-800 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-800 bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectAction}
                disabled={isRejectingAction}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 flex items-center gap-1.5 shadow transition-colors"
              >
                {isRejectingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showMergeConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Merge this ticket?</h3>
              <button
                onClick={() => setShowMergeConfirm(false)}
                className="text-slate-400 hover:text-slate-800 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              This will move all alerts into{" "}
              <span className="font-mono font-semibold text-slate-800">
                {selectedCandidate
                  ? formatIncidentId(selectedCandidate.incidentNumber)
                  : relateTargetId}
              </span>
              , union affected services, resolve this ticket, and set a merged-into link. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => setShowMergeConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-800 bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMergeIncident}
                disabled={isMerging}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 flex items-center gap-1.5 shadow transition-colors"
              >
                {isMerging ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Confirm Merge</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

