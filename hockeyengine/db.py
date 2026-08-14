import os
import json
import time
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, Index
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


class CompletedGameCache(Base):
    __tablename__ = "completed_games_cache"

    game_id = Column(String(30), primary_key=True, index=True)
    game_state = Column(String(20), nullable=False)
    data_json = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# Create all tables on startup
Base.metadata.create_all(bind=engine)


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


# DB Helper Functions
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


def create_user(username: str, email: str, password: str) -> User:
    session = SessionLocal()
    try:
        hashed = hash_password(password)
        new_user = User(
            username=username.strip(),
            email=email.strip().lower(),
            password_hash=hashed
        )
        session.add(new_user)
        session.commit()
        # Eager load
        user = session.query(User).options(joinedload(User.favorites)).filter(User.id == new_user.id).first()
        return user
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
