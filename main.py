"""
Kafka Kanban Backend
FastAPI server with Kafka Producer/Consumer and WebSocket broadcasting
"""

import asyncio
import json
import sys
import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, ConfigDict
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from backend import models, auth
from backend.database import engine, get_db

# Create database tables
models.Base.metadata.create_all(bind=engine)

def seed_db():
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        # Check if test user exists
        test_email = "test@example.com"
        user = db.query(models.User).filter(models.User.email == test_email).first()
        if not user:
            print("Seeding default test user...")
            hashed_pw = auth.get_password_hash("password123")
            new_user = models.User(
                email=test_email,
                hashed_password=hashed_pw,
                full_name="Test User"
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)

            # Create default workspace
            ws = models.Workspace(name="Test Workspace", owner_id=new_user.id)
            db.add(ws)
            db.commit()
            db.refresh(ws)

            # Create default board
            board = models.Board(name="Task Board", workspace_id=ws.id)
            db.add(board)
            db.commit()
            db.refresh(board)
            
            # Create default columns for the board
            cols = [
                models.BoardColumn(board_id=board.id, title="To Do", position=0, color="amber-100"),
                models.BoardColumn(board_id=board.id, title="In Progress", position=1, color="blue-100"),
                models.BoardColumn(board_id=board.id, title="Done", position=2, color="green-100")
            ]
            db.add_all(cols)
            db.commit()
            print(f"Default user created: {test_email} / password123")
    finally:
        db.close()

def migrate_columns():
    """Ensure all boards have columns and tasks are linked to them"""
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        boards = db.query(models.Board).all()
        for board in boards:
            # Check if board has columns
            if not board.columns:
                print(f"Migrating board {board.id} to use columns...")
                cols = [
                    models.BoardColumn(board_id=board.id, title="To Do", position=0, color="amber-100"),
                    models.BoardColumn(board_id=board.id, title="In Progress", position=1, color="blue-100"),
                    models.BoardColumn(board_id=board.id, title="Done", position=2, color="green-100")
                ]
                db.add_all(cols)
                db.commit()
                # Refresh to get IDs
                for c in cols: db.refresh(c)
                
                # Map status to column_id for existing tasks
                status_map = {
                    "todo": cols[0].id,
                    "inprogress": cols[1].id,
                    "done": cols[2].id
                }
                
                tasks = db.query(models.Task).filter(models.Task.board_id == board.id).all()
                for task in tasks:
                    if not task.column_id and task.status in status_map:
                        task.column_id = status_map[task.status]
                db.commit()
                print(f"Migrated {len(tasks)} tasks for board {board.name}")

    finally:
        db.close()

seed_db()
migrate_columns()

# Fix for Windows event loop (ProactorEventLoop support in newer aiokafka versions)
if sys.platform == 'win32' and sys.version_info < (3, 11):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# ===== Configuration =====
KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
KAFKA_TOPIC = "kanban-events"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# ===== Connection Manager for WebSockets =====
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        """Send message to all connected WebSocket clients"""
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"Error broadcasting to client: {e}")

manager = ConnectionManager()

# ===== Global Kafka instances =====
producer: AIOKafkaProducer = None
consumer_task: asyncio.Task = None

# ===== Kafka Consumer Background Task =====
async def consume_events():
    """Background task that consumes Kafka events and broadcasts to WebSocket clients"""
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id="kanban-consumer-group",
        auto_offset_reset="latest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8"))
    )

    try:
        await consumer.start()
        print(f"Kafka consumer started, listening to topic: {KAFKA_TOPIC}")

        async for msg in consumer:
            print(f"Consumed event: {msg.value}")
            await manager.broadcast(json.dumps(msg.value))

    except Exception as e:
        print(f"Kafka consumer error: {e}")
    finally:
        await consumer.stop()

# ===== Lifespan Events =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown of Kafka producer/consumer"""
    global producer, consumer_task

    try:
        producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8")
        )
        await producer.start()
        print("Kafka producer started")
        consumer_task = asyncio.create_task(consume_events())
        print("Kafka consumer task started")
    except Exception as e:
        print(f"Failed to connect to Kafka: {e}")
        print("Running in OFFLINE mode - events will not be sent to Kafka")

    yield

    if producer:
        await producer.stop()
        print("Kafka producer stopped")
    if consumer_task:
        consumer_task.cancel()
        print("Kafka consumer task cancelled")

# ===== FastAPI App =====
app = FastAPI(title="Tulay Kanban API", lifespan=lifespan)

# ===== Pydantic Models =====
class KanbanEvent(BaseModel):
    type: str
    taskId: str
    data: dict = {}
    timestamp: str = None

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    email: str
    full_name: str

class Token(BaseModel):
    access_token: str
    token_type: str

class WorkspaceCreate(BaseModel):
    name: str

