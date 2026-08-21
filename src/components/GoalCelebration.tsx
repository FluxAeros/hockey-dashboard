import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NHL_TEAMS } from "../utils/teamsData";

interface GoalCelebrationProps {
  visible: boolean;
  teamAbbr: string;
  teamColor: string;
  teamName: string;
  onDone: () => void;
}

function getTeamLogo(abbr: string): string {
  const team = NHL_TEAMS.find((t) => t.teamAbbrev === abbr);
  return team?.teamLogo || `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;
}

/** Generate random confetti particles */
function generateParticles(color: string, count = 20) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360;
    const dist = 110 + Math.random() * 150;
    const rad = (angle * Math.PI) / 180;
    return {
      id: i,
      x: Math.cos(rad) * dist,
      y: Math.sin(rad) * dist,
      rotate: Math.random() * 720 - 360,
      size: 6 + Math.random() * 6,
      opacity: 0.7 + Math.random() * 0.3,
      color: i % 3 === 0 ? color : i % 3 === 1 ? "#ffffff" : color + "aa",
    };
  });
}

export function GoalCelebration({ visible, teamAbbr, teamColor, teamName, onDone }: GoalCelebrationProps) {
  const logo = getTeamLogo(teamAbbr);
  const particles = useRef(generateParticles(teamColor));

  // Auto-dismiss after 3.5s
  useEffect(() => {
    if (!visible) return;
    // Regenerate particles each time so they're fresh
    particles.current = generateParticles(teamColor);
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [visible, teamColor, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Viewport edge glow ring - Hardware-accelerated radial vignette */}
          <motion.div
            key="glow-ring"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              pointerEvents: "none",
              background: `radial-gradient(circle at center, transparent 55%, ${teamColor}55 100%)`,
              willChange: "opacity",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6, 1, 0.4, 0] }}
            transition={{ duration: 3, times: [0, 0.1, 0.3, 0.5, 0.75, 1], ease: "easeOut" }}
          />

          {/* Dark backdrop - fast GPU composite without backdropFilter blur */}
          <motion.div
            key="backdrop"
            onClick={onDone}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(0, 0, 0, 0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              willChange: "opacity",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Centered celebration content */}
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>

              {/* Confetti particles burst */}
              {particles.current.map((p) => (
                <motion.div
                  key={p.id}
                  style={{
                    position: "absolute",
                    width: p.size,
                    height: p.size,
                    borderRadius: 2,
                    backgroundColor: p.color,
                    top: "50%",
                    left: "50%",
                    transformOrigin: "center",
                    willChange: "transform, opacity",
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    opacity: [1, 1, 0],
                    scale: [0, 1.4, 0.8],
                    rotate: p.rotate,
                  }}
                  transition={{ duration: 1.1, ease: "easeOut", delay: 0.05 }}
                />
              ))}

              {/* Team logo with hardware-friendly glow container */}
              <div style={{ position: "relative", width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div
                  style={{
                    position: "absolute",
                    width: 140,
                    height: 140,
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${teamColor}99 0%, transparent 70%)`,
                    pointerEvents: "none",
                  }}
                />
                <motion.img
                  src={logo}
                  alt={teamAbbr}
                  decoding="async"
                  style={{
                    width: 120,
                    height: 120,
                    objectFit: "contain",
                    position: "relative",
                    zIndex: 1,
                    willChange: "transform, opacity",
                  }}
                  initial={{ scale: 0, opacity: 0, rotate: -15 }}
                  animate={{ scale: [0, 1.3, 1], opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22, delay: 0.05 }}
                />
              </div>

              {/* GOAL! text */}
              <motion.div
                style={{
                  fontSize: "clamp(4rem, 12vw, 8rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  color: "#ffffff",
                  textShadow: `0 0 24px ${teamColor}, 0 4px 12px rgba(0,0,0,0.85)`,
                  lineHeight: 1,
                  userSelect: "none",
                  fontFamily: "inherit",
                  willChange: "transform, opacity",
                }}
                initial={{ scale: 0.2, opacity: 0, y: 30 }}
                animate={{ scale: [0.2, 1.15, 1], opacity: 1, y: 0 }}
                exit={{ scale: 1.5, opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 350, damping: 18, delay: 0.12 }}
              >
                GOAL!
              </motion.div>

              {/* Team name subtitle */}
              <motion.div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "clamp(1rem, 3vw, 1.5rem)",
                  fontWeight: 700,
                  color: teamColor,
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  userSelect: "none",
                  willChange: "transform, opacity",
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
              >
                {teamName}
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
