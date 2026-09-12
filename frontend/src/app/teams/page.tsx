"use client";

import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Team, User } from "../../types";
import {
  Users,
  Shield,
  Briefcase,
  AlertTriangle,
  Plus,
  CheckCircle,
  RefreshCw,
  UserCheck,
} from "lucide-react";

export default function TeamsAndUsersPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Team Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [servicesInput, setServicesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamWorkload, userWorkload] = await Promise.all([
        api.teams.workload(),
        api.users.workload(),
      ]);
      setTeams(teamWorkload);
      setUsers(userWorkload);
    } catch (err: any) {
      setError(err.message || "Failed to load teams & users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setIsSubmitting(true);
    try {
      const services = servicesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name: teamName,
          description: teamDesc,
          serviceResponsibility: services,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to create team");
        }
      });

      setIsModalOpen(false);
      setTeamName("");
      setTeamDesc("");
      setServicesInput("");
      showNotification("New operational team created successfully");
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Toast notification */}
      {actionSuccess && (
        <div className="fixed top-20 right-8 z-50 p-3 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          {actionSuccess}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="h-6 w-6 text-blue-500" />
            Users & Teams Operations
          </h1>
          <p className="text-sm text-slate-400">
            Operational team topology, service boundaries, and real-time operator incident workload distributions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
            title="Refresh Teams & Users"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {user?.role === "ADMIN" && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-purple-600/20"
            >
              <Plus className="h-4 w-4" />
              Add Team (Admin)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400" />
          {error}
        </div>
      )}

      {/* Section 1: Teams & Workloads */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-400" />
            Engineering & Operational Teams ({teams.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {teams.map((t) => (
            <div
              key={t._id}
              className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-100">{t.name}</h3>
                  <div className="flex items-center gap-1.5">
                    {t.criticalIncidents && t.criticalIncidents > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                        {t.criticalIncidents} Critical
                      </span>
                    ) : null}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
                      {t.activeIncidents || 0} Active
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{t.description}</p>

                {/* Services */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Service Ownership
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {t.serviceResponsibility.map((s, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-950 text-slate-300 border border-slate-800"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Team Lead:</span>
                <span className="font-medium text-slate-200">
                  {t.leadUserId ? (t.leadUserId as any).name || "Assigned" : "Unassigned"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Operators & User Directory */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-emerald-400" />
          Platform Operators & On-Call Directory ({users.length})
        </h2>

        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Operator Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Assigned Team</th>
                  <th className="py-3 px-4 text-center">Active Load</th>
                  <th className="py-3 px-4 text-center">Critical P1/P2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id || u._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-100 flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-blue-400">
                        {u.name.charAt(0)}
                      </div>
                      <span>{u.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-400">{u.email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-xs rounded border ${
                          u.role === "ADMIN"
                            ? "bg-purple-950 text-purple-300 border-purple-800 font-bold"
                            : "bg-blue-950 text-blue-300 border-blue-800"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      {u.teamId ? (u.teamId as any).name || "Assigned" : <span className="text-slate-500 italic">None</span>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                        {u.assignedIncidents || 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`font-mono text-xs px-2 py-0.5 rounded ${
                          u.criticalIncidents && u.criticalIncidents > 0
                            ? "bg-rose-950 text-rose-300 font-bold border border-rose-800"
                            : "text-slate-500"
                        }`}
                      >
                        {u.criticalIncidents || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Team Modal (Admin only) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-400" />
                Register Operational Team
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Team Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Edge & Networking"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Services Owned (comma-separated)</label>
                <input
                  type="text"
                  placeholder="gateway, envoy, edge-router"
                  value={servicesInput}
                  onChange={(e) => setServicesInput(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Description</label>
                <textarea
                  rows={3}
                  placeholder="Scope of operational duties and escalation path..."
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

