import { useState, useEffect } from "react";
import { Sparkles, MessageSquarePlus, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const BANNER_DISMISSED_KEY = "chelstatz_beta_banner_dismissed_v0.9.0";

export function BetaBanner() {
  const [isDismissed, setIsDismissed] = useState<boolean>(true);
  const { openFeedbackModal } = useAuth();

  useEffect(() => {
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (!dismissed) {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
  };

  if (isDismissed) {
    return null;
  }

  return (
    <div className="beta-announcement-banner">
      <div className="beta-banner-content">
        <div className="beta-banner-left">
          <span className="beta-banner-tag">
            <Sparkles size={12} /> BETA
          </span>
          <span className="beta-banner-text">
            Welcome to Chel Statz Beta! We're testing live expected goals, win probability & matchup boards.
          </span>
        </div>
        <div className="beta-banner-actions">
          <button
            className="beta-banner-feedback-btn"
            onClick={openFeedbackModal}
            type="button"
          >
            <MessageSquarePlus size={14} />
            <span>Give Feedback</span>
          </button>
          <button
            className="beta-banner-close-btn"
            onClick={handleDismiss}
            title="Dismiss banner"
            aria-label="Dismiss banner"
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
