import os
import json
import time
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint, Index, func, desc, text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, scoped_session, joinedload

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hockey.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

SECRET_KEY = os.environ.get("JWT_SECRET", "hockey-dashboard-jwt-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine))
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    favorites = relationship("UserFavoriteTeam", back_populates="user", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        favs = []
        try:
            if self.favorites:
                favs = [f.team_abbrev for f in self.favorites]
        except Exception:
            pass
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "is_admin": bool(self.is_admin),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "favorites": favs
        }


class UserFavoriteTeam(Base):
    __tablename__ = "user_favorite_teams"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    team_abbrev = Column(String(10), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="favorites")

    __table_args__ = (
        UniqueConstraint("user_id", "team_abbrev", name="uq_user_team"),
    )


class UserPageView(Base):
    __tablename__ = "user_page_views"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String(255), nullable=False, index=True)
    referrer = Column(String(255), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    device_type = Column(String(20), default="desktop")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "path": self.path,
            "referrer": self.referrer,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "device_type": self.device_type,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(50), nullable=True)
    email = Column(String(120), nullable=True)
    category = Column(String(30), default="general")  # feature, bug, general, data
    rating = Column(Integer, nullable=True)           # 1-5
    message = Column(Text, nullable=False)
    status = Column(String(20), default="new")        # new, in_review, resolved, archived
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.username,
            "email": self.email,
            "category": self.category,
            "rating": self.rating,
            "message": self.message,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class CompletedGameCache(Base):
    __tablename__ = "completed_games_cache"

    game_id = Column(String(30), primary_key=True, index=True)
    game_state = Column(String(20), nullable=False)
    data_json = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# Create all tables
Base.metadata.create_all(bind=engine)


# Safe SQLite auto-migrations
def run_db_migrations():
    """Ensure newly added columns exist in existing SQLite databases."""
    with engine.connect() as conn:
        try:
            columns_info = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            col_names = [col[1] for col in columns_info]
            if "is_admin" not in col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0 NOT NULL"))
                conn.commit()
                print("Database migration: added 'is_admin' column to users table.")
        except Exception as e:
            print(f"Migration notice: {e}")

run_db_migrations()


# Auth and Security Helpers
def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def create_access_token(user_id: int, username: str) -> str:
    expire = datetime.datetime.utcnow() + datetime.timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None


# DB User Helper Functions
def get_user_by_username_or_email(identifier: str) -> Optional[User]:
    session = SessionLocal()
    try:
        user = session.query(User).options(joinedload(User.favorites)).filter(
            (User.username == identifier.strip()) | (User.email == identifier.strip().lower())
        ).first()
        return user
    finally:
        session.close()


def get_user_by_id(user_id: int) -> Optional[User]:
    session = SessionLocal()
    try:
        return session.query(User).options(joinedload(User.favorites)).filter(User.id == user_id).first()
    finally:
        session.close()


def create_user(username: str, email: str, password: str, is_admin: bool = False) -> User:
    session = SessionLocal()
    try:
        hashed = hash_password(password)
        new_user = User(
            username=username.strip(),
            email=email.strip().lower(),
            password_hash=hashed,
            is_admin=is_admin
        )
        session.add(new_user)
        session.commit()
        # Eager load
        user = session.query(User).options(joinedload(User.favorites)).filter(User.id == new_user.id).first()
        return user
    finally:
        session.close()


def set_user_admin(identifier: str | int, is_admin: bool = True) -> Optional[User]:
    """Promote or demote a user by user_id, username, or email."""
    session = SessionLocal()
    try:
        if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.isdigit()):
            user = session.query(User).filter(User.id == int(identifier)).first()
        else:
            ident = str(identifier).strip()
            user = session.query(User).filter(
                (User.username == ident) | (User.email == ident.lower())
            ).first()

        if user:
            user.is_admin = is_admin
            session.commit()
            session.refresh(user)
            return user
        return None
    finally:
        session.close()


def get_all_users_admin(search: str = "", limit: int = 100) -> List[Dict[str, Any]]:
    session = SessionLocal()
    try:
        query = session.query(User).options(joinedload(User.favorites))
        if search:
            s = f"%{search.strip().lower()}%"
            query = query.filter(
                (func.lower(User.username).like(s)) | (func.lower(User.email).like(s))
            )
        users = query.order_by(desc(User.created_at)).limit(limit).all()
        return [u.to_dict() for u in users]
    finally:
        session.close()


