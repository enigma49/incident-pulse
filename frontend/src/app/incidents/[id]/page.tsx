"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { useSocket } from "../../../context/SocketContext";

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { user } = useAuth();
  const { socket, joinIncident, leaveIncident, reconnectEpoch, isConnected } = useSocket();

  // State
  const [incident, setIncident] = useState<Incident | null>(null);
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

  const fetchIncidentDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.incidents.get(id);
      setIncident(data.incident);
      setAlerts(data.alerts || []);
      setTasks(data.tasks || []);
      setComments(data.comments || []);
      setAuditEvents(data.auditEvents || []);
      setAiInvestigation(data.aiInvestigation || null);
    } catch (err: any) {
      setError(err.message || "Failed to load incident detail");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchIncidentDetail();
    Promise.all([api.users.list(), api.teams.list()])
      .then(([u, t]) => {
        setUsers(u);
        setTeams(t);
      })
      .catch(() => {});
  }, [fetchIncidentDetail]);

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const refreshAudit = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.incidents.get(id);
      setAuditEvents(data.auditEvents || []);
    } catch {
      // silent
    }
  }, [id]);

  // Reconnect handling: full REST refetch on socket reconnection
  useEffect(() => {
    if (reconnectEpoch > 0) {
      fetchIncidentDetail();
    }
  }, [reconnectEpoch, fetchIncidentDetail]);

  // Realtime Socket.IO room subscription and event listeners
  useEffect(() => {
    if (!id) return;
    joinIncident(id);

    if (!socket) return;

    const onStatusChanged = (updatedIncident: any) => {
      if (updatedIncident._id === id) {
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
      if (updatedIncident._id === id) {
        setIncident((prev) =>
          prev ? { ...prev, severity: updatedIncident.severity } : null
        );
        showNotification(`Live update: Severity changed to ${updatedIncident.severity}`);
        refreshAudit();
      }
    };

    const onAssigned = (updatedIncident: any) => {
      if (updatedIncident._id === id) {
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
      if (updatedIncident._id === id) {
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

    const onAIEvent = (aiEvent: { type: string; data: any }) => {
      showNotification(`AI Engine: ${aiEvent.type}`);
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
      leaveIncident(id);
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
  }, [id, socket, joinIncident, leaveIncident, refreshAudit]);

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

  // Assign to Me
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

  // Assign to User / Team
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

  const getSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case "P1":
        return "bg-rose-950 text-rose-300 border-rose-800 font-bold";
      case "P2":
        return "bg-amber-950 text-amber-300 border-amber-800 font-semibold";
      case "P3":
        return "bg-yellow-950 text-yellow-300 border-yellow-800";
      case "P4":
        return "bg-blue-950 text-blue-300 border-blue-800";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const getStatusBadge = (stat: IncidentStatus) => {
    switch (stat) {
      case "OPEN":
        return "bg-blue-950 text-blue-300 border-blue-800";
      case "INVESTIGATING":
        return "bg-purple-950 text-purple-300 border-purple-800 animate-pulse";
      case "MITIGATED":
        return "bg-amber-950 text-amber-300 border-amber-800";
      case "RESOLVED":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
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
      <div className="p-16 text-center space-y-4 bg-slate-900 border border-slate-800 rounded-xl">
        <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-100">Incident Unavailable</h2>
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

  return (
    <div className="space-y-6">
      {/* Toast banner */}
      {actionSuccess && (
        <div className="fixed top-20 right-8 z-50 p-3 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          {actionSuccess}
        </div>
      )}

      {/* Back button & quick navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Incident Queue
        </Link>
        <span className="text-xs font-mono text-slate-500">ID: {incident._id}</span>
      </div>

      {/* Incident Header & Quick Actions Bar */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 text-xs rounded border ${getSeverityBadge(incident.severity)}`}>
                {incident.severity}
              </span>
              <span className={`px-2.5 py-0.5 text-xs rounded border ${getStatusBadge(incident.status)}`}>
                {incident.status}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {incident.service}
              </span>
              {incident.resolvedAt && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Resolved
                </span>
              )}
              <span
                title={`Socket Room: incident:${incident._id} - Realtime Collaboration Active`}
                className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800 flex items-center gap-1.5 font-mono"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Sync
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">{incident.title}</h1>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Change Dropdown */}
            <select
              value={incident.status}
              onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-medium text-slate-200 focus:outline-none focus:border-blue-500"
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
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-medium text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="P1">P1 - Critical</option>
              <option value="P2">P2 - High</option>
              <option value="P3">P3 - Medium</option>
              <option value="P4">P4 - Low</option>
            </select>

            {/* Quick Assign to Me */}
            <button
              onClick={handleAssignToMe}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <UserCheck className="h-3.5 w-3.5 text-blue-400" />
              Assign to Me
            </button>

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
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-xs">Description & Scope</h3>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
            {incident.tags && incident.tags.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <Tag className="h-3.5 w-3.5 text-slate-500" />
                <div className="flex flex-wrap gap-1.5">
                  {incident.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-xs rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Correlated Alerts */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Correlated Incoming Alerts ({alerts.length})
              </h3>
              <span className="text-xs text-slate-500">Service: {incident.service}</span>
            </div>

            {alerts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No alerts correlated with this incident yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {alerts.map((al) => (
                  <div
                    key={al._id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{al.title}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(al.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-400">{al.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1">
                      <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono">
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
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
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
                        ? "bg-slate-950/60 border-slate-800 text-slate-500 line-through"
                        : "bg-slate-950 border-slate-800 text-slate-200"
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer flex-1"
                      onClick={() => handleToggleTask(task)}
                    >
                      {task.status === "COMPLETED" ? (
                        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-500 hover:text-slate-300 shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-medium">{task.title}</p>
                        {task.description && <p className="text-[11px] text-slate-400 no-underline">{task.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {task.assigneeId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
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
            <form onSubmit={handleAddTask} className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                required
                placeholder="Add mitigation task (e.g. restart pod, scale database pool)..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
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
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Incident Discussion & Triage Log</h3>

            {comments.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No comments logged yet. Be the first to note progress.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {comments.map((cm) => (
                  <div key={cm._id} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{cm.userId?.name || "Operator"}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {cm.userId?.role || "OPERATOR"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {new Date(cm.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap">{cm.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Post comment form */}
            <form onSubmit={handleAddComment} className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                required
                placeholder="Log an observation, runbook link, or status update..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isPostingComment}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5 text-blue-400" /> Post
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (Sidebar: Metadata, AI, Audit) */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Incident Metadata</h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-1">Service & Domain</span>
                <span className="font-mono text-slate-200 font-semibold px-2 py-1 rounded bg-slate-950 border border-slate-800 inline-block">
                  {incident.service}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block mb-1">Responsible Team</span>
                <select
                  value={incident.teamId?._id || (incident.teamId as any) || ""}
                  onChange={(e) => handleAssignTeam(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Unassigned</option>
                  {teams.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-slate-500 block mb-1">Assigned Operator</span>
                <select
                  value={incident.assigneeId?._id || (incident.assigneeId as any) || ""}
                  onChange={(e) => handleAssignUser(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id || u._id} value={u.id || u._id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1 text-slate-400">
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="text-slate-300 font-mono">
                    {new Date(incident.createdAt).toLocaleDateString()}{" "}
                    {new Date(incident.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Updated:</span>
                  <span className="text-slate-300 font-mono">
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
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-purple-400" />
                AI Investigation
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  aiInvestigation
                    ? "bg-purple-950 text-purple-300 border-purple-800"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {aiInvestigation ? aiInvestigation.status : "READY_FOR_AI"}
              </span>
            </div>

            {aiInvestigation ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-300 font-medium leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-800">
                  {aiInvestigation.summary}
                </p>

                {aiInvestigation.findings && aiInvestigation.findings.length > 0 && (
                  <div>
                    <span className="font-semibold text-slate-300 block mb-1">Key Findings:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      {aiInvestigation.findings.map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiInvestigation.recommendations && aiInvestigation.recommendations.length > 0 && (
                  <div>
                    <span className="font-semibold text-slate-300 block mb-1">Recommendations:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      {aiInvestigation.recommendations.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiInvestigation.proposedAction && (
                  <div className="p-3 bg-purple-950/40 border border-purple-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-purple-300">Proposed Action</span>
                      <span className="font-mono text-purple-400">{aiInvestigation.proposedAction.status}</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{aiInvestigation.proposedAction.reason}</p>
                    <div className="text-[10px] font-mono bg-slate-950 p-1.5 rounded text-purple-200">
                      Type: {aiInvestigation.proposedAction.type}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded bg-slate-950 border border-slate-800/80 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  AI worker pipeline ready. Asynchronous background analysis activates in Phase 6.
                </p>
              </div>
            )}
          </div>

          {/* Activity / Audit Timeline */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
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
                    className="p-2.5 rounded bg-slate-950 border border-slate-800/70 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-200 font-mono">{ev.action}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="px-1 rounded bg-slate-900 text-blue-300 border border-slate-800">
                        {ev.actorType}
                      </span>
                      <span>actor: {ev.actorId}</span>
                    </div>
                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <pre className="text-[10px] font-mono text-slate-500 overflow-x-auto bg-slate-900/50 p-1 rounded">
                        {JSON.stringify(ev.metadata)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

