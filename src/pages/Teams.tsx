import { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RosterCard, type RosterPlayer } from "../components/RosterCard";
import { TEAM_COLORS } from "../utils/helpers";
import { NHL_TEAMS, TEAM_CONFERENCE, STANLEY_CUPS } from "../utils/teamsData";
import { TEAM_DESCRIPTIONS } from "../utils/teamDescriptions";
import { ArrowLeft, X, Trophy, Star, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";

import { API_BASE } from "../utils/api";

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
  const location = useLocation();
  const navigate = useNavigate();
  const isSelectingForFollow = Boolean(location.state?.fromAddFollowed);

  const { isFavorite, toggleFavorite } = useAuth();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [raisingTeam, setRaisingTeam] = useState<string | null>(null);
  const [conferenceFilter, setConferenceFilter] = useState<"All" | "Eastern" | "Western">("All");
  const [rosterTab, setRosterTab] = useState<"forwards" | "defensemen" | "goalies">("forwards");
  const [showDescription, setShowDescription] = useState<boolean>(false);
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
    window.scrollTo({ top: 0, behavior: 'instant' });
    setSelectedTeam(abbr);
    setLoading(true);
    setError(null);
    setRoster(null);
    setRosterTab("forwards");
    setShowDescription(false);
    try {
      const res = await fetch(`${API_BASE}/roster/${abbr}`);
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

  const handleCardClick = async (abbr: string) => {
    if (isSelectingForFollow) {
      if (!isFavorite(abbr)) {
        await toggleFavorite(abbr);
      }
      navigate("/");
      return;
    }
    handleSelectTeam(abbr);
  };

  const handleSelectPlayer = async (player: RosterPlayer) => {
    setSelectedPlayer(player);
    setPlayerDetails(null);
    setPlayerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/player/${player.id}`);
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
            initial={hasAnimatedGrid.current ? false : "hidden"}
            animate="visible"
            exit="exit"
            variants={gridContainerVariants}
            onAnimationStart={() => { hasAnimatedGrid.current = true; }}
          >
            {isSelectingForFollow && (
              <div className="select-team-follow-banner">
                <div className="select-team-banner-content">
                  <Star size={18} className="fill-amber text-amber" />
                  <span className="font-semibold text-sm text-primary">
                    Click any team to add them to your Live Tracker followed list
                  </span>
                </div>
                <button className="btn-secondary text-xs" onClick={() => navigate("/")}>
                  Back to Tracker
                </button>
              </div>
            )}

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
                const cups = STANLEY_CUPS[team.teamAbbrev] || [];
                return (
                  <motion.div 
                    layoutId={`team-card-${team.teamAbbrev}`}
                    key={team.teamAbbrev}
                    variants={teamCardVariants}
                    className={`team-card-btn ${isSelectingForFollow ? 'selectable-follow-card' : ''}`}
                    onClick={() => handleCardClick(team.teamAbbrev)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCardClick(team.teamAbbrev); }}
                    whileHover={{ scale: 1.03, y: -4, transition: { type: "spring", stiffness: 380, damping: 22 } }}
                    whileTap={{ scale: 0.97, transition: { type: "spring", stiffness: 500, damping: 28 } }}
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: 'var(--border-primary)',
                      position: 'relative',
                      zIndex: raisingTeam === team.teamAbbrev ? 10 : 1,
                      cursor: 'pointer'
                    }}
                  >
                    {cups.length > 0 && (
                      <div className="team-card-cup-badge" title={`${cups.length} Stanley Cup${cups.length > 1 ? 's' : ''} (${cups.join(', ')})`}>
                        <Trophy size={13} className="cup-icon" />
                        <span>{cups.length}</span>
                      </div>
                    )}
                    <button
                      className={`team-card-fav-btn ${isFavorite(team.teamAbbrev) ? 'active' : ''}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await toggleFavorite(team.teamAbbrev);
                        if (isSelectingForFollow) {
                          navigate("/");
                        }
                      }}
                      title={isFavorite(team.teamAbbrev) ? "Unfollow team" : "Follow team"}
                    >
                      <Star size={15} className={isFavorite(team.teamAbbrev) ? "fill-amber text-amber" : ""} />
                    </button>
                    <motion.div layoutId={`team-content-${team.teamAbbrev}`} className="team-card-content">
                      <motion.img layoutId={`team-logo-${team.teamAbbrev}`} src={team.teamLogo} alt={team.teamName} className="team-logo-img" />
                      <motion.div layoutId={`team-text-${team.teamAbbrev}`} className="team-card-text">
                        <span className="team-card-city">{team.teamName.split(' ').slice(0, -1).join(' ')}</span>
                        <span className="team-card-mascot" style={{ color: color !== 'var(--border-primary)' ? color : 'var(--text-primary)' }}>
                          {team.teamName.split(' ').slice(-1).join(' ')}
                        </span>
                      </motion.div>
                    </motion.div>
                  </motion.div>
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
              className="team-hero-card"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 30 }}
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
                  {selectedTeam && (STANLEY_CUPS[selectedTeam]?.length ?? 0) > 0 && (
                    <div className="team-hero-cups">
                      <div className="team-hero-cups-badge">
                        <Trophy size={16} className="cup-icon" />
                        <span>{STANLEY_CUPS[selectedTeam].length} Stanley Cup{STANLEY_CUPS[selectedTeam].length > 1 ? 's' : ''}</span>
                      </div>
                      <span className="team-hero-cups-years">
                        {STANLEY_CUPS[selectedTeam].join(', ')}
                      </span>
                    </div>
                  )}
                  {selectedTeam && (
                    <button
                      className={`team-hero-fav-btn ${isFavorite(selectedTeam) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(selectedTeam)}
                    >
                      <Star size={16} className={isFavorite(selectedTeam) ? "fill-amber text-amber" : ""} />
                      <span>{isFavorite(selectedTeam) ? "Following Team" : "Follow Team"}</span>
                    </button>
                  )}
                </motion.div>
              </motion.div>
              
              <motion.div 
                className="team-hero-content"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.22 }}
              >
                {/* Expandable Team Description */}
                {selectedTeam && TEAM_DESCRIPTIONS[selectedTeam] && (
                  <div className="team-description-container" style={{ marginBottom: "2rem" }}>
                    <button 
                      onClick={() => setShowDescription(!showDescription)}
                      style={{ 
                        display: "flex", alignItems: "center", gap: "0.5rem", background: "none", border: "none", 
                        color: "var(--text-primary)", cursor: "pointer", padding: "0.5rem 0", outline: "none",
                        fontSize: "0.95rem", transition: "opacity 0.2s"
                      }}
                    >
                      <span className="font-semibold" style={{ fontFamily: "inherit" }}>About the {activeTeamInfo?.teamName}</span>
                      {showDescription ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <AnimatePresence>
                      {showDescription && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <p className="text-secondary mt-2 leading-relaxed text-sm" style={{ maxWidth: "800px" }}>
                            {TEAM_DESCRIPTIONS[selectedTeam]}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
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
              className="player-modal"
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
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
                    <div className="player-bio-grid">
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
                        <div className="val">{playerDetails.birthCity?.default || '--'}{playerDetails.birthStateProvince ? `, ${playerDetails.birthStateProvince.default}` : ''}</div>
                      </div>
                      <div className="stat-box">
                        <label>Shoots</label>
                        <div className="val">{playerDetails.shootsCatches === 'L' ? 'Left' : playerDetails.shootsCatches === 'R' ? 'Right' : playerDetails.shootsCatches || '--'}</div>
                      </div>
                      {playerDetails.draftDetails && (
                        <div className="stat-box">
                          <label>Draft</label>
                          <div className="val">
                            {playerDetails.draftDetails.year} R{playerDetails.draftDetails.round} (#{playerDetails.draftDetails.overallPick}) {playerDetails.draftDetails.teamAbbrev}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Current Season Featured Stats */}
                    {playerDetails.seasonTotals && playerDetails.seasonTotals[0] && (
                      <div className="season-stats-container">
                        <h3>Current Season ({playerDetails.seasonTotals[0].season?.toString().slice(0, 4) || '2024'}-{(playerDetails.seasonTotals[0].season?.toString().slice(4) || '25')})</h3>
                        <div className="season-stats-row">
                          <div className="stat-item">
                            <span className="stat-lbl">GP</span>
                            <span className="stat-val">{playerDetails.seasonTotals[0].gamesPlayed}</span>
                          </div>
                          {selectedPlayer.positionCode !== 'G' ? (
                            <>
                              <div className="stat-item">
                                <span className="stat-lbl">G</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].goals ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">A</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].assists ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">PTS</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].points ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">+/-</span>
                                <span className="stat-val" style={{ color: (playerDetails.seasonTotals[0].plusMinus ?? 0) > 0 ? 'var(--success)' : (playerDetails.seasonTotals[0].plusMinus ?? 0) < 0 ? 'var(--error)' : 'inherit' }}>
                                  {(playerDetails.seasonTotals[0].plusMinus ?? 0) > 0 ? `+${playerDetails.seasonTotals[0].plusMinus}` : playerDetails.seasonTotals[0].plusMinus ?? 0}
                                </span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">SOG</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].shots ?? '--'}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">SH%</span>
                                <span className="stat-val">
                                  {playerDetails.seasonTotals[0].shootingPctg ? `${(playerDetails.seasonTotals[0].shootingPctg * 100).toFixed(1)}%` : '--'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="stat-item">
                                <span className="stat-lbl">W</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].wins ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">L</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].losses ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">SV%</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].savePctg ? (playerDetails.seasonTotals[0].savePctg).toFixed(3) : '--'}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">GAA</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].goalsAgainstAvg ? (playerDetails.seasonTotals[0].goalsAgainstAvg).toFixed(2) : '--'}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">SO</span>
                                <span className="stat-val">{playerDetails.seasonTotals[0].shutouts ?? 0}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Career Totals */}
                    {playerDetails.careerTotals?.regularSeason && (
                      <div className="career-stats-container">
                        <h3>NHL Career Totals</h3>
                        <div className="season-stats-row">
                          <div className="stat-item">
                            <span className="stat-lbl">GP</span>
                            <span className="stat-val">{playerDetails.careerTotals.regularSeason.gamesPlayed}</span>
                          </div>
                          {selectedPlayer.positionCode !== 'G' ? (
                            <>
                              <div className="stat-item">
                                <span className="stat-lbl">G</span>
                                <span className="stat-val">{playerDetails.careerTotals.regularSeason.goals ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">A</span>
                                <span className="stat-val">{playerDetails.careerTotals.regularSeason.assists ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">PTS</span>
                                <span className="stat-val">{playerDetails.careerTotals.regularSeason.points ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">+/-</span>
                                <span className="stat-val" style={{ color: (playerDetails.careerTotals.regularSeason.plusMinus ?? 0) > 0 ? 'var(--success)' : (playerDetails.careerTotals.regularSeason.plusMinus ?? 0) < 0 ? 'var(--error)' : 'inherit' }}>
                                  {(playerDetails.careerTotals.regularSeason.plusMinus ?? 0) > 0 ? `+${playerDetails.careerTotals.regularSeason.plusMinus}` : playerDetails.careerTotals.regularSeason.plusMinus ?? 0}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="stat-item">
                                <span className="stat-lbl">W</span>
                                <span className="stat-val">{playerDetails.careerTotals.regularSeason.wins ?? 0}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">SV%</span>
                                <span className="stat-val">{playerDetails.careerTotals.regularSeason.savePctg ? (playerDetails.careerTotals.regularSeason.savePctg).toFixed(3) : '--'}</span>
                              </div>
                              <div className="stat-item">
                                <span className="stat-lbl">GAA</span>
                                <span className="stat-val">{playerDetails.careerTotals.regularSeason.goalsAgainstAvg ? (playerDetails.careerTotals.regularSeason.goalsAgainstAvg).toFixed(2) : '--'}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Last 5 Games Log */}
                    {playerDetails.last5Games && playerDetails.last5Games.length > 0 && (
                      <div className="last-5-container">
                        <h3>Last 5 Games</h3>
                        <div className="last-5-table-wrapper">
                          <table className="last-5-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>OPP</th>
                                {selectedPlayer.positionCode !== 'G' ? (
                                  <>
                                    <th>G</th>
                                    <th>A</th>
                                    <th>PTS</th>
                                    <th>+/-</th>
                                    <th>SOG</th>
                                    <th>TOI</th>
                                  </>
                                ) : (
                                  <>
                                    <th>DEC</th>
                                    <th>GA</th>
                                    <th>SA</th>
                                    <th>SV%</th>
                                    <th>TOI</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {playerDetails.last5Games.map((g: any, idx: number) => (
                                <tr key={g.gameId || idx}>
                                  <td>{g.gameDate?.slice(5) || '--'}</td>
                                  <td className="font-semibold">{g.opponentAbbrev || '--'}</td>
                                  {selectedPlayer.positionCode !== 'G' ? (
                                    <>
                                      <td>{g.goals ?? 0}</td>
                                      <td>{g.assists ?? 0}</td>
                                      <td className="font-bold text-accent">{g.points ?? 0}</td>
                                      <td style={{ color: (g.plusMinus ?? 0) > 0 ? 'var(--success)' : (g.plusMinus ?? 0) < 0 ? 'var(--error)' : 'inherit' }}>
                                        {(g.plusMinus ?? 0) > 0 ? `+${g.plusMinus}` : g.plusMinus ?? 0}
                                      </td>
                                      <td>{g.shots ?? 0}</td>
                                      <td className="text-secondary">{g.toi || '--'}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td>{g.decision || '--'}</td>
                                      <td>{g.goalsAgainst ?? 0}</td>
                                      <td>{g.shotsAgainst ?? 0}</td>
                                      <td>{g.savePctg ? (g.savePctg).toFixed(3) : '--'}</td>
                                      <td className="text-secondary">{g.toi || '--'}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