class BoardCreate(BaseModel):
    name: str
    workspace_id: str

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    status: str = "todo"
    label: Optional[str] = None
    board_id: str
    column_id: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime.datetime] = None

class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    label: Optional[str] = None
    board_id: str
    column_id: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime.datetime] = None
    events: Optional[list] = []
    created_at: datetime.datetime
    updated_at: datetime.datetime

class BoardColumnCreate(BaseModel):
    title: str
    position: int
    color: Optional[str] = None

class BoardColumnUpdate(BaseModel):
    title: Optional[str] = None
    position: Optional[int] = None
    color: Optional[str] = None

# ===== Auth Dependency =====
async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# ===== Auth Routes =====
@app.post("/api/auth/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Registration is disabled
    raise HTTPException(status_code=403, detail="Registration is currently disabled")

@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user

# ===== Workspace Routes =====
@app.get("/api/workspaces")
def get_workspaces(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).all()

@app.post("/api/workspaces")
def create_workspace(ws_in: WorkspaceCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_ws = models.Workspace(name=ws_in.name, owner_id=current_user.id)
    db.add(new_ws)
    db.commit()
    db.refresh(new_ws)
    return new_ws

# ===== Board Routes =====
@app.get("/api/workspaces/{ws_id}/boards")
def get_boards(ws_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(models.Workspace).filter(models.Workspace.id == ws_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws.boards

@app.post("/api/boards")
def create_board(board_in: BoardCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_board = models.Board(name=board_in.name, workspace_id=board_in.workspace_id)
    db.add(new_board)
    db.commit()
    db.refresh(new_board)
    
    # Create default columns
    cols = [
        models.BoardColumn(board_id=new_board.id, title="To Do", position=0, color="amber-100"),
        models.BoardColumn(board_id=new_board.id, title="In Progress", position=1, color="blue-100"),
        models.BoardColumn(board_id=new_board.id, title="Done", position=2, color="green-100")
    ]
    db.add_all(cols)
    db.commit()
    
    return new_board

@app.delete("/api/boards/{board_id}")
def delete_board(board_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    board = db.query(models.Board).filter(models.Board.id == board_id).first()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    
    # Cascade delete is configured in the model, so just delete the board
    db.delete(board)
    db.commit()
    return {"message": "Board deleted successfully"}

# ===== Column Routes =====
@app.get("/api/boards/{board_id}/columns")
def get_board_columns(board_id: str, db: Session = Depends(get_db)):
    return db.query(models.BoardColumn).filter(models.BoardColumn.board_id == board_id).order_by(models.BoardColumn.position).all()

@app.post("/api/boards/{board_id}/columns")
def create_column(board_id: str, col_in: BoardColumnCreate, db: Session = Depends(get_db)):
    # Shift existing columns if necessary or just append (simplified: just append if no position logic)
    # Actually, we rely on frontend or simple increment for now.
    new_col = models.BoardColumn(
        board_id=board_id,
        title=col_in.title,
        position=col_in.position,
        color=col_in.color
    )
    db.add(new_col)
    db.commit()
    db.refresh(new_col)
    return new_col

@app.put("/api/columns/{column_id}")
def update_column(column_id: str, col_in: BoardColumnUpdate, db: Session = Depends(get_db)):
    col = db.query(models.BoardColumn).filter(models.BoardColumn.id == column_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    
    if col_in.title is not None:
        col.title = col_in.title
    if col_in.position is not None:
        col.position = col_in.position
    if col_in.color is not None:
        col.color = col_in.color
        
    db.commit()
    return col

@app.delete("/api/columns/{column_id}")
def delete_column(column_id: str, db: Session = Depends(get_db)):
    col = db.query(models.BoardColumn).filter(models.BoardColumn.id == column_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    
    # Delete all tasks in this column first (cascade)
    db.query(models.Task).filter(models.Task.column_id == column_id).delete()
    
    # Then delete the column
    db.delete(col)
    db.commit()
    return {"ok": True}

@app.get("/api/workspaces/{ws_id}/members")
def get_workspace_members(ws_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(models.Workspace).filter(models.Workspace.id == ws_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    # Return owner + members
    members = [{"id": ws.owner.id, "email": ws.owner.email, "full_name": ws.owner.full_name}]
    for m in ws.members:
        if m.id != ws.owner.id:
            members.append({"id": m.id, "email": m.email, "full_name": m.full_name})
    return members

@app.get("/api/tasks/my", response_model=List[TaskResponse])
def get_my_tasks(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all tasks assigned to the current user across all boards."""
    tasks = db.query(models.Task).filter(models.Task.assignee_id == current_user.id).all()
    return tasks

# ===== Task Routes =====
@app.get("/api/boards/{board_id}/tasks", response_model=List[TaskResponse])
def get_board_tasks(board_id: str, db: Session = Depends(get_db)):
    try:
        tasks = db.query(models.Task).filter(models.Task.board_id == board_id).all()
        return tasks
    except Exception as e:
        print(f"Error loading tasks: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(task_in: TaskCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_task = models.Task(**task_in.model_dump())
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    
    # Save activity
    activity = models.Activity(
        board_id=new_task.board_id,
        user_id=current_user.id,
        event_type="TASK_CREATED",
        task_id=new_task.id,
        task_title=new_task.title,
        data={"status": new_task.status}
    )
    db.add(activity)
    db.commit()
    
    event = {
        "type": "TASK_CREATED",
        "taskId": new_task.id,
        "data": {"title": new_task.title, "status": new_task.status, "board_id": new_task.board_id},
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
    if producer:
        await producer.send_and_wait(KAFKA_TOPIC, event)
    else:
        await manager.broadcast(json.dumps(event))
    
    return new_task

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, updates: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify access to board
    board = db.query(models.Board).filter(models.Board.id == task.board_id).first()
    ws = db.query(models.Workspace).filter(models.Workspace.id == board.workspace_id).first()
    if ws.owner_id != current_user.id and not any(m.id == current_user.id for m in ws.members):
        raise HTTPException(status_code=403, detail="Not authorized to update this task")

    # old_status for Kafka event
    old_status = task.status
    
    for key, value in updates.items():
        if hasattr(task, key):
            setattr(task, key, value)
    
    db.commit()
    db.refresh(task)

    # Save activity
    event_type = "TASK_MOVED" if old_status != task.status else "TASK_UPDATED"
    activity = models.Activity(
        board_id=task.board_id,
        user_id=current_user.id,
        event_type=event_type,
        task_id=task.id,
        task_title=task.title,
        data=updates
    )
    db.add(activity)
    db.commit()

    # Kafka event
    event = {
        "type": event_type,
        "taskId": task.id,
        "data": updates,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "user_id": current_user.id,
        "board_id": task.board_id
    }
    if producer:
        await producer.send_and_wait(KAFKA_TOPIC, event)
    else:
        await manager.broadcast(json.dumps(event))

    return task

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    board = db.query(models.Board).filter(models.Board.id == task.board_id).first()
    ws = db.query(models.Workspace).filter(models.Workspace.id == board.workspace_id).first()
    if ws.owner_id != current_user.id and not any(m.id == current_user.id for m in ws.members):
        raise HTTPException(status_code=403, detail="Not authorized to delete this task")

    # Save activity before deleting
    task_title = task.title
    board_id = task.board_id
    
    activity = models.Activity(
        board_id=board_id,
        user_id=current_user.id,
        event_type="TASK_DELETED",
        task_id=task_id,
        task_title=task_title,
        data={}
    )
    db.add(activity)

    db.delete(task)
    db.commit()

    event = {
        "type": "TASK_DELETED",
        "taskId": task_id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "user_id": current_user.id,
        "board_id": board_id
    }
    if producer:
        await producer.send_and_wait(KAFKA_TOPIC, event)
    else:
        await manager.broadcast(json.dumps(event))

    return {"status": "deleted"}

# ===== Existing Kafka Event Route =====
@app.post("/api/events")
async def publish_event(event: KanbanEvent):
    """Receive event from frontend and publish to Kafka"""
    event_data = event.model_dump()
    
    if producer:
        try:
            await producer.send_and_wait(KAFKA_TOPIC, event_data)
            print(f"Produced event to Kafka: {event_data}")
            return {"status": "sent", "topic": KAFKA_TOPIC}
        except Exception as e:
            print(f"Failed to send to Kafka: {e}")
            await manager.broadcast(json.dumps(event_data))
            return {"status": "fallback", "error": str(e)}
    else:
        await manager.broadcast(json.dumps(event_data))
        return {"status": "offline", "message": "Kafka not connected, broadcast directly"}

# ===== Activity Routes =====
@app.get("/api/boards/{board_id}/activities")
def get_board_activities(board_id: str, db: Session = Depends(get_db)):
    """Get all activities for a board, ordered by most recent first."""
    activities = db.query(models.Activity).filter(
        models.Activity.board_id == board_id
    ).order_by(models.Activity.timestamp.desc()).limit(100).all()
    return [{
        "id": a.id,
        "event_type": a.event_type,
        "task_id": a.task_id,
        "task_title": a.task_title,
        "data": a.data,
        "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        "user_id": a.user_id
    } for a in activities]

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "kafka_connected": producer is not None,
        "websocket_connections": len(manager.active_connections)
    }

# ===== WebSocket Route =====
@app.websocket("/ws/{board_id}")
async def websocket_endpoint(websocket: WebSocket, board_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from client on board {board_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ===== Static Files =====
STATIC_DIR = Path(__file__).parent

@app.get("/")
async def serve_index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/login")
async def serve_login():
    return FileResponse(STATIC_DIR / "login.html")

@app.get("/app.js")
async def serve_app_js():
    return FileResponse(STATIC_DIR / "app.js")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
