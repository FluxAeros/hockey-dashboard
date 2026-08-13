import { useState, useRef } from "react";
import { RosterCard, type RosterPlayer } from "../components/RosterCard";
import { TEAM_COLORS } from "../utils/helpers";
import { NHL_TEAMS, TEAM_CONFERENCE } from "../utils/teamsData";
import { ArrowLeft, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const gridContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const teamCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.94 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.8 },
  },
};

export default function Teams() {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [raisingTeam, setRaisingTeam] = useState<string | null>(null);
  const [conferenceFilter, setConferenceFilter] = useState<"All" | "Eastern" | "Western">("All");
  const [rosterTab, setRosterTab] = useState<"forwards" | "defensemen" | "goalies">("forwards");
  const hasAnimatedGrid = useRef(false);
  
  const [roster, setRoster] = useState<{
    forwards: RosterPlayer[];
    defensemen: RosterPlayer[];
    goalies: RosterPlayer[];
  } | null>(null);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlayer, setSelectedPlayer] = useState<RosterPlayer | null>(null);
  const [playerDetails, setPlayerDetails] = useState<any>(null);
  const [playerLoading, setPlayerLoading] = useState<boolean>(false);

  const handleSelectTeam = async (abbr: string) => {
    setSelectedTeam(abbr);
    setLoading(true);
    setError(null);
    setRoster(null);
    setRosterTab("forwards");
    try {
      const res = await fetch(`http://127.0.0.1:8000/roster/${abbr}`);
      if (res.status === 429) throw new Error("Too many requests to NHL API. Please wait a moment.");
      if (!res.ok) throw new Error("Failed to load roster");
      const data = await res.json();
      setRoster({
        forwards: data.forwards || [],
        defensemen: data.defensemen || [],
        goalies: data.goalies || []
      });
    } catch (err: any) {
      setError(err.message || "Could not load roster for " + abbr);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlayer = async (player: RosterPlayer) => {
    setSelectedPlayer(player);
    setPlayerDetails(null);
    setPlayerLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/player/${player.id}`);
      if (res.ok) {
        const data = await res.json();
        setPlayerDetails(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPlayerLoading(false);
    }
  };

  const handleBack = () => {
    setRaisingTeam(selectedTeam);
    setSelectedTeam(null);
    setRoster(null);
    setError(null);
    setTimeout(() => setRaisingTeam(null), 600);
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
  };

  const activeTeamInfo = selectedTeam ? NHL_TEAMS.find(t => t.teamAbbrev === selectedTeam) : null;
  const activeColor = selectedTeam ? (TEAM_COLORS[selectedTeam] || 'var(--bg-secondary)') : 'transparent';

  const filteredTeams = conferenceFilter === "All"
    ? NHL_TEAMS
    : NHL_TEAMS.filter(t => TEAM_CONFERENCE[t.teamAbbrev] === conferenceFilter);

  const CONF_FILTERS: Array<"All" | "Eastern" | "Western"> = ["All", "Eastern", "Western"];

  return (
    <div className="teams-page">
      {/* Grid view — fades out underneath the expanding card */}
      <AnimatePresence>
        {!selectedTeam && (
          <motion.div 
            key="grid-view"
            initial={hasAnimatedGrid.current ? { opacity: 0 } : "hidden"}
            animate={hasAnimatedGrid.current ? { opacity: 1 } : "visible"}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            variants={gridContainerVariants}
            onAnimationStart={() => { hasAnimatedGrid.current = true; }}
          >
            <div className="teams-page-header">
              <h1 className="page-title">Teams &amp; Rosters</h1>
              <div className="conference-filter">
                {CONF_FILTERS.map(f => (
                  <button
                    key={f}
                    className={`conf-filter-btn${conferenceFilter === f ? " active" : ""}`}
                    onClick={() => {
                      setConferenceFilter(f);
                      hasAnimatedGrid.current = false;
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="team-selector-grid">
              {filteredTeams.map(team => {
                const color = TEAM_COLORS[team.teamAbbrev] || 'var(--border-primary)';
                return (
                  <motion.button 
                    layoutId={`team-card-${team.teamAbbrev}`}
                    key={team.teamAbbrev}
                    variants={teamCardVariants}
                    className="team-card-btn"
                    onClick={() => handleSelectTeam(team.teamAbbrev)}
                    whileHover={{ scale: 1.03, y: -4, transition: { type: "spring", stiffness: 380, damping: 22 } }}
                    whileTap={{ scale: 0.97, transition: { type: "spring", stiffness: 500, damping: 28 } }}
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: 'var(--border-primary)',
                      position: 'relative',
                      zIndex: raisingTeam === team.teamAbbrev ? 10 : 1,
                    }}
                  >
                    <motion.div layoutId={`team-content-${team.teamAbbrev}`} className="team-card-content">
                      <motion.img layoutId={`team-logo-${team.teamAbbrev}`} src={team.teamLogo} alt={team.teamName} className="team-logo-img" />
                      <motion.div layoutId={`team-text-${team.teamAbbrev}`} className="team-card-text">
                        <span className="team-card-city">{team.teamName.split(' ').slice(0, -1).join(' ')}</span>
                        <span className="team-card-mascot" style={{ color: color !== 'var(--border-primary)' ? color : 'var(--text-primary)' }}>
                          {team.teamName.split(' ').slice(-1).join(' ')}
                        </span>
                      </motion.div>
                    </motion.div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero view — card expands via layoutId from the grid card's position */}
      <AnimatePresence>
        {selectedTeam && (
          <motion.div 
            key="hero-view"
            className="team-hero-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.button 
              className="back-btn" 
              onClick={handleBack}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.15 }}
            >
              <ArrowLeft size={20} />
              <span>Back to Teams</span>
            </motion.button>
            
            <motion.div 
              layoutId={`team-card-${selectedTeam}`}
              className="team-hero-card"
              transition={{ type: "spring", stiffness: 200, damping: 28 }}
              style={{ 
                background: `linear-gradient(135deg, ${activeColor}20 0%, var(--bg-secondary) 100%)`,
                borderColor: activeColor 
              }}
            >
              <motion.div layoutId={`team-content-${selectedTeam}`} className="team-hero-header">
                <motion.img layoutId={`team-logo-${selectedTeam}`} src={activeTeamInfo?.teamLogo} alt={activeTeamInfo?.teamName} className="team-hero-logo" />
                <motion.div layoutId={`team-text-${selectedTeam}`} className="team-hero-title">
                  <h1 className="team-hero-city">{activeTeamInfo?.teamName.split(' ').slice(0, -1).join(' ')}</h1>
                  <h1 className="team-hero-mascot" style={{ color: activeColor }}>
                    {activeTeamInfo?.teamName.split(' ').slice(-1).join(' ')}
                  </h1>
                </motion.div>
              </motion.div>
              
              <motion.div 
                className="team-hero-content"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.22 }}
              >
                {loading && <div className="mt-8 text-secondary">Loading roster...</div>}
                {error && <div className="alert-error mt-8">{error}</div>}

                {roster && !loading && (
                  <div className="roster-container mt-8">
                    <div className="roster-tabs">
                      <button
                        className={`roster-tab-btn${rosterTab === 'forwards' ? ' active' : ''}`}
                        onClick={() => setRosterTab('forwards')}
                      >
                        Forwards <span className="roster-tab-count">{roster.forwards.length}</span>
                      </button>
                      <button
                        className={`roster-tab-btn${rosterTab === 'defensemen' ? ' active' : ''}`}
                        onClick={() => setRosterTab('defensemen')}
                      >
                        Defense <span className="roster-tab-count">{roster.defensemen.length}</span>
                      </button>
                      <button
                        className={`roster-tab-btn${rosterTab === 'goalies' ? ' active' : ''}`}
                        onClick={() => setRosterTab('goalies')}
                      >
                        Goalies <span className="roster-tab-count">{roster.goalies.length}</span>
                      </button>
                    </div>
                    <div className="roster-grid">
                      {(rosterTab === 'forwards' ? roster.forwards :
                        rosterTab === 'defensemen' ? roster.defensemen :
                        roster.goalies
                      ).map((p, i) => (
                        <RosterCard key={p.id} player={p} onClick={handleSelectPlayer} index={i} />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlayer && (
          <motion.div
            className="player-modal-backdrop"
            onClick={closePlayerModal}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div 
              layoutId={`player-card-${selectedPlayer.id}`}
              className="player-modal"
              onClick={e => e.stopPropagation()}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            >
              <button className="modal-close" onClick={closePlayerModal}><X size={24} /></button>
              
              <div className="player-modal-header">
                <img 
                  src={selectedPlayer.headshot} 
                  alt={`${selectedPlayer.firstName.default} ${selectedPlayer.lastName.default}`}
                  className="player-modal-avatar"
                />
                <div className="player-modal-title">
                  <h2>{selectedPlayer.firstName.default} <span>{selectedPlayer.lastName.default}</span></h2>
                  <div className="player-modal-meta">
                    <span className="player-modal-num">#{selectedPlayer.sweaterNumber}</span>
                    <span className="player-modal-pos">{selectedPlayer.positionCode}</span>
                  </div>
                </div>
              </div>

              <motion.div 
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.1 }}
                className="player-modal-body"
              >
                {playerLoading ? (
                  <div className="text-secondary p-4">Loading player details...</div>
                ) : playerDetails ? (
                  <div className="player-stats-grid">
                    <div className="stat-box">
                      <label>Height</label>
                      <div className="val">{playerDetails.heightInInches ? `${Math.floor(playerDetails.heightInInches / 12)}'${playerDetails.heightInInches % 12}"` : '--'}</div>
                    </div>
                    <div className="stat-box">
                      <label>Weight</label>
                      <div className="val">{playerDetails.weightInPounds ? `${playerDetails.weightInPounds} lbs` : '--'}</div>
                    </div>
                    <div className="stat-box">
                      <label>Birthplace</label>
                      <div className="val">{playerDetails.birthCity?.default || '--'}</div>
                    </div>
                    <div className="stat-box">
                      <label>Shoots</label>
                      <div className="val">{playerDetails.shootsCatches || '--'}</div>
                    </div>
                    
                    {playerDetails.seasonTotals && playerDetails.seasonTotals[0] && (
                      <div className="season-stats-container">
                        <h3>Current Season</h3>
                        <div className="season-stats-row">
                          <div className="stat-item">
                            <span className="stat-lbl">GP</span>
                            <span className="stat-val">{playerDetails.seasonTotals[0].gamesPlayed}</span>
                          </div>
                          {selectedPlayer.positionCode !== 'G' ? (
                            <>
                              <div className="stat-item">
                                <span className="stat-lbl">G</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].goals || 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">A</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].assists || 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">PTS</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].points || 0}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="stat-item">
                                <span className="stat-lbl">W</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].wins || 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">SV%</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].savePctg ? (playerDetails.seasonTotals[0].savePctg).toFixed(3) : '--'}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">GAA</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].goalsAgainstAvg ? (playerDetails.seasonTotals[0].goalsAgainstAvg).toFixed(2) : '--'}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-error p-4">Could not load details.</div>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
