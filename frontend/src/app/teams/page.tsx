"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Team, User } from "../../types";
import { Modal } from "../../components/teams/Modal";
import { Toast } from "../../components/teams/Toast";
import {
  Users,
  Shield,
  Briefcase,
  AlertTriangle,
  Plus,
  RefreshCw,
  UserCheck,
  Archive,
  Pencil,
  KeyRound,
  UserMinus,
  UserPlus,
  Layers,
  ChevronRight,
  ExternalLink,
  Server,
  X,
} from "lucide-react";

type Tab = "teams" | "users";

function getUserId(user: User): string {
  return user.id || user._id || "";
}

function getTeamLeadName(team: Team): string {
  if (!team.leadUserId) return "Unassigned";
  if (typeof team.leadUserId === "object") {
    return team.leadUserId.name || "Assigned";
  }
  return "Assigned";
}

function getUserTeamName(user: User): string {
  if (!user.teamId) return "None";
  if (typeof user.teamId === "object") {
    return user.teamId.name || "Assigned";
  }
  return "Assigned";
}

export default function TeamsAndUsersPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState<Tab>("teams");
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [servicesInput, setServicesInput] = useState("");
  const [teamLeadId, setTeamLeadId] = useState("");

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [userTeamId, setUserTeamId] = useState("");
  const [userIsActive, setUserIsActive] = useState(true);
  const [resetPassword, setResetPassword] = useState("");

  const [addMemberUserId, setAddMemberUserId] = useState("");

  const selectedTeam = useMemo(
    () => teams.find((t) => t._id === selectedTeamId) || null,
    [teams, selectedTeamId],
  );

  const activeTeams = useMemo(
    () => teams.filter((t) => !t.isArchived),
    [teams],
  );

  const unassignedUsers = useMemo(() => {
    return users.filter((u) => {
      if (!u.isActive) return false;
      if (!u.teamId) return true;
      if (typeof u.teamId === "object") return !u.teamId._id;
      return false;
    });
  }, [users]);

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamWorkload, userWorkload] = await Promise.all([
        api.teams.workload(showArchived),
        api.users.workload(showInactive),
      ]);
      setTeams(teamWorkload);
      setUsers(userWorkload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load teams & users";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [showArchived, showInactive]);

  const fetchTeamMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true);
    try {
      const members = await api.teams.members(teamId);
      setTeamMembers(members);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load team members";
      setError(message);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedTeamId) {
      fetchTeamMembers(selectedTeamId);
    } else {
      setTeamMembers([]);
    }
  }, [selectedTeamId, fetchTeamMembers]);

  const openCreateTeam = () => {
    setEditingTeam(null);
    setTeamName("");
    setTeamDesc("");
    setServicesInput("");
    setTeamLeadId("");
    setTeamModalOpen(true);
  };

  const openEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamDesc(team.description || "");
    setServicesInput(team.serviceResponsibility.join(", "));
    const leadId =
      team.leadUserId && typeof team.leadUserId === "object"
        ? getUserId(team.leadUserId as User)
        : typeof team.leadUserId === "string"
          ? team.leadUserId
          : "";
    setTeamLeadId(leadId);
    setTeamModalOpen(true);
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("OPERATOR");
    setUserTeamId(selectedTeamId || "");
    setUserIsActive(true);
    setResetPassword("");
    setUserModalOpen(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPassword("");
    setUserRole(user.role);
    const teamId =
      user.teamId && typeof user.teamId === "object"
        ? user.teamId._id
        : typeof user.teamId === "string"
          ? user.teamId
          : "";
    setUserTeamId(teamId);
    setUserIsActive(user.isActive ?? true);
    setResetPassword("");
    setUserModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const services = servicesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (editingTeam) {
        await api.teams.update(editingTeam._id, {
          name: teamName,
          description: teamDesc,
          serviceResponsibility: services,
          leadUserId: teamLeadId || null,
        });
        showNotification("Team updated successfully");
      } else {
        await api.teams.create({
          name: teamName,
          description: teamDesc,
          serviceResponsibility: services,
          leadUserId: teamLeadId || undefined,
        });
        showNotification("Team created successfully");
      }

      setTeamModalOpen(false);
      await fetchData();
      if (selectedTeamId && editingTeam) {
        await fetchTeamMembers(selectedTeamId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save team";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveTeam = async (team: Team) => {
    if (!confirm(`Archive team "${team.name}"? Members will remain assigned until you move them.`)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.teams.update(team._id, { isArchived: true });
      if (selectedTeamId === team._id) {
        setSelectedTeamId(null);
      }
      showNotification("Team archived");
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to archive team";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreTeam = async (team: Team) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.teams.update(team._id, { isArchived: false });
      showNotification("Team restored");
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to restore team";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeamId || !addMemberUserId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await api.teams.updateMembers(selectedTeamId, {
        addUserIds: [addMemberUserId],
      });
      setTeamMembers(updated);
      setAddMemberUserId("");
      showNotification("Member added to team");
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add member";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeamId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await api.teams.updateMembers(selectedTeamId, {
        removeUserIds: [userId],
      });
      setTeamMembers(updated);
      showNotification("Member removed from team");
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove member";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingUser) {
        await api.users.update(getUserId(editingUser), {
          name: userName,
          role: userRole,
          teamId: userTeamId || null,
          isActive: userIsActive,
        });
        if (resetPassword.trim()) {
          await api.users.resetPassword(getUserId(editingUser), resetPassword);
        }
        showNotification("User updated successfully");
      } else {
        await api.users.create({
          name: userName,
          email: userEmail,
          password: userPassword,
          role: userRole,
          teamId: userTeamId || undefined,
        });
        showNotification("User created successfully");
      }

      setUserModalOpen(false);
      await fetchData();
      if (selectedTeamId) {
        await fetchTeamMembers(selectedTeamId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save user";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-500";

  return (
    <div className="space-y-6">
      {actionSuccess && <Toast message={actionSuccess} />}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Users className="h-6 w-6 text-blue-500" />
            Users & Teams
          </h1>
          <p className="text-sm text-slate-400">
            {isAdmin
              ? "Manage platform users, teams, membership, and operational workload."
              : "View team topology and operator workload (read-only)."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {isAdmin && activeTab === "users" && (
            <button
              onClick={openCreateUser}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          )}
          {isAdmin && activeTab === "teams" && (
            <button
              onClick={openCreateTeam}
              className="px-3.5 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Team
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("teams")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "teams"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-slate-400 hover:text-slate-700"
          }`}
        >
          Teams ({teams.length})
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "users"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-400 hover:text-slate-700"
          }`}
        >
          Users ({users.length})
        </button>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-4 pb-2">
            {activeTab === "teams" && (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show archived
              </label>
            )}
            {activeTab === "users" && (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400" />
          {error}
        </div>
      )}

      {activeTab === "teams" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: Teams Directory Overview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-purple-600" />
                  Teams Directory
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    {teams.length} {teams.length === 1 ? "team" : "teams"}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select any team card below to inspect full operational details and manage members.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400 bg-white border border-slate-200 rounded-xl">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-purple-600" />
              </div>
            ) : teams.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-white border border-slate-200 rounded-xl">
                <p className="text-sm font-semibold">No teams configured</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.map((team) => {
                  const isSelected = selectedTeamId === team._id;
                  return (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => setSelectedTeamId(team._id)}
                      className={`group relative text-left p-5 rounded-xl border transition-all space-y-3 border-l-4 ${
                        isSelected
                          ? "bg-purple-50/20 border-purple-400 border-l-purple-600 ring-2 ring-purple-100 shadow-xs"
                          : "bg-white border-slate-200 border-l-slate-300 hover:border-slate-300 hover:border-l-purple-400 hover:shadow-xs"
                      } ${team.isArchived ? "opacity-75" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-950 transition-colors">
                              {team.name}
                            </h3>
                            {isSelected && (
                              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-pulse" />
                                Details Open
                              </span>
                            )}
                          </div>
                          {team.isArchived && (
                            <span className="mt-1 inline-block text-[10px] uppercase font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {(team.criticalIncidents ?? 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              {team.criticalIncidents} Critical
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                            {team.activeIncidents || 0} Active
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {team.description || "No operational description provided."}
                      </p>

                      <div className="flex flex-wrap gap-1 items-center">
                        {team.serviceResponsibility && team.serviceResponsibility.length > 0 ? (
                          team.serviceResponsibility.slice(0, 3).map((service) => (
                            <span
                              key={service}
                              className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {service}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No services assigned</span>
                        )}
                        {team.serviceResponsibility && team.serviceResponsibility.length > 3 && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            +{team.serviceResponsibility.length - 3} more
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2.5 border-t border-slate-100">
                        <span className="truncate max-w-[140px]">Lead: {getTeamLeadName(team)}</span>
                        <span className="flex items-center gap-1 font-medium">
                          {team.memberCount ?? 0} members
                          <ChevronRight
                            className={`h-3.5 w-3.5 transition-transform ${
                              isSelected
                                ? "text-purple-600 translate-x-0.5"
                                : "text-slate-400 group-hover:translate-x-0.5 group-hover:text-purple-600"
                            }`}
                          />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Team Details Inspector */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-600" />
                  Team Details
                  <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Inspector
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Deep-dive operational configuration & roster.
                </p>
              </div>
              {selectedTeam && (
                <button
                  type="button"
                  onClick={() => setSelectedTeamId(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                  title="Deselect and close details inspector"
                >
                  <X className="h-3.5 w-3.5 text-slate-400" />
                  <span>Close</span>
                </button>
              )}
            </div>

            {!selectedTeam ? (
              <div className="p-8 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl space-y-3">
                <div className="h-12 w-12 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center mx-auto text-purple-600">
                  <Briefcase className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">No Team Selected</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Click any team card from the directory on the left to inspect full service ownership, team lead contact, live incident metrics, and manage members.
                  </p>
                </div>
                {teams.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTeamId(teams[0]._id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
                  >
                    Inspect {teams[0].name}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="sticky top-20 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden divide-y divide-slate-100">
                {/* Header Section */}
                <div className="p-5 space-y-3 bg-gradient-to-b from-purple-50/30 to-transparent">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                          {selectedTeam.name}
                        </h3>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                            selectedTeam.isArchived
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {selectedTeam.isArchived ? "Archived" : "Active"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {selectedTeam.description || "No operational description set."}
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!selectedTeam.isArchived ? (
                          <>
                            <button
                              onClick={() => openEditTeam(selectedTeam)}
                              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                              title="Edit team settings"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleArchiveTeam(selectedTeam)}
                              className="p-2 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-500 transition-colors"
                              title="Archive team"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleRestoreTeam(selectedTeam)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Workload & Incident Metrics Differentiator */}
                <div className="p-4 bg-slate-50/50">
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-xs">
                      <div className="text-lg font-bold font-mono text-blue-700">
                        {selectedTeam.activeIncidents ?? 0}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Active
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-xs">
                      <div
                        className={`text-lg font-bold font-mono ${
                          (selectedTeam.criticalIncidents ?? 0) > 0 ? "text-rose-600" : "text-slate-700"
                        }`}
                      >
                        {selectedTeam.criticalIncidents ?? 0}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Critical
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-xs">
                      <div className="text-lg font-bold font-mono text-purple-700">
                        {teamMembers.length}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Members
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 text-right">
                    <Link
                      href={`/incidents?teamId=${selectedTeam._id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <span>View team incidents in queue</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* Leadership & Service Ownership Details */}
                <div className="p-5 space-y-4">
                  {/* Team Lead Profile */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-slate-400" />
                      Team Leadership
                    </h4>
                    {selectedTeam.leadUserId && typeof selectedTeam.leadUserId === "object" ? (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                            {selectedTeam.leadUserId.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-900">
                              {selectedTeam.leadUserId.name}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {selectedTeam.leadUserId.email}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-100 text-purple-800 border border-purple-200">
                          Lead
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-500 italic flex items-center justify-between">
                        <span>No Team Lead assigned</span>
                        {isAdmin && !selectedTeam.isArchived && (
                          <button
                            type="button"
                            onClick={() => openEditTeam(selectedTeam)}
                            className="text-xs font-semibold text-purple-700 hover:underline"
                          >
                            Assign Lead
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Services Responsibility */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <Server className="h-3.5 w-3.5 text-slate-400" />
                      Services Owned ({selectedTeam.serviceResponsibility?.length ?? 0})
                    </h4>
                    {selectedTeam.serviceResponsibility && selectedTeam.serviceResponsibility.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTeam.serviceResponsibility.map((service) => (
                          <span
                            key={service}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-md bg-slate-100 text-slate-800 border border-slate-200"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {service}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No services registered under this team</p>
                    )}
                  </div>
                </div>

                {/* Membership Roster */}
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      Member Roster ({teamMembers.length})
                    </h4>
                  </div>

                  {membersLoading ? (
                    <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-600" />
                      Loading roster...
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400 italic bg-slate-50 rounded-lg border border-slate-100">
                      No members assigned to this team
                    </div>
                  ) : (
                    <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {teamMembers.map((member) => (
                        <li
                          key={getUserId(member)}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100/80 border border-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">
                                {member.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">
                                {member.email}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-600">
                              {member.role}
                            </span>
                            {isAdmin && !selectedTeam.isArchived && (
                              <button
                                onClick={() => handleRemoveMember(getUserId(member))}
                                className="p-1 rounded hover:bg-rose-50 text-rose-500 transition-colors"
                                title="Remove from team"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add Member Form for Admins */}
                  {isAdmin && !selectedTeam.isArchived && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Add or Reassign Member
                      </h5>
                      <div className="flex gap-2">
                        <select
                          value={addMemberUserId}
                          onChange={(e) => setAddMemberUserId(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select user...</option>
                          {unassignedUsers.map((u) => (
                            <option key={getUserId(u)} value={getUserId(u)}>
                              {u.name} ({u.email})
                            </option>
                          ))}
                          {users
                            .filter((u) => {
                              if (!u.isActive) return false;
                              if (!u.teamId) return false;
                              const tid =
                                typeof u.teamId === "object" ? u.teamId._id : u.teamId;
                              return tid && tid !== selectedTeam._id;
                            })
                            .map((u) => (
                              <option key={getUserId(u)} value={getUserId(u)}>
                                {u.name} (reassign from {getUserTeamName(u)})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={handleAddMember}
                          disabled={!addMemberUserId || isSubmitting}
                          className="px-3 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors flex-shrink-0"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-400" />
            Users
          </h2>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-500" />
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">No users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Active Load</th>
                      <th className="py-3 px-4 text-center">Critical</th>
                      {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {users.map((u) => (
                      <tr key={getUserId(u)} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{u.name}</td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-400">{u.email}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 text-xs rounded border ${
                              u.role === "ADMIN"
                                ? "bg-purple-50 text-purple-700 border-purple-200 font-bold"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {u.teamId ? getUserTeamName(u) : <span className="text-slate-400 italic">None</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded border ${
                              u.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-xs">
                          {u.assignedIncidents || 0}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-xs">
                          {(u.criticalIncidents ?? 0) > 0 ? (
                            <span className="text-rose-700 font-bold">{u.criticalIncidents}</span>
                          ) : (
                            0
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => openEditUser(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {teamModalOpen && isAdmin && (
        <Modal
          title={
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              {editingTeam ? "Edit Team" : "Create Team"}
            </span>
          }
          onClose={() => setTeamModalOpen(false)}
        >
          <form onSubmit={handleSaveTeam} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Team Name</label>
              <input
                type="text"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Services (comma-separated)</label>
              <input
                type="text"
                value={servicesInput}
                onChange={(e) => setServicesInput(e.target.value)}
                placeholder="gateway, payments-api"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Description</label>
              <textarea
                rows={3}
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Team Lead</label>
              <select
                value={teamLeadId}
                onChange={(e) => setTeamLeadId(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {users
                  .filter((u) => u.isActive)
                  .map((u) => (
                    <option key={getUserId(u)} value={getUserId(u)}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setTeamModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm font-semibold disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : editingTeam ? "Save Changes" : "Create Team"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {userModalOpen && isAdmin && (
        <Modal
          title={
            <span className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-400" />
              {editingUser ? "Edit User" : "Create User"}
            </span>
          }
          onClose={() => setUserModalOpen(false)}
        >
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Full Name</label>
              <input
                type="text"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className={inputClass}
              />
            </div>
            {!editingUser && (
              <div>
                <label className="text-xs font-semibold text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            {!editingUser && (
              <div>
                <label className="text-xs font-semibold text-slate-700">Temporary Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-700">Role</label>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as "ADMIN" | "OPERATOR")}
                className={inputClass}
              >
                <option value="OPERATOR">OPERATOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Team</label>
              <select
                value={userTeamId}
                onChange={(e) => setUserTeamId(e.target.value)}
                className={inputClass}
              >
                <option value="">No team</option>
                {activeTeams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {editingUser && (
              <>
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={userIsActive}
                      onChange={(e) => setUserIsActive(e.target.checked)}
                    />
                    Account active
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset Password (optional)
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Leave blank to keep current password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
