# Tulay Kanban

A modern, real-time Kanban board built with vanilla JavaScript and Tailwind CSS. Features a sleek Superthread-inspired design with drag-and-drop functionality.

![Tulay Kanban Board](https://img.shields.io/badge/Status-Active-green)

## Features

- **Kanban Board** - Three columns: To Do, In Progress, Done
- **Drag & Drop** - Reorder cards within columns or move between columns
- **Inline Card Creation** - Quick add cards directly in each column
- **Side Panel Editor** - Click any card to edit details in a slide-out panel
- **Due Dates** - Set and track task deadlines
- **Priority Levels** - Low, Medium, High with color indicators
- **Labels** - Backend, Frontend, Design, DevOps categories
- **Dark/Light Mode** - Toggle between themes
- **Persistent Storage** - Tasks saved to localStorage
- **Kafka Event Logging** - Simulated event stream for future integration

## Tech Stack

- **HTML5** - Semantic markup
- **Tailwind CSS** - Utility-first styling via CDN
- **Vanilla JavaScript** - No framework dependencies
- **Material Symbols** - Google icon font
- **Inter Font** - Clean typography

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/kafka-kanban.git
   cd kafka-kanban
   ```

2. Open `index.html` in your browser, or use a local server:
   ```bash
   # Using Python
   python -m http.server 8080
   
   # Using Node.js
   npx serve .
   ```

3. Visit `http://localhost:8080`

## Project Structure

```
kafka-kanban/
├── index.html      # Main HTML with Tailwind config
├── app.js          # Application logic
├── docker-compose.yml  # Kafka broker setup (optional)
└── README.md
```

## Usage

- **Add Card** - Click "Add Card" button in any column
- **Edit Card** - Click on any card to open the side panel
- **Move Card** - Drag and drop between columns
- **Reorder** - Drag cards within the same column
- **Delete Card** - Open card panel and click delete icon
- **Toggle Theme** - Click theme button in sidebar

## Future Roadmap

- [ ] Kafka producer/consumer integration
- [ ] Real-time sync across clients
- [ ] User authentication
- [ ] Board/project management
- [ ] Task comments and attachments

## License

MIT License - Feel free to use and modify.
