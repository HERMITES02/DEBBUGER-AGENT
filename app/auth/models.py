from sqlalchemy import Column, String, DateTime, Boolean, Float, Text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from datetime import datetime, time
import uuid, os
import json,time
from contextlib import asynccontextmanager


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./users.db")

engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class SessionRecord(Base):
    __tablename__ = "sessions"

    session_id   = Column(String, primary_key=True)
    user_id      = Column(String, nullable=False, index=True)
    timestamp    = Column(Float, default=time.time)
    language     = Column(String, default="python")
    summary      = Column(String)
    confidence   = Column(Float, default=0.0)
    root_cause   = Column(Text)
    patch        = Column(Text)
    explanation  = Column(Text)
    tests        = Column(Text)   # JSON string
    code         = Column(Text)
    user_message = Column(Text)
    images       = Column(Text, default="[]")  # JSON string of image URLs

class User(Base):
    __tablename__ = "users"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email         = Column(String, unique=True, index=True, nullable=False)
    username      = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)
    is_active     = Column(Boolean, default=True)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.exec_driver_sql("ALTER TABLE sessions ADD COLUMN images TEXT DEFAULT '[]'")
        except Exception:
            pass
    print("[startup] Database tables created & migrated")

@asynccontextmanager
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()