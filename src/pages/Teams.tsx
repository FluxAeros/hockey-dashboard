import { useState } from "react";
import { RosterCard, type RosterPlayer } from "../components/RosterCard";
import { TEAM_COLORS } from "../utils/helpers";
import { NHL_TEAMS } from "../utils/teamsData";
import { ArrowLeft, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Teams() {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  
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
    setSelectedTeam(null);
    setRoster(null);
    setError(null);
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
  };

  const renderRosterSection = (title: string, players: RosterPlayer[], startIndex: number = 0) => {
    if (!players.length) return null;
    return (
      <div className="roster-section">
        <h2 className="roster-section-title">{title}</h2>
        <div className="roster-grid">
          {players.map((p, i) => <RosterCard key={p.id} player={p} onClick={handleSelectPlayer} index={startIndex + i} />)}
        </div>
      </div>
    );
  };

  const activeTeamInfo = selectedTeam ? NHL_TEAMS.find(t => t.teamAbbrev === selectedTeam) : null;
  const activeColor = selectedTeam ? (TEAM_COLORS[selectedTeam] || 'var(--bg-secondary)') : 'transparent';

  return (
    <div className="teams-page">
      <AnimatePresence>
        {!selectedTeam ? (
          <motion.div 
            key="grid-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="page-title mb-8">Teams & Rosters</h1>
            <div className="team-selector-grid">
              {NHL_TEAMS.map(team => {
                const color = TEAM_COLORS[team.teamAbbrev] || 'var(--border-primary)';
                return (
                  <motion.button 
                    layoutId={`team-card-${team.teamAbbrev}`}
                    key={team.teamAbbrev} 
                    className="team-card-btn"
                    onClick={() => handleSelectTeam(team.teamAbbrev)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
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
        ) : (
          <motion.div 
            key="hero-view"
            className="team-hero-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.button 
              className="back-btn" 
              onClick={handleBack}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <ArrowLeft size={20} />
              <span>Back to Teams</span>
            </motion.button>
            
            <motion.div 
              layoutId={`team-card-${selectedTeam}`}
              className="team-hero-card"
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                {loading && <div className="mt-8 text-secondary">Loading roster...</div>}
                {error && <div className="alert-error mt-8">{error}</div>}

                {roster && !loading && (
                  <div className="roster-container mt-8">
                    {renderRosterSection("Forwards", roster.forwards, 0)}
                    {renderRosterSection("Defense", roster.defensemen, roster.forwards.length)}
                    {renderRosterSection("Goalies", roster.goalies, roster.forwards.length + roster.defensemen.length)}
                  </div>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlayer && (
          <div className="player-modal-backdrop" onClick={closePlayerModal}>
            <motion.div 
              layoutId={`player-card-${selectedPlayer.id}`}
              className="player-modal"
              onClick={e => e.stopPropagation()}
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
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
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
