export interface RosterPlayer {
  id: number;
  firstName: { default: string };
  lastName: { default: string };
  sweaterNumber: number;
  positionCode: string;
  headshot: string;
}

import { motion } from "framer-motion";

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.92 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: Math.min(i * 0.04, 0.5),
      type: "spring" as const,
      stiffness: 260,
      damping: 22,
      mass: 0.8,
    },
  }),
};

export function RosterCard({ player, onClick, index = 0 }: { player: RosterPlayer, onClick: (player: RosterPlayer) => void, index?: number }) {
  return (
    <motion.button 
      layoutId={`player-card-${player.id}`}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      onClick={() => onClick(player)}
      className="roster-card"
      whileHover={{ 
        y: -8,
        scale: 1.02,
        boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
        transition: { type: "spring", stiffness: 400, damping: 20 }
      }}
      whileTap={{ scale: 0.96, transition: { type: "spring", stiffness: 500, damping: 25 } }}
    >
      <div className="roster-card-img-container">
        <img 
          src={player.headshot} 
          alt={`${player.firstName.default} ${player.lastName.default}`}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className="roster-avatar"
        />
        <div className="roster-number">{player.sweaterNumber || '--'}</div>
      </div>
      <div className="roster-card-info">
        <div className="roster-name">
          <span className="first-name">{player.firstName.default}</span>
          <span className="last-name">{player.lastName.default}</span>
        </div>
        <div className="roster-pos">{player.positionCode}</div>
      </div>
    </motion.button>
  );
}
