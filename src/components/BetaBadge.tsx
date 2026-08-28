import { Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function BetaBadge() {
  const { openFeedbackModal } = useAuth();

  return (
    <button
      className="beta-badge-btn"
      onClick={openFeedbackModal}
      title="Chel Statz is currently in Beta. Click to share feedback!"
      type="button"
    >
      <Sparkles size={12} className="beta-badge-icon" />
      <span>v0.9.0-beta</span>
    </button>
  );
}
