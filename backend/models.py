import datetime
import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON, Table
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

# Association table for Workspace Members
workspace_members = Table(
    "workspace_members",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.id"), primary_key=True),
    Column("workspace_id", String, ForeignKey("workspaces.id"), primary_key=True),
    Column("role", String, default="member")
)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owned_workspaces = relationship("Workspace", back_populates="owner")
    workspaces = relationship("Workspace", secondary=workspace_members, back_populates="members")
    tasks = relationship("Task", back_populates="assignee")

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    owner_id = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="owned_workspaces")
    members = relationship("User", secondary=workspace_members, back_populates="workspaces")
    boards = relationship("Board", back_populates="workspace", cascade="all, delete-orphan")
    labels = relationship("Label", back_populates="workspace", cascade="all, delete-orphan")

class Board(Base):
    __tablename__ = "boards"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="boards")
    tasks = relationship("Task", back_populates="board", cascade="all, delete-orphan")
    columns = relationship("BoardColumn", back_populates="board", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="board")
    labels = relationship("Label", back_populates="board", cascade="all, delete-orphan")

# Association table for Task Labels
task_labels = Table(
    "task_labels",
    Base.metadata,
    Column("task_id", String, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", String, ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True)
)

class BoardColumn(Base):
    __tablename__ = "board_columns"

    id = Column(String, primary_key=True, default=generate_uuid)
    board_id = Column(String, ForeignKey("boards.id"))
    title = Column(String, nullable=False)
    position = Column(Integer, default=0)
    color = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    board = relationship("Board", back_populates="columns")
    tasks = relationship("Task", back_populates="column", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    board_id = Column(String, ForeignKey("boards.id"))
    title = Column(String, nullable=False)
    description = Column(Text)
    column_id = Column(String, ForeignKey("board_columns.id"), nullable=True) # Making nullable for migration
    status = Column(String, default="todo") # Deprecated, keeping for backward compatibility during migration
    priority = Column(String, default="medium")
    label = Column(String)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    events = Column(JSON, default=[])
    images = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    board = relationship("Board", back_populates="tasks")
    assignee = relationship("User", back_populates="tasks")
    column = relationship("BoardColumn", back_populates="tasks")
    labels = relationship("Label", secondary=task_labels, back_populates="tasks")

class Label(Base):
    __tablename__ = "labels"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=True)
    board_id = Column(String, ForeignKey("boards.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="labels")
    board = relationship("Board", back_populates="labels")
    tasks = relationship("Task", secondary=task_labels, back_populates="labels")

class Activity(Base):
    __tablename__ = "activities"

    id = Column(String, primary_key=True, default=generate_uuid)
    board_id = Column(String, ForeignKey("boards.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    event_type = Column(String, nullable=False)  # TASK_CREATED, TASK_UPDATED, etc.
    task_id = Column(String, nullable=True)
    task_title = Column(String, nullable=True)
    data = Column(JSON, default={})
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    board = relationship("Board", back_populates="activities")
    user = relationship("User")
