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
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.045,
      duration: 0.35,
      ease: "easeOut" as const,
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
        y: -6,
        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
        transition: { duration: 0.2, ease: "easeOut" }
      }}
      whileTap={{ scale: 0.97 }}
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
