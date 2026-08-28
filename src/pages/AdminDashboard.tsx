import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Eye,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Monitor,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  Star,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../utils/api";
import type { AdminAnalyticsSummary, FeedbackItem, User } from "../types";

export default function AdminDashboard() {
  const { user, token, openAuthModal } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "feedback" | "users">("overview");

  // Analytics summary state
  const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(true);

  // Feedback state
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isLoadingFeedback, setIsLoadingFeedback] = useState<boolean>(false);

  // Users state
  const [userList, setUserList] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState<string>("");
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!token || !user?.is_admin) return;
    setIsLoadingSummary(true);
    try {
      const res = await fetch(`${API_BASE}/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error("Failed to load admin summary", e);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [token, user?.is_admin]);

  // Fetch feedback
  const fetchFeedback = useCallback(async () => {
    if (!token || !user?.is_admin) return;
    setIsLoadingFeedback(true);
    try {
      const params = new URLSearchParams();
      if (feedbackFilter !== "all") params.append("status", feedbackFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);

      const res = await fetch(`${API_BASE}/admin/feedback?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFeedbackList(data.feedback || []);
      }
    } catch (e) {
      console.error("Failed to load feedback", e);
    } finally {
      setIsLoadingFeedback(false);
    }
  }, [token, user?.is_admin, feedbackFilter, categoryFilter]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!token || !user?.is_admin) return;
    setIsLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (userSearch.trim()) params.append("search", userSearch.trim());

      const res = await fetch(`${API_BASE}/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserList(data.users || []);
      }
    } catch (e) {
      console.error("Failed to load users", e);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [token, user?.is_admin, userSearch]);

  useEffect(() => {
    if (user?.is_admin) {
      fetchSummary();
    }
  }, [user?.is_admin, fetchSummary]);

  useEffect(() => {
    if (user?.is_admin && activeTab === "feedback") {
      fetchFeedback();
    }
  }, [user?.is_admin, activeTab, fetchFeedback]);

  useEffect(() => {
    if (user?.is_admin && activeTab === "users") {
      fetchUsers();
    }
  }, [user?.is_admin, activeTab, fetchUsers]);

  // Update feedback status
  const handleUpdateFeedbackStatus = async (id: number, newStatus: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/admin/feedback/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setFeedbackList((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
        );
        fetchSummary();
      }
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  // Toggle user admin
  const handleToggleAdmin = async (targetUser: User) => {
    if (!token) return;
    const makeAdmin = !targetUser.is_admin;
    const confirmText = makeAdmin
      ? `Promote "${targetUser.username}" to Admin?`
      : `Revoke Admin permissions from "${targetUser.username}"?`;

    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch(`${API_BASE}/admin/users/${targetUser.id}/toggle-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_admin: makeAdmin }),
      });

      if (res.ok) {
        setUserList((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, is_admin: makeAdmin } : u))
        );
        setActionMessage(
          `Successfully ${makeAdmin ? "promoted" : "revoked"} admin for ${targetUser.username}.`
        );
        setTimeout(() => setActionMessage(null), 4000);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to update" }));
        alert(err.detail || "Action failed.");
      }
    } catch {
      alert("Network error updating admin status.");
    }
  };

  // Non-admin / Unauthenticated View
  if (!user || !user.is_admin) {
    return (
      <div className="admin-unauthorized-container">
        <div className="admin-unauthorized-card">
          <ShieldAlert size={56} className="admin-lock-icon" />
          <h1 className="admin-unauthorized-title">Admin Access Required</h1>
          <p className="admin-unauthorized-desc">
            This dashboard contains private Chel Statz telemetry, user analytics, and system administration tools.
          </p>
          {!user ? (
            <button className="auth-submit-btn" onClick={() => openAuthModal("login")}>
              Sign In as Admin
            </button>
          ) : (
            <div className="admin-logged-in-notice">
              <span>Logged in as <strong>{user.username}</strong> (Not an Admin).</span>
              <p className="text-secondary text-sm mt-2">
                To promote this account, run <code>python make_admin.py {user.username}</code> in the terminal.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-page">
      {/* Header */}
      <div className="admin-header-row">
        <div className="admin-header-left">
          <div className="admin-badge-tag">
            <ShieldCheck size={14} /> Administrator
          </div>
          <h1 className="page-title">Admin & Analytics Control Center</h1>
          <p className="text-secondary text-sm">
            Monitor real-time beta telemetry, user engagement, feedback reports, and accounts.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            className="admin-refresh-btn"
            onClick={() => {
              if (activeTab === "overview") fetchSummary();
              if (activeTab === "feedback") fetchFeedback();
              if (activeTab === "users") fetchUsers();
            }}
            title="Refresh Data"
            type="button"
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="admin-alert-banner">
          <CheckCircle size={16} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="admin-nav-tabs">
        <button
          className={`admin-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <TrendingUp size={16} />
          <span>Analytics Overview</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "feedback" ? "active" : ""}`}
          onClick={() => setActiveTab("feedback")}
        >
          <MessageSquare size={16} />
          <span>User Feedback</span>
          {summary?.feedback?.new ? (
            <span className="admin-tab-badge">{summary.feedback.new}</span>
          ) : null}
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={16} />
          <span>User Management</span>
          {summary?.users?.total ? (
            <span className="admin-tab-badge secondary">{summary.users.total}</span>
          ) : null}
        </button>
      </div>

      {/* ========================================================
          TAB 1: OVERVIEW & ANALYTICS
          ======================================================== */}
      {activeTab === "overview" && (
        <div className="admin-tab-content">
          {isLoadingSummary && !summary ? (
            <div className="admin-loading-state">
              <RefreshCw size={24} className="spinning" />
              <span>Loading telemetry...</span>
            </div>
          ) : (
            <>
              {/* KPI Cards Grid */}
              <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                  <div className="admin-kpi-header">
                    <span className="admin-kpi-title">Total Users</span>
                    <div className="admin-kpi-icon-wrap blue">
                      <Users size={18} />
                    </div>
                  </div>
                  <div className="admin-kpi-value">{summary?.users.total ?? 0}</div>
                  <div className="admin-kpi-subtext">
                    <span className="text-success">+{summary?.users.new_today ?? 0} today</span> · {summary?.users.new_7d ?? 0} this week
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="admin-kpi-header">
                    <span className="admin-kpi-title">Active Visitors</span>
                    <div className="admin-kpi-icon-wrap emerald">
                      <TrendingUp size={18} />
                    </div>
                  </div>
                  <div className="admin-kpi-value">{summary?.users.active_today ?? 0}</div>
                  <div className="admin-kpi-subtext">
                    {summary?.users.active_7d ?? 0} unique active (7 days)
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="admin-kpi-header">
                    <span className="admin-kpi-title">Page Views</span>
                    <div className="admin-kpi-icon-wrap purple">
                      <Eye size={18} />
                    </div>
                  </div>
                  <div className="admin-kpi-value">{summary?.pageviews.total ?? 0}</div>
                  <div className="admin-kpi-subtext">
                    {summary?.pageviews.today ?? 0} today · {summary?.pageviews.last_7d ?? 0} this week
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="admin-kpi-header">
                    <span className="admin-kpi-title">Feedback Received</span>
                    <div className="admin-kpi-icon-wrap amber">
                      <MessageSquare size={18} />
                    </div>
                  </div>
                  <div className="admin-kpi-value">{summary?.feedback.total ?? 0}</div>
                  <div className="admin-kpi-subtext">
                    <span className="text-warning">{summary?.feedback.new ?? 0} new</span> · {summary?.feedback.resolved ?? 0} resolved
                  </div>
                </div>
              </div>

              {/* Two-Column Analytics Layout */}
              <div className="admin-charts-grid">
                {/* Top Visited Pages */}
                <div className="admin-panel-card">
                  <div className="admin-panel-header">
                    <h3>Top Visited Pages</h3>
                    <span className="text-secondary text-xs">All-time traffic</span>
                  </div>
                  <div className="admin-pageviews-list">
                    {summary?.pageviews.top_pages && summary.pageviews.top_pages.length > 0 ? (
                      summary.pageviews.top_pages.map((p, idx) => {
                        const total = summary.pageviews.total || 1;
                        const pct = Math.round((p.count / total) * 100);
                        return (
                          <div key={idx} className="admin-pageview-row">
                            <div className="admin-pageview-info">
                              <span className="admin-pageview-path">{p.path}</span>
                              <span className="admin-pageview-count">{p.count} views ({pct}%)</span>
                            </div>
                            <div className="admin-progress-track">
                              <div
                                className="admin-progress-fill"
                                style={{ width: `${Math.max(pct, 4)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty-text">No pageview data recorded yet.</div>
                    )}
                  </div>
                </div>

                {/* Most Favorited Teams & Device Breakdown */}
                <div className="admin-panel-card">
                  <div className="admin-panel-header">
                    <h3>Top Followed NHL Teams</h3>
                    <span className="text-secondary text-xs">Fanbase breakdown</span>
                  </div>
                  <div className="admin-teams-ranking">
                    {summary?.top_teams && summary.top_teams.length > 0 ? (
                      summary.top_teams.map((t, idx) => (
                        <div key={t.team_abbrev} className="admin-team-rank-item">
                          <span className="admin-team-rank-num">#{idx + 1}</span>
                          <span className="admin-team-abbrev-tag">{t.team_abbrev}</span>
                          <div className="admin-team-bar-wrap">
                            <div
                              className="admin-team-bar-fill"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(10, (t.count / (summary.top_teams[0]?.count || 1)) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="admin-team-followers">{t.count} fans</span>
                        </div>
                      ))
                    ) : (
                      <div className="admin-empty-text">No user favorite teams recorded yet.</div>
                    )}
                  </div>

                  <div className="admin-device-split-box">
                    <div className="admin-device-split-title">Device Breakdown</div>
                    <div className="admin-device-split-row">
                      <div className="admin-device-stat">
                        <Monitor size={16} />
                        <span>Desktop: <strong>{summary?.pageviews.device_breakdown.desktop ?? 0}</strong></span>
                      </div>
                      <div className="admin-device-stat">
                        <Smartphone size={16} />
                        <span>Mobile: <strong>{summary?.pageviews.device_breakdown.mobile ?? 0}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 2: USER FEEDBACK INBOX
          ======================================================== */}
      {activeTab === "feedback" && (
        <div className="admin-tab-content">
          <div className="admin-filter-bar">
            <div className="admin-filter-group">
              <label>Status:</label>
              <select
                className="admin-filter-select"
                value={feedbackFilter}
                onChange={(e) => setFeedbackFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="new">New (Needs Review)</option>
                <option value="in_review">In Review</option>
                <option value="resolved">Resolved</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="admin-filter-group">
              <label>Category:</label>
              <select
                className="admin-filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                <option value="feature">Feature Ideas</option>
                <option value="bug">Bug Reports</option>
                <option value="general">General Feedback</option>
                <option value="data">Data / Stats</option>
              </select>
            </div>
          </div>

          {isLoadingFeedback ? (
            <div className="admin-loading-state">
              <RefreshCw size={24} className="spinning" />
              <span>Loading feedback...</span>
            </div>
          ) : feedbackList.length === 0 ? (
            <div className="admin-empty-card">
              <MessageSquare size={36} className="text-secondary" />
              <h3>No feedback found</h3>
              <p className="text-secondary text-sm">
                Feedback submitted through the Beta banner will appear here.
              </p>
            </div>
          ) : (
            <div className="admin-feedback-list">
              {feedbackList.map((item) => (
                <div key={item.id} className={`admin-feedback-card status-${item.status}`}>
                  <div className="admin-feedback-top">
                    <div className="admin-feedback-meta">
                      <span className={`admin-badge-category ${item.category}`}>
                        {item.category.toUpperCase()}
                      </span>
                      <span className={`admin-badge-status status-${item.status}`}>
                        {item.status.replace("_", " ")}
                      </span>
                      {item.rating && (
                        <span className="admin-feedback-rating">
                          <Star size={13} className="fill-amber text-amber" />
                          {item.rating}/5
                        </span>
                      )}
                    </div>
                    <span className="admin-feedback-time">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                    </span>
                  </div>

                  <div className="admin-feedback-body">
                    <p className="admin-feedback-message">{item.message}</p>
                  </div>

                  <div className="admin-feedback-footer">
                    <div className="admin-feedback-author">
                      <span>Submitted by: <strong>{item.username || "Guest"}</strong></span>
                      {item.email && <span className="text-secondary">({item.email})</span>}
                    </div>

                    <div className="admin-feedback-actions">
                      {item.status !== "in_review" && (
                        <button
                          className="admin-action-btn neutral"
                          onClick={() => handleUpdateFeedbackStatus(item.id, "in_review")}
                        >
                          <Clock size={13} /> In Review
                        </button>
                      )}
                      {item.status !== "resolved" && (
                        <button
                          className="admin-action-btn success"
                          onClick={() => handleUpdateFeedbackStatus(item.id, "resolved")}
                        >
                          <CheckCircle size={13} /> Mark Resolved
                        </button>
                      )}
                      {item.status !== "archived" && (
                        <button
                          className="admin-action-btn secondary"
                          onClick={() => handleUpdateFeedbackStatus(item.id, "archived")}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 3: USER MANAGEMENT
          ======================================================== */}
      {activeTab === "users" && (
        <div className="admin-tab-content">
          <div className="admin-users-search-row">
            <div className="admin-search-input-wrap">
              <Search size={16} className="admin-search-icon" />
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search users by username or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoadingUsers ? (
            <div className="admin-loading-state">
              <RefreshCw size={24} className="spinning" />
              <span>Loading user directory...</span>
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>Followed Teams</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userList.map((u) => (
                    <tr key={u.id}>
                      <td>#{u.id}</td>
                      <td>
                        <div className="admin-table-user-cell">
                          <div className="user-avatar-circle small">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <strong>{u.username}</strong>
                        </div>
                      </td>
                      <td className="text-secondary">{u.email}</td>
                      <td className="text-secondary text-sm">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td>
                        {u.favorites && u.favorites.length > 0 ? (
                          <div className="admin-user-favs-pills">
                            {u.favorites.map((fav) => (
                              <span key={fav} className="admin-fav-pill">
                                {fav}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-secondary text-xs">None</span>
                        )}
                      </td>
                      <td>
                        {u.is_admin ? (
                          <span className="admin-role-badge admin">
                            <ShieldCheck size={12} /> Admin
                          </span>
                        ) : (
                          <span className="admin-role-badge member">Member</span>
                        )}
                      </td>
                      <td>
                        {u.id === user.id ? (
                          <span className="text-secondary text-xs italic">Current Account</span>
                        ) : (
                          <button
                            className={`admin-role-toggle-btn ${u.is_admin ? "revoke" : "grant"}`}
                            onClick={() => handleToggleAdmin(u)}
                          >
                            {u.is_admin ? "Revoke Admin" : "Make Admin"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