def get_user_favorites(user_id: int) -> List[str]:
    session = SessionLocal()
    try:
        favs = session.query(UserFavoriteTeam).filter(UserFavoriteTeam.user_id == user_id).all()
        return [f.team_abbrev for f in favs]
    finally:
        session.close()


def set_user_favorites(user_id: int, team_abbrevs: List[str]) -> List[str]:
    session = SessionLocal()
    try:
        session.query(UserFavoriteTeam).filter(UserFavoriteTeam.user_id == user_id).delete()
        unique_abbrevs = list(dict.fromkeys([t.upper().strip() for t in team_abbrevs if t and t.strip()]))
        for abbr in unique_abbrevs:
            session.add(UserFavoriteTeam(user_id=user_id, team_abbrev=abbr))
        session.commit()
        return unique_abbrevs
    finally:
        session.close()


def toggle_user_favorite(user_id: int, team_abbrev: str) -> List[str]:
    session = SessionLocal()
    try:
        abbr = team_abbrev.upper().strip()
        existing = session.query(UserFavoriteTeam).filter(
            UserFavoriteTeam.user_id == user_id,
            UserFavoriteTeam.team_abbrev == abbr
        ).first()
        if existing:
            session.delete(existing)
        else:
            session.add(UserFavoriteTeam(user_id=user_id, team_abbrev=abbr))
        session.commit()
        favs = session.query(UserFavoriteTeam).filter(UserFavoriteTeam.user_id == user_id).all()
        return [f.team_abbrev for f in favs]
    finally:
        session.close()


# Telemetry and Page Views
def log_page_view(
    path: str,
    referrer: Optional[str] = None,
    user_id: Optional[int] = None,
    session_id: Optional[str] = None,
    device_type: str = "desktop"
) -> None:
    session = SessionLocal()
    try:
        # Keep path clean (max 255 chars)
        clean_path = (path or "/")[:255]
        clean_ref = (referrer or "")[:255] if referrer else None
        clean_dev = device_type if device_type in ("desktop", "mobile", "tablet") else "desktop"

        pv = UserPageView(
            path=clean_path,
            referrer=clean_ref,
            user_id=user_id,
            session_id=session_id[:100] if session_id else None,
            device_type=clean_dev,
            created_at=datetime.datetime.utcnow()
        )
        session.add(pv)
        session.commit()
    except Exception as e:
        session.rollback()
        print(f"Error logging page view: {e}")
    finally:
        session.close()


# User Feedback System
def create_feedback(
    message: str,
    category: str = "general",
    rating: Optional[int] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    email: Optional[str] = None
) -> Dict[str, Any]:
    session = SessionLocal()
    try:
        fb = UserFeedback(
            user_id=user_id,
            username=username.strip() if username else None,
            email=email.strip().lower() if email else None,
            category=category.strip() if category else "general",
            rating=rating if rating and 1 <= rating <= 5 else None,
            message=message.strip(),
            status="new",
            created_at=datetime.datetime.utcnow()
        )
        session.add(fb)
        session.commit()
        session.refresh(fb)
        return fb.to_dict()
    finally:
        session.close()


