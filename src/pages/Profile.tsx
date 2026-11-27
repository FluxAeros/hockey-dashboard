import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ShieldCheck,
  Star,
  LogOut,
  LogIn,
  UserPlus,
  MessageSquarePlus,
  ChevronRight,
  Users,
  Bell,
  BellOff,
  Send,
} from "lucide-react";
import { NHL_TEAMS_METADATA } from "../utils/nhlDivisions";
import { APP_VERSION } from "../utils/version";
import {
  getPushStatus,
  subscribeToGoalAlerts,
  unsubscribeFromGoalAlerts,
  sendTestGoalNotification,
  type PushStatus,
} from "../utils/pushNotifications";

export default function Profile() {
  const { user, favorites, openAuthModal, openFeedbackModal, logout } = useAuth();
  const navigate = useNavigate();

  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  const handleToggleGoalAlerts = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (pushStatus?.subscribed) {
        await unsubscribeFromGoalAlerts();
        setPushMessage("Goal alerts paused.");
      } else {
        const res = await subscribeToGoalAlerts(favorites);
        setPushMessage(res.message);
      }
      setPushStatus(await getPushStatus());
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestNotification = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      const res = await sendTestGoalNotification();
      setPushMessage(res.message);
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1 className="page-title">Profile</h1>
      </div>

      {/* Account Card */}
      <section className="profile-card">
        {user ? (
          <div className="profile-account-row">
            <div className="profile-avatar-lg">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="profile-account-info">
              <div className="profile-username-row">
                <h2 className="profile-username">{user.username}</h2>
                {user.is_admin && <span className="user-admin-indicator">ADMIN</span>}
              </div>
              <p className="profile-subtext">
                {favorites.length} followed {favorites.length === 1 ? "team" : "teams"} synced to your account
              </p>
            </div>
            <button
              className="btn-secondary profile-logout-btn"
              onClick={logout}
              type="button"
            >
              <LogOut size={15} />
              <span>Log Out</span>
            </button>
          </div>
        ) : (
          <div className="profile-guest-box">
            <h2 className="profile-section-heading">Sign in to Chel Statz</h2>
            <p className="profile-subtext">
              Sync your followed NHL teams across devices and unlock personalized live trackers.
            </p>
            <div className="profile-auth-actions">
              <button
                className="btn-primary profile-action-btn"
                onClick={() => openAuthModal("login")}
                type="button"
              >
                <LogIn size={16} />
                <span>Sign In</span>
              </button>
              <button
                className="btn-secondary profile-action-btn"
                onClick={() => openAuthModal("register")}
                type="button"
              >
                <UserPlus size={16} />
                <span>Create Account</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Admin Access Card (Admins Only) */}
      {user?.is_admin && (
        <section className="profile-card profile-admin-card">
          <button
            className="profile-menu-row"
            onClick={() => navigate("/admin")}
            type="button"
          >
            <div className="profile-menu-left">
              <div className="profile-menu-icon admin">
                <ShieldCheck size={20} />
              </div>
              <div className="profile-menu-text">
                <span className="profile-menu-title">Admin Dashboard</span>
                <span className="profile-menu-desc">Telemetry, user analytics, and feedback moderation</span>
              </div>
            </div>
            <ChevronRight size={18} className="profile-menu-chevron" />
          </button>
        </section>
      )}

      {/* Goal Alerts / iOS PWA Push Notifications */}
      <section className="profile-card">
        <div className="profile-card-top">
          <div className="profile-card-title-row">
            {pushStatus?.subscribed ? (
              <Bell size={17} style={{ color: "var(--accent-primary)" }} />
            ) : (
              <BellOff size={17} style={{ color: "var(--text-tertiary)" }} />
            )}
            <h2 className="profile-section-heading">Goal Alerts</h2>
          </div>

          {!pushStatus?.needsIosInstall && pushStatus?.supported && (
            <button
              className={pushStatus.subscribed ? "btn-secondary profile-manage-btn" : "btn-primary profile-manage-btn"}
              onClick={handleToggleGoalAlerts}
              disabled={pushBusy}
              type="button"
            >
              {pushBusy ? "Updating…" : pushStatus.subscribed ? "Disable" : "Enable"}
            </button>
          )}
        </div>

        {pushStatus?.needsIosInstall ? (
          <p className="profile-subtext">
            To receive goal notifications on iOS, tap <strong>Share → Add to Home Screen</strong> and open Chel Statz from your Home Screen.
          </p>
        ) : !pushStatus?.supported ? (
          <p className="profile-subtext">
            Push notifications are not supported in this browser environment.
          </p>
        ) : (
          <>
            <p className="profile-subtext">
              {pushStatus.subscribed
                ? favorites.length > 0
                  ? `Live goal alerts are active for your ${favorites.length} followed ${favorites.length === 1 ? "team" : "teams"}.`
                  : "Live goal alerts are active. Follow teams to filter notifications to your favorites."
                : "Get notified the moment a goal is scored in your followed teams' games."}
            </p>
            {pushStatus.subscribed && (
              <div className="profile-push-actions">
                <button
                  className="btn-secondary profile-manage-btn"
                  onClick={handleTestNotification}
                  disabled={pushBusy}
                  type="button"
                >
                  <Send size={14} />
                  <span>Send Test Goal Alert</span>
                </button>
              </div>
            )}
          </>
        )}

        {pushMessage && <p className="profile-push-feedback">{pushMessage}</p>}
      </section>

      {/* Followed Teams Section */}
      <section className="profile-card">
        <div className="profile-card-top">
          <div className="profile-card-title-row">
            <Star size={17} className="text-amber fill-amber" />
            <h2 className="profile-section-heading">Followed Teams</h2>
            <span className="badge-count">{favorites.length}</span>
          </div>
          <button
            className="btn-secondary profile-manage-btn"
            onClick={() => navigate("/teams", { state: { fromAddFollowed: true } })}
            type="button"
          >
            <Users size={14} />
            <span>Manage</span>
          </button>
        </div>

        {favorites.length === 0 ? (
          <p className="profile-subtext">
            You haven&apos;t followed any teams yet. Pick your favorites to customize your Live Tracker.
          </p>
        ) : (
          <div className="profile-favorites-grid">
            {favorites.map((abbr) => {
              const meta = NHL_TEAMS_METADATA[abbr];
              return (
                <div key={abbr} className="profile-fav-pill">
                  <img
                    src={`https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`}
                    alt={abbr}
                    className="profile-fav-logo"
                  />
                  <span className="profile-fav-name">{meta?.name || abbr}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Beta Feedback */}
      <section className="profile-card">
        <button
          className="profile-menu-row"
          onClick={openFeedbackModal}
          type="button"
        >
          <div className="profile-menu-left">
            <div className="profile-menu-icon feedback">
              <MessageSquarePlus size={20} />
            </div>
            <div className="profile-menu-text">
              <span className="profile-menu-title">Send Beta Feedback</span>
              <span className="profile-menu-desc">Report a bug or suggest an improvement</span>
            </div>
          </div>
          <ChevronRight size={18} className="profile-menu-chevron" />
        </button>
      </section>

      <div className="profile-version-footer">Chel Statz v{APP_VERSION}-beta</div>
    </div>
  );
}
