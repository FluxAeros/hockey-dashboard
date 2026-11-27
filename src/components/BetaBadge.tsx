import { Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { APP_VERSION } from "../utils/version";

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
      <span>v{APP_VERSION}-beta</span>
    </button>
  );
}
