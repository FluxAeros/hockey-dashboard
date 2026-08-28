import { useState } from "react";
import { X, MessageSquare, Bug, Lightbulb, Sparkles, CheckCircle2, Star } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../utils/api";

const CATEGORIES = [
  { id: "feature", label: "Feature Idea", icon: Lightbulb },
  { id: "bug", label: "Bug Report", icon: Bug },
  { id: "general", label: "General Feedback", icon: MessageSquare },
  { id: "data", label: "Stats / Data Issue", icon: Sparkles },
];

export function FeedbackModal() {
  const { isFeedbackModalOpen, closeFeedbackModal, user, token } = useAuth();
  const [category, setCategory] = useState<string>("feature");
  const [message, setMessage] = useState<string>("");
  const [rating, setRating] = useState<number | null>(null);
  const [email, setEmail] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isFeedbackModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please enter a short message or description.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          category,
          message: message.trim(),
          rating,
          email: user?.email || (email.trim() ? email.trim() : null),
          username: user?.username || null,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit feedback.");
      }

      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setMessage("");
        setRating(null);
        setEmail("");
        closeFeedbackModal();
      }, 2000);
    } catch {
      setError("Failed to send feedback. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setIsSubmitted(false);
    closeFeedbackModal();
  };

  return (
    <div className="auth-modal-overlay" onClick={handleClose}>
      <div className="auth-modal feedback-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="auth-modal-close"
          onClick={handleClose}
          aria-label="Close modal"
          type="button"
        >
          <X size={18} />
        </button>

        {isSubmitted ? (
          <div className="feedback-success-state">
            <CheckCircle2 size={48} className="feedback-success-icon" />
            <h3 className="feedback-success-title">Thank you for your feedback!</h3>
            <p className="feedback-success-desc">
              Your input directly shapes what we build next for Chel Statz.
            </p>
          </div>
        ) : (
          <>
            <div className="auth-modal-header">
              <div className="feedback-badge-pill">Chel Statz Beta</div>
              <h2 className="auth-modal-title">Share Your Feedback</h2>
              <p className="auth-modal-subtitle">
                Found a glitch, or have an idea for a killer feature? Let us know!
              </p>
            </div>

            {error && <div className="auth-modal-error">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form feedback-form">
              <div className="feedback-category-grid">
                {CATEGORIES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`feedback-category-chip ${category === id ? "active" : ""}`}
                    onClick={() => setCategory(id)}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="feedback-message">
                  What's on your mind? <span className="text-accent">*</span>
                </label>
                <textarea
                  id="feedback-message"
                  className="feedback-textarea"
                  rows={4}
                  placeholder="Describe the bug, idea, or overall experience..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">How would you rate the app so far? (optional)</label>
                <div className="rating-stars-row">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star-btn ${(rating ?? 0) >= star ? "filled" : ""}`}
                      onClick={() => setRating(rating === star ? null : star)}
                    >
                      <Star size={20} />
                    </button>
                  ))}
                </div>
              </div>

              {!user && (
                <div className="form-group">
                  <label className="form-label" htmlFor="feedback-email">
                    Your Email (optional - if you'd like a response)
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={isSubmitting || !message.trim()}
              >
                {isSubmitting ? "Sending..." : "Submit Feedback"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
