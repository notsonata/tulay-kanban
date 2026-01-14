# Tulay Kanban

A modern, real-time Kanban board application powered by **Apache Kafka** for event streaming. Built with a sleek UI, FastAPI backend, and PostgreSQL for reliable data persistence.

![Tulay Kanban Board](https://img.shields.io/badge/Status-Active-green) ![Kafka](https://img.shields.io/badge/Apache%20Kafka-Powered-red)

## Features

### Real-Time Synchronization
- **Kafka Event Streaming** - All actions (create, update, move, delete) are streamed via Kafka
- **Live Updates** - Changes reflect instantly across connected clients using WebSockets
- **Activity Log** - Real-time audit log of all actions

### Board Management
- **Multiple Boards** - Create and manage multiple project boards
- **Empty States** - Helpful guides when starting new boards or lists
- **Safe Deletion** - Confirmation dialogs for destructive actions

### Task Management
- **Drag & Drop** - Smooth task movement between lists and reordering within lists
- **Rich Details** - Side panel editor for description, priority, labels, and due dates
- **Due Dates** - proper management of task deadlines
- **Labels & Priority** - Categorize tasks with visual indicators

### User Experience
- **Light/Dark Mode** - Full theme support
- **Responsive Design** - Works great on different screen sizes
- **Toast Notifications** - Non-intrusive feedback for interactions

## Tech Stack

- **Frontend**: Vanilla JavaScript, Tailwind CSS, Material Symbols
- **Backend**: FastAPI (Python), SQLAlchemy ORM
- **Event Streaming**: Apache Kafka, Zookeeper
- **Database**: PostgreSQL (via Docker)
- **Authentication**: JWT-based (Registration currently disabled for demo)
- **Containerization**: Docker Compose

## Getting Started

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.9+

### 2. Setup Services
Start PostgreSQL, Kafka, and Zookeeper using Docker:
```bash
docker compose up -d
```
*Wait a few moments for Kafka to fully initialize.*

### 3. Setup Python Backend
Install dependencies and run the FastAPI server:
```bash
pip install -r requirements.txt
python main.py
```

### 4. Open Application
Visit `http://localhost:8000`.

**Note**: Registration is currently **disabled**. Use the provided test credentials on the login page:
- **Email**: `test@example.com`
- **Password**: `password123`

## Project Structure

```
tulay-kanban/
├── main.py                 # FastAPI backend & Kafka producer/consumer
├── backend/
│   ├── auth.py            # JWT authentication
│   ├── database.py        # Database configuration
│   └── models.py          # SQLAlchemy models
├── app.js                 # Frontend logic, WebSocket, Drag & Drop
├── index.html             # Main dashboard UI
├── login.html             # Login page
├── docker-compose.yml     # Kafka, Zookeeper, & PostgreSQL config
├── requirements.txt       # Python dependencies
└── README.md
```

## Future Roadmap

- [x] Multiple boards and workspace management
- [x] Drag & drop for tasks and lists
- [x] User authentication (Login)
- [x] Activity logging via Kafka
- [x] List reordering
- [x] Task due dates
- [x] Real-time updates via WebSockets
- [ ] Task comments and attachments
- [ ] Advanced filtering and search
- [ ] Team collaboration features (Invite members)
- [ ] Custom labels and priority configuration

## License

MIT License - Feel free to use and modify.