def get_feedback_list(
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    session = SessionLocal()
    try:
        query = session.query(UserFeedback)
        if status and status != "all":
            query = query.filter(UserFeedback.status == status)
        if category and category != "all":
            query = query.filter(UserFeedback.category == category)
        items = query.order_by(desc(UserFeedback.created_at)).limit(limit).all()
        return [item.to_dict() for item in items]
    finally:
        session.close()


def update_feedback_status(feedback_id: int, status: str) -> Optional[Dict[str, Any]]:
    session = SessionLocal()
    try:
        fb = session.query(UserFeedback).filter(UserFeedback.id == feedback_id).first()
        if fb:
            fb.status = status
            session.commit()
            session.refresh(fb)
            return fb.to_dict()
        return None
    finally:
        session.close()


# Admin Analytics Overview
def get_admin_analytics_summary() -> Dict[str, Any]:
    session = SessionLocal()
    try:
        now = datetime.datetime.utcnow()
        day_ago = now - datetime.timedelta(days=1)
        week_ago = now - datetime.timedelta(days=7)

        total_users = session.query(func.count(User.id)).scalar() or 0
        new_users_today = session.query(func.count(User.id)).filter(User.created_at >= day_ago).scalar() or 0
        new_users_7d = session.query(func.count(User.id)).filter(User.created_at >= week_ago).scalar() or 0

        # Unique active sessions/users
        active_users_today = session.query(func.count(func.distinct(UserPageView.session_id))).filter(
            UserPageView.created_at >= day_ago
        ).scalar() or 0
        active_users_7d = session.query(func.count(func.distinct(UserPageView.session_id))).filter(
            UserPageView.created_at >= week_ago
        ).scalar() or 0

        # Pageviews
        total_pageviews = session.query(func.count(UserPageView.id)).scalar() or 0
        pageviews_today = session.query(func.count(UserPageView.id)).filter(UserPageView.created_at >= day_ago).scalar() or 0
        pageviews_7d = session.query(func.count(UserPageView.id)).filter(UserPageView.created_at >= week_ago).scalar() or 0

        # Top pages
        top_pages_query = session.query(
            UserPageView.path,
            func.count(UserPageView.id).label("count")
        ).group_by(UserPageView.path).order_by(desc("count")).limit(8).all()
        top_pages = [{"path": row[0], "count": row[1]} for row in top_pages_query]

        # Device breakdown
        mobile_count = session.query(func.count(UserPageView.id)).filter(UserPageView.device_type == "mobile").scalar() or 0
        desktop_count = session.query(func.count(UserPageView.id)).filter(UserPageView.device_type == "desktop").scalar() or 0

        # Top Followed Teams
        top_teams_query = session.query(
            UserFavoriteTeam.team_abbrev,
            func.count(UserFavoriteTeam.id).label("count")
        ).group_by(UserFavoriteTeam.team_abbrev).order_by(desc("count")).limit(10).all()
        top_teams = [{"team_abbrev": row[0], "count": row[1]} for row in top_teams_query]

        # Feedback summary
        total_feedback = session.query(func.count(UserFeedback.id)).scalar() or 0
        new_feedback = session.query(func.count(UserFeedback.id)).filter(UserFeedback.status == "new").scalar() or 0
        resolved_feedback = session.query(func.count(UserFeedback.id)).filter(UserFeedback.status == "resolved").scalar() or 0
        recent_feedback = session.query(UserFeedback).order_by(desc(UserFeedback.created_at)).limit(5).all()

        return {
            "users": {
                "total": total_users,
                "new_today": new_users_today,
                "new_7d": new_users_7d,
                "active_today": active_users_today,
                "active_7d": active_users_7d
            },
            "pageviews": {
                "total": total_pageviews,
                "today": pageviews_today,
                "last_7d": pageviews_7d,
                "top_pages": top_pages,
                "device_breakdown": {
                    "desktop": desktop_count,
                    "mobile": mobile_count
                }
            },
            "top_teams": top_teams,
            "feedback": {
                "total": total_feedback,
                "new": new_feedback,
                "resolved": resolved_feedback,
                "recent": [f.to_dict() for f in recent_feedback]
            }
        }
    finally:
        session.close()


# Completed Game Caching
def get_cached_game(game_id: str) -> Optional[Dict[str, Any]]:
    session = SessionLocal()
    try:
        entry = session.query(CompletedGameCache).filter(CompletedGameCache.game_id == str(game_id)).first()
        if entry:
            return json.loads(entry.data_json)
        return None
    except Exception as e:
        print(f"Error reading game cache {game_id}: {e}")
        return None
    finally:
        session.close()


def save_cached_game(game_id: str, game_state: str, data: Dict[str, Any]) -> None:
    session = SessionLocal()
    try:
        gid = str(game_id)
        data_str = json.dumps(data)
        existing = session.query(CompletedGameCache).filter(CompletedGameCache.game_id == gid).first()
        if existing:
            existing.game_state = game_state
            existing.data_json = data_str
            existing.updated_at = datetime.datetime.utcnow()
        else:
            new_entry = CompletedGameCache(
                game_id=gid,
                game_state=game_state,
                data_json=data_str
            )
            session.add(new_entry)
        session.commit()
    except Exception as e:
        session.rollback()
        print(f"Error saving game cache {game_id}: {e}")
    finally:
        session.close()
