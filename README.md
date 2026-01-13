# Tulay Kanban

A modern, full-featured Kanban board application with a sleek UI and powerful task management capabilities. Built with FastAPI and PostgreSQL for reliable data persistence.

![Tulay Kanban Board](https://img.shields.io/badge/Status-Active-green)

## Features

### Board Management
- **Multiple Boards** - Create and manage multiple project boards with easy navigation
- **Board Search** - Quick filtering in the sidebar to find your boards
- **Board Deletion** - Safe deletion with name confirmation to prevent accidents

### List Management
- **Flexible Lists** - Create custom lists (columns) for your workflow
- **Drag & Drop Reordering** - Rearrange lists by dragging headers or using menu buttons
- **List Actions** - Rename, move, or delete lists via the menu
- **Inline List Creation** - Modal-based list creation with quick keyboard shortcuts

### Task Management
- **Drag & Drop** - Smooth task movement between lists with visual indicators
- **Inline Card Creation** - Quick add cards directly in each list
- **Side Panel Editor** - Comprehensive task details in a sleek slide-out panel
- **Priority Levels** - Low, Medium, and High priority options
- **Labels** - Categorize tasks with Backend, Frontend, Design, or DevOps labels
- **Task Deletion** - Safe deletion with confirmation

### User Experience
- **Light/Dark Mode** - Full theme support with persistent preferences
- **Header Stats** - Overview of all lists with task counts and horizontal scrolling
- **Activity Tracking** - Persistent activity log for all board actions
- **Smart Confirmations** - Type-to-confirm for destructive actions
- **Keyboard Shortcuts** - Enter to create, Escape to cancel

## Tech Stack

- **Frontend**: Vanilla JavaScript, Tailwind CSS (via CDN), Material Symbols Icons
- **Backend**: FastAPI (Python) with SQLAlchemy ORM
- **Database**: PostgreSQL with proper foreign key relationships
- **Authentication**: JWT-based authentication system
- **Containerization**: Docker & Docker Compose for database services

## Getting Started

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.9+

### 2. Setup Services
Start the PostgreSQL database using Docker:
```bash
docker compose up -d
```

### 3. Setup Python Backend
Install dependencies and run the FastAPI server:
```bash
pip install -r requirements.txt
python main.py
```

### 4. Open Application
Visit `http://localhost:8000` to start using Tulay Kanban.

## Project Structure

```
tulay-kanban/
├── main.py                 # FastAPI backend with API endpoints
├── backend/
│   ├── auth.py            # JWT authentication
│   ├── database.py        # Database configuration
│   └── models.py          # SQLAlchemy models (Board, BoardColumn, Task, Activity)
├── app.js                 # Frontend logic (State, UI rendering, drag & drop)
├── index.html             # Single-page application UI
├── login.html             # Authentication page
├── docker-compose.yml     # PostgreSQL configuration
├── requirements.txt       # Python dependencies
└── README.md
```

## Usage

### Getting Started
1. **Create an Account** - Register on the login page
2. **Create a Board** - Click the "+" button next to "Boards" in the sidebar
3. **Add Lists** - Click "Add another list" to create your workflow columns
4. **Add Tasks** - Use the "Add card" button at the bottom of lists or from the list menu

### Working with Tasks
- **Create Cards** - Click "Add card" button, enter title, select priority and label
- **Move Tasks** - Drag and drop cards between lists
- **Edit Tasks** - Click any card to open the details panel
- **Delete Tasks** - Click the delete button in the task panel

### Organizing Your Board
- **Reorder Lists** - Drag list headers or use Move left/right in the menu
- **Rename Lists** - Use "Rename list" option in the list menu
- **Delete Lists** - Type the list name to confirm deletion
- **Toggle Theme** - Use the theme toggle in the sidebar

### Board Management
- **Switch Boards** - Click any board in the sidebar
- **Delete Boards** - Click the delete icon and type the board name to confirm
- **View Activity** - Click "Activity" in the sidebar to see your action history

## Database Models

- **Board** - Project boards with name and owner
- **BoardColumn** - Lists/columns with title, position, and color
- **Task** - Individual cards with title, description, priority, label, and position
- **Activity** - Audit log of all actions (preserved when boards are deleted)

## Future Roadmap

- [x] Multiple boards and workspace management
- [x] Drag & drop for tasks and lists
- [x] User authentication
- [x] Activity logging
- [x] List reordering
- [x] Confirmation modals for destructive actions
- [ ] Task comments and attachments
- [ ] Advanced filtering and search
- [ ] Team collaboration features
- [ ] Task due dates and reminders
- [ ] Custom labels and priorities

## License

MIT License - Feel free to use and modify.

