import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { X, Lock, User as UserIcon, Mail, LogIn, UserPlus } from "lucide-react";

export function AuthModal() {
  const { isAuthModalOpen, authModalTab, openAuthModal, closeAuthModal, login, register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (authModalTab === "login") {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      setUsername("");
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={closeAuthModal}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <div className="auth-modal-tabs">
            <button
              className={`auth-tab-btn ${authModalTab === "login" ? "active" : ""}`}
              onClick={() => {
                setError(null);
                openAuthModal("login");
              }}
            >
              <LogIn size={16} />
              <span>Sign In</span>
            </button>
            <button
              className={`auth-tab-btn ${authModalTab === "register" ? "active" : ""}`}
              onClick={() => {
                setError(null);
                openAuthModal("register");
              }}
            >
              <UserPlus size={16} />
              <span>Create Account</span>
            </button>
          </div>
          <button className="auth-modal-close" onClick={closeAuthModal} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <p className="auth-subtitle">
            {authModalTab === "login"
              ? "Sign in to access your personalized feed and followed teams."
              : "Create an account to follow teams, track expected goals, and customize your schedule."}
          </p>

          {error && <div className="auth-error-alert">{error}</div>}

          <div className="auth-input-group">
            <label htmlFor="auth-username">
              {authModalTab === "login" ? "Username or Email" : "Username"}
            </label>
            <div className="auth-input-wrapper">
              <UserIcon className="auth-input-icon" size={18} />
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={authModalTab === "login" ? "e.g. mcdavid97 or fan@hockey.com" : "e.g. puckfan2026"}
                required
                autoFocus
              />
            </div>
          </div>

          {authModalTab === "register" && (
            <div className="auth-input-group">
              <label htmlFor="auth-email">Email Address</label>
              <div className="auth-input-wrapper">
                <Mail className="auth-input-icon" size={18} />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>
          )}

          <div className="auth-input-group">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-input-wrapper">
              <Lock className="auth-input-icon" size={18} />
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Processing..." : authModalTab === "login" ? "Sign In" : "Create Account"}
          </button>

          <div className="auth-switch-prompt">
            {authModalTab === "login" ? (
              <span>
                Don't have an account yet?{" "}
                <button
                  type="button"
                  className="auth-inline-link"
                  onClick={() => openAuthModal("register")}
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  className="auth-inline-link"
                  onClick={() => openAuthModal("login")}
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
