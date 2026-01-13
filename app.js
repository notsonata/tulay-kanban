/**
 * Kafka Kanban Board - Frontend Application
 * Superthread-style task management with inline creation and slide-out panel
 */

// ===== State Management =====
const STORAGE_KEY = 'kafka-kanban-tasks';
const API_URL = window.location.origin;
const WS_URL = `ws://${window.location.host}/ws`;
const getWsUrl = (boardId) => `ws://${window.location.host}/ws/${boardId}`;

let tasks = [];
let globalEvents = [];
let currentUser = null;
let activeBoardId = null;
let currentEditingTask = null;
let activeInlineForm = null;
let websocket = null;
let kafkaConnected = false;

// Authenticated Fetch Wrapper
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = '/login';
        return null;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return null;
    }
    return response;
}

// ===== DOM Elements =====
const elements = {
    board: document.getElementById('board'),
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.getElementById('themeIcon'),
    themeText: document.getElementById('themeText'),
    kafkaStatus: document.getElementById('kafkaStatus'),
    // Side Panel
    taskPanel: document.getElementById('taskPanel'),
    panelOverlay: document.getElementById('panelOverlay'),
    panelContent: document.getElementById('panelContent'),
    panelTaskId: document.getElementById('panelTaskId'),
    panelTaskStatus: document.getElementById('panelTaskStatus'),
    panelTitle: document.getElementById('panelTitle'),
    panelDescription: document.getElementById('panelDescription'),
    panelStatusSelect: document.getElementById('panelStatusSelect'),
    panelPrioritySelect: document.getElementById('panelPrioritySelect'),
    panelLabelSelect: document.getElementById('panelLabelSelect'),
    panelDueDate: document.getElementById('panelDueDate'),
    panelAssigneeSelect: document.getElementById('panelAssigneeSelect'),
    panelEventLog: document.getElementById('panelEventLog'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    cancelPanelBtn: document.getElementById('cancelPanelBtn'),
    savePanelBtn: document.getElementById('savePanelBtn'),
    deleteTaskBtn: document.getElementById('deleteTaskBtn'),
    // Views
    boardView: document.getElementById('boardView'),
    activityView: document.getElementById('activityView'),
    activityLog: document.getElementById('activityLog'),
    myTasksView: document.getElementById('myTasksView'),
    myTasksList: document.getElementById('myTasksList'),
    myTasksCount: document.getElementById('myTasksCount'),
    // Navigation
    navBoard: document.getElementById('navBoard'),
    navActivity: document.getElementById('navActivity'),
    navMyTasks: document.getElementById('navMyTasks'),
    // Lists
    lists: {
        todo: document.getElementById('todo-list'),
        inprogress: document.getElementById('inprogress-list'),
        done: document.getElementById('done-list')
    },
    counts: {
        todo: document.getElementById('todo-count'),
        inprogress: document.getElementById('inprogress-count'),
        done: document.getElementById('done-count')
    },
    toastContainer: document.getElementById('toastContainer'),
    headerStats: document.getElementById('headerStats'),
    // Delete Modal
    deleteModal: document.getElementById('deleteModal'),
    deleteTaskTitle: document.getElementById('deleteTaskTitle'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    // Board Elements
    boardList: document.getElementById('boardList'),
    createBoardBtn: document.getElementById('createBoardBtn'),
    createBoardModal: document.getElementById('createBoardModal'),
    newBoardName: document.getElementById('newBoardName'),
    cancelCreateBoardBtn: document.getElementById('cancelCreateBoardBtn'),
    confirmCreateBoardBtn: document.getElementById('confirmCreateBoardBtn'),
    // Create List Modal
    createListModal: document.getElementById('createListModal'),
    newListTitle: document.getElementById('newListTitle'),
    cancelCreateListBtn: document.getElementById('cancelCreateListBtn'),
    confirmCreateListBtn: document.getElementById('confirmCreateListBtn'),
    // Delete Board Modal
    deleteBoardModal: document.getElementById('deleteBoardModal'),
    deleteBoardName: document.getElementById('deleteBoardName'),
    deleteBoardConfirmInput: document.getElementById('deleteBoardConfirmInput'),
    cancelDeleteBoardBtn: document.getElementById('cancelDeleteBoardBtn'),
    confirmDeleteBoardBtn: document.getElementById('confirmDeleteBoardBtn'),
    // Delete List Modal
    deleteListModal: document.getElementById('deleteListModal'),
    deleteListName: document.getElementById('deleteListName'),
    deleteListConfirmInput: document.getElementById('deleteListConfirmInput'),
    cancelDeleteListBtn: document.getElementById('cancelDeleteListBtn'),
    confirmDeleteListBtn: document.getElementById('confirmDeleteListBtn')
};

let workspaceMembers = [];
let boards = [];
let columns = [];
let activeWorkspaceId = null;
let taskToDeleteId = null;

// ===== Label Colors =====
const labelColors = {
    backend: {
        bg: 'bg-blue-50 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        ring: 'ring-blue-700/10 dark:ring-blue-400/20'
    },
    frontend: {
        bg: 'bg-green-50 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-400',
        ring: 'ring-green-600/20 dark:ring-green-500/20'
    },
    design: {
        bg: 'bg-purple-50 dark:bg-purple-900/30',
        text: 'text-purple-700 dark:text-purple-400',
        ring: 'ring-purple-700/10 dark:ring-purple-400/20'
    },
    devops: {
        bg: 'bg-gray-50 dark:bg-gray-800',
        text: 'text-gray-600 dark:text-gray-400',
        ring: 'ring-gray-500/10 dark:ring-gray-400/20'
    }
};

// ===== Status Labels =====
const statusLabels = {
    todo: 'To Do',
    inprogress: 'In Progress',
    done: 'Done'
};

// ===== Task Data Model =====
class Task {
    constructor(title, description = '', priority = 'medium', status = 'todo', label = 'frontend') {
        this.id = this.generateId();
        this.title = title;
        this.description = description;
        this.priority = priority;
        this.status = status;
        this.label = label;
        this.dueDate = '';
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.events = [];
    }

    generateId() {
        return 'TASK-' + Date.now().toString(36).toUpperCase();
    }
}

// ===== Storage Functions =====
async function loadTasks() {
    if (!activeBoardId) return;
    try {
        const response = await authFetch(`${API_URL}/api/boards/${activeBoardId}/tasks`);
        if (!response) return; // authFetch handles redirect

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to load tasks:', response.status, errorText);
            showToast('Failed to load tasks', 'error');
            return;
        }

        tasks = await response.json();
        renderBoard();
    } catch (e) {
        console.error('Error loading tasks:', e);
        showToast('Error loading tasks', 'error');
    }
}

function saveTasks() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
        console.error('Error saving tasks:', e);
    }
}

function getDefaultTasks() {
    return [
        {
            id: 'TASK-001',
            title: 'Implement Kafka producer service',
            description: 'Create a producer to publish task events to Kafka topics',
            priority: 'high',
            status: 'todo',
            label: 'backend',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: []
        },
        {
            id: 'TASK-002',
            title: 'Design event schema',
            description: 'Define JSON schema for task-created, task-updated events',
            priority: 'medium',
            status: 'todo',
            label: 'design',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: []
        },
        {
            id: 'TASK-003',
            title: 'Setup Kafka consumer',
            description: 'Implement consumer to process real-time task updates',
            priority: 'high',
            status: 'todo',
            label: 'backend',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: []
        },
        {
            id: 'TASK-004',
            title: 'Refactor drag-and-drop logic',
            description: 'Improve drag-and-drop with visual feedback and animations',
            priority: 'medium',
            status: 'inprogress',
            label: 'frontend',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: []
        },
        {
            id: 'TASK-005',
            title: 'Create Kanban UI layout',
            description: 'Build the visual Kanban board with columns',
            priority: 'high',
            status: 'done',
            label: 'frontend',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: []
        },
        {
            id: 'TASK-006',
            title: 'Docker Compose setup',
            description: 'Configure Kafka broker with KRaft mode in Docker',
            priority: 'medium',
            status: 'done',
            label: 'devops',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            events: []
        }
    ];
}

// ===== Render Functions =====
// ===== Board Rendering =====
function renderBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    if (!activeBoardId || columns.length === 0) {
        boardEl.innerHTML = `
            <div class="flex flex-col items-center justify-center w-full h-full text-[#8a98a8]">
                <span class="material-symbols-outlined text-4xl mb-4 opacity-30">dashboard</span>
                <p class="text-sm">Select a board to view tasks</p>
            </div>
        `;
        return;
    }

    // Update the board title in the header
    const boardTitleEl = document.getElementById('boardTitle');
    if (boardTitleEl) {
        const activeBoard = boards.find(b => b.id === activeBoardId);
        boardTitleEl.textContent = activeBoard ? activeBoard.name : 'Board';
    }

    boardEl.innerHTML = columns.map((col, index) => `
        <div class="column flex flex-col w-80 flex-shrink-0 h-full rounded-xl transition-colors" data-column-id="${col.id}">
            <div class="column-drag-handle flex items-center justify-between mb-3 px-1" draggable="true">
                <div class="flex items-center gap-2 cursor-grab active:cursor-grabbing">
                    <span class="material-symbols-outlined text-[#8a98a8] text-[18px]">drag_indicator</span>
                    <span class="flex items-center justify-center size-5 rounded bg-${col.color || 'gray-100'} dark:bg-gray-800 text-[10px] font-bold text-gray-600 dark:text-gray-300" 
                          id="count-${col.id}">0</span>
                    <h3 class="text-sm font-semibold text-[#111418] dark:text-white editable-title" 
                        data-column-id="${col.id}" 
                        contenteditable="false">${escapeHtml(col.title)}</h3>
                </div>
                <div class="flex items-center gap-1 relative">
                    <button class="column-menu-btn text-[#8a98a8] hover:text-[#111418] dark:hover:text-white" data-column-id="${col.id}">
                        <span class="material-symbols-outlined text-[18px]">more_horiz</span>
                    </button>
                    <div class="column-menu hidden absolute right-0 top-8 bg-white dark:bg-[#151e29] rounded-lg shadow-xl border border-[#e5e7eb] dark:border-[#1e2936] py-1 w-48 z-10" data-column-id="${col.id}">
                        <button onclick="scrollToAddCard('${col.id}')" class="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#111418] dark:text-white hover:bg-[#eff1f3] dark:hover:bg-[#1e2936] transition-colors text-left">
                            <span class="material-symbols-outlined text-[18px]">add</span>
                            Add card
                        </button>
                        <div class="border-t border-[#e5e7eb] dark:border-[#1e2936] my-1"></div>
                        <button onclick="moveColumnLeft('${col.id}')" class="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#111418] dark:text-white hover:bg-[#eff1f3] dark:hover:bg-[#1e2936] transition-colors text-left" ${index === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                            <span class="material-symbols-outlined text-[18px]">arrow_back</span>
                            Move left
                        </button>
                        <button onclick="moveColumnRight('${col.id}')" class="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#111418] dark:text-white hover:bg-[#eff1f3] dark:hover:bg-[#1e2936] transition-colors text-left" ${index === columns.length - 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                            <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                            Move right
                        </button>
                        <div class="border-t border-[#e5e7eb] dark:border-[#1e2936] my-1"></div>
                        <button onclick="editColumnTitle('${col.id}')" class="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#111418] dark:text-white hover:bg-[#eff1f3] dark:hover:bg-[#1e2936] transition-colors text-left">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                            Rename list
                        </button>
                        <button onclick="deleteColumn('${col.id}')" class="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                            Delete list
                        </button>
                    </div>
                </div>
            </div>
            <!-- Cards Container -->
            <div class="task-list flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pb-4 pr-1"
                id="list-${col.id}" data-column-id="${col.id}"></div>
            <!-- Inline Add Card Form -->
            <div class="inline-add-form hidden" data-column-id="${col.id}"></div>
            <button
                class="add-card-btn flex items-center gap-2 px-2 py-2 mt-2 text-[#5c6b7f] dark:text-gray-400 hover:text-[#111418] dark:hover:text-white hover:bg-[#eff1f3] dark:hover:bg-[#1e2936] rounded-lg transition-colors text-sm font-medium"
                data-column-id="${col.id}">
                <span class="material-symbols-outlined text-[18px]">add</span>
                Add Card
            </button>
        </div>
    `).join('');

    // Add "Add List" button at the end
    const addListBtn = document.createElement('div');
    addListBtn.className = 'flex flex-col w-80 flex-shrink-0 h-full';
    addListBtn.innerHTML = `
        <button id="addListBtn" class="flex items-center gap-2 px-4 py-3 bg-[#f1f3f5] dark:bg-[#1a232e] hover:bg-[#e6e8eb] dark:hover:bg-[#253040] rounded-xl text-[#5c6b7f] dark:text-gray-400 font-medium transition-colors w-full text-left">
            <span class="material-symbols-outlined">add</span>
            Add another list
        </button>
    `;
    boardEl.appendChild(addListBtn);
    
    // Add event listener for the add list button
    document.getElementById('addListBtn').addEventListener('click', showCreateListModal);

    // Re-attach event listeners for the new DOM elements
    attachBoardEventListeners();

    // Populate tasks
    columns.forEach(col => {
        const colTasks = tasks.filter(t => t.column_id === col.id);
        const listEl = document.getElementById(`list-${col.id}`);
        const countEl = document.getElementById(`count-${col.id}`);

        if (listEl) {
            listEl.innerHTML = '';
            colTasks.forEach(task => {
                listEl.appendChild(createTaskCard(task));
            });
        }
        if (countEl) {
            countEl.textContent = colTasks.length;
        }
    });
    
    // Update header stats
    updateHeaderStats();
}

function updateHeaderStats() {
    if (!elements.headerStats) {
        console.warn('Header stats element not found');
        return;
    }
    
    if (!activeBoardId || columns.length === 0) {
        elements.headerStats.innerHTML = '';
        return;
    }
    
    console.log('Updating header stats:', columns.length, 'columns', tasks.length, 'tasks');
    
    // Generate colors dynamically for all columns
    const colorClasses = [
        'bg-amber-500',
        'bg-primary', 
        'bg-green-500',
        'bg-purple-500',
        'bg-pink-500',
        'bg-indigo-500',
        'bg-red-500',
        'bg-yellow-500'
    ];
    
    elements.headerStats.innerHTML = columns.map((col, index) => {
        const count = tasks.filter(t => t.column_id === col.id).length;
        const colorClass = colorClasses[index % colorClasses.length];
        
        return `
            <div class="flex items-center gap-1.5">
                <span class="size-2 rounded-full ${colorClass}"></span>
                <span class="text-[#5c6b7f] dark:text-gray-400">${escapeHtml(col.title)}: <span class="font-semibold text-[#111418] dark:text-white">${count}</span></span>
            </div>
        `;
    }).join('');
}

function renderEmptyState() {
    return `
        <div class="flex flex-col items-center justify-center py-8 text-[#8a98a8]">
            <span class="material-symbols-outlined text-3xl mb-2 opacity-50">inbox</span>
            <p class="text-sm">No tasks yet</p>
        </div>
    `;
}

// ===== View Switching =====
function switchView(viewName) {
    // Hide all views first
    elements.boardView.classList.add('hidden');
    elements.activityView.classList.add('hidden');
    elements.myTasksView.classList.add('hidden');

    // Reset all nav styles
    [elements.navBoard, elements.navActivity, elements.navMyTasks].forEach(nav => {
        nav.classList.remove('bg-[#eff1f3]', 'dark:bg-[#1e2936]', 'text-[#111418]', 'dark:text-white');
        nav.classList.add('hover:bg-[#eff1f3]', 'dark:hover:bg-[#1e2936]', 'text-[#5c6b7f]', 'dark:text-gray-400');
    });

    if (viewName === 'board') {
        elements.boardView.classList.remove('hidden');
        elements.navBoard.classList.add('bg-[#eff1f3]', 'dark:bg-[#1e2936]', 'text-[#111418]', 'dark:text-white');
        elements.navBoard.classList.remove('hover:bg-[#eff1f3]', 'dark:hover:bg-[#1e2936]', 'text-[#5c6b7f]', 'dark:text-gray-400');
        renderBoard();
    } else if (viewName === 'activity') {
        elements.activityView.classList.remove('hidden');
        elements.navActivity.classList.add('bg-[#eff1f3]', 'dark:bg-[#1e2936]', 'text-[#111418]', 'dark:text-white');
        elements.navActivity.classList.remove('hover:bg-[#eff1f3]', 'dark:hover:bg-[#1e2936]', 'text-[#5c6b7f]', 'dark:text-gray-400');
        loadActivities();
    } else if (viewName === 'my-tasks') {
        elements.myTasksView.classList.remove('hidden');
        elements.navMyTasks.classList.add('bg-[#eff1f3]', 'dark:bg-[#1e2936]', 'text-[#111418]', 'dark:text-white');
        elements.navMyTasks.classList.remove('hover:bg-[#eff1f3]', 'dark:hover:bg-[#1e2936]', 'text-[#5c6b7f]', 'dark:text-gray-400');
        loadMyTasks();
    }
}

async function loadActivities() {
    if (!activeBoardId) return;
    try {
        const response = await authFetch(`${API_URL}/api/boards/${activeBoardId}/activities`);
        if (!response) return;

        const activities = await response.json();

        globalEvents = activities.map(a => ({
            type: a.event_type,
            taskId: a.task_title || a.task_id,
            originalTaskId: a.task_id,
            data: a.data,
            time: new Date(a.timestamp).toLocaleTimeString(),
            timestamp: a.timestamp
        }));

        renderActivityLog();
    } catch (e) {
        console.error('Error loading activities:', e);
    }
}

function renderActivityLog() {
    if (globalEvents.length === 0) {
        elements.activityLog.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-[#8a98a8]">
                <span class="material-symbols-outlined text-4xl mb-4 opacity-30">history</span>
                <p class="text-sm">No activity recorded yet</p>
            </div>
        `;
        return;
    }

    elements.activityLog.innerHTML = globalEvents.map(event => {
        const typeColors = {
            'TASK_CREATED': 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
            'TASK_UPDATED': 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
            'TASK_MOVED': 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
            'TASK_DELETED': 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
            'TASK_REORDERED': 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
            'RECEIVED': 'text-primary bg-primary/10'
        };

        const colorClass = typeColors[event.type] || 'text-gray-600 bg-gray-50';

        return `
            <div class="flex items-start gap-4 p-4 bg-white dark:bg-[#151e29] rounded-xl border border-[#e5e7eb] dark:border-[#1e2936] shadow-sm hover:border-primary/30 transition-colors">
                <div class="p-2 rounded-lg ${colorClass} shrink-0">
                    <span class="material-symbols-outlined text-[20px]">${event.type === 'TASK_DELETED' ? 'delete' : event.type === 'TASK_CREATED' ? 'add_circle' : 'bolt'}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <h4 class="text-sm font-semibold text-[#111418] dark:text-white truncate">
                            ${event.taskTitle ? escapeHtml(event.taskTitle) : (event.taskId || 'System')}
                        </h4>
                        <span class="text-[10px] font-medium text-[#8a98a8] whitespace-nowrap">${event.time}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${colorClass} uppercase tracking-wider">${event.type.replace('TASK_', '')}</span>
                        <p class="text-xs text-[#5c6b7f] dark:text-gray-400 truncate">${event.type === 'TASK_CREATED' ? 'Task created' : formatEventData(event.data)}</p>
                    </div>
                </div>
                <div class="text-[10px] font-mono text-[#8a98a8] bg-[#f8fafc] dark:bg-[#0d141c] px-2 py-1 rounded border border-[#e5e7eb] dark:border-[#1e2936]">
                    ${event.taskId || 'SYS'}
                </div>
            </div>
        `;
    }).join('');
}

async function loadMyTasks() {
    try {
        const response = await authFetch(`${API_URL}/api/tasks/my`);
        if (!response) return;

        const myTasks = await response.json();
        elements.myTasksCount.textContent = `${myTasks.length} task${myTasks.length !== 1 ? 's' : ''}`;

        if (myTasks.length === 0) {
            elements.myTasksList.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 text-[#8a98a8]">
                    <span class="material-symbols-outlined text-4xl mb-4 opacity-30">check_circle</span>
                    <p class="text-sm">No tasks assigned to you</p>
                </div>
            `;
            return;
        }

        // Group by status
        const grouped = { todo: [], inprogress: [], done: [] };
        myTasks.forEach(task => {
            if (grouped[task.status]) grouped[task.status].push(task);
        });

        elements.myTasksList.innerHTML = ['todo', 'inprogress', 'done'].map(status => {
            const statusNames = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };
            const statusColors = { todo: 'bg-amber-500', inprogress: 'bg-primary', done: 'bg-green-500' };
            const statusTasks = grouped[status];
            if (statusTasks.length === 0) return '';

            return `
                <div class="mb-6">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="size-2 rounded-full ${statusColors[status]}"></span>
                        <span class="text-xs font-semibold text-[#5c6b7f] dark:text-gray-400 uppercase">${statusNames[status]} (${statusTasks.length})</span>
                    </div>
                    <div class="flex flex-col gap-2">
                    ${statusTasks.map(task => `
                        <div class="task-card-my p-4 bg-white dark:bg-[#151e29] rounded-lg border border-[#e5e7eb] dark:border-[#1e2936] hover:border-primary/50 cursor-pointer transition-all" data-task-id="${task.id}">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-[10px] font-medium text-[#8a98a8]">${task.id}</span>
                                ${task.due_date ? `<span class="text-[10px] font-medium text-[#5c6b7f]">${formatDate(task.due_date)}</span>` : ''}
                            </div>
                            <p class="text-sm font-medium text-[#111418] dark:text-gray-200">${escapeHtml(task.title)}</p>
                            ${task.description ? `<p class="text-xs text-[#5c6b7f] dark:text-gray-400 mt-1">${escapeHtml(task.description)}</p>` : ''}
                        </div>
                    `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        document.querySelectorAll('.task-card-my').forEach(card => {
            card.addEventListener('click', () => {
                const taskId = card.dataset.taskId;
                const task = myTasks.find(t => t.id === taskId);
                if (task) openTaskPanel(task);
            });
        });
    } catch (e) {
        console.error('Error loading my tasks:', e);
    }
}

async function loadColumns() {
    if (!activeBoardId) return;
    try {
        const response = await authFetch(`${API_URL}/api/boards/${activeBoardId}/columns`);
        if (!response) return;
        columns = await response.json();
    } catch (e) {
        console.error('Error loading columns:', e);
        showToast('Failed to load columns', 'error');
    }
}

function showCreateListModal() {
    elements.createListModal.classList.remove('hidden');
    elements.newListTitle.value = '';
    elements.newListTitle.focus();
}

function hideCreateListModal() {
    elements.createListModal.classList.add('hidden');
    elements.newListTitle.value = '';
}

async function createColumn() {
    const title = elements.newListTitle.value.trim();
    if (!title) return;

    hideCreateListModal();

    try {
        const response = await authFetch(`${API_URL}/api/boards/${activeBoardId}/columns`, {
            method: 'POST',
            body: JSON.stringify({
                title,
                position: columns.length,
                color: 'blue-100' // Default color for now
            })
        });

        if (!response) return;
        await loadColumns();
        renderBoard();
        showToast('List created', 'success');
    } catch (e) {
        console.error('Error creating column:', e);
        showToast('Failed to create list', 'error');
    }
}

async function deleteColumn(columnId) {
    // Close any open menus
    closeAllColumnMenus();
    
    // Show the delete list modal
    showDeleteListModal(columnId);
}

function showDeleteListModal(columnId) {
    const column = columns.find(c => c.id === columnId);
    if (!column) return;
    
    const modal = document.getElementById('deleteListModal');
    const listNameEl = document.getElementById('deleteListName');
    const confirmInput = document.getElementById('deleteListConfirmInput');
    const confirmBtn = document.getElementById('confirmDeleteListBtn');
    
    listNameEl.textContent = column.title;
    confirmInput.value = '';
    confirmBtn.disabled = true;
    modal.classList.remove('hidden');
    
    // Enable confirm button when input matches list name
    const inputHandler = () => {
        confirmBtn.disabled = confirmInput.value !== column.title;
    };
    
    confirmInput.addEventListener('input', inputHandler);
    
    // Store columnId for confirmation
    confirmBtn.onclick = async () => {
        await confirmDeleteList(columnId);
        hideDeleteListModal();
    };
    
    // Focus input
    setTimeout(() => confirmInput.focus(), 100);
}

function hideDeleteListModal() {
    const modal = document.getElementById('deleteListModal');
    const confirmInput = document.getElementById('deleteListConfirmInput');
    const confirmBtn = document.getElementById('confirmDeleteListBtn');
    
    modal.classList.add('hidden');
    confirmInput.value = '';
    confirmBtn.disabled = true;
    confirmBtn.onclick = null;
}

async function confirmDeleteList(columnId) {
    try {
        const response = await authFetch(`${API_URL}/api/columns/${columnId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadColumns();
            renderBoard();
            showToast('List deleted', 'success');
        } else {
            const data = await response.json();
            showToast(data.detail || 'Failed to delete list', 'error');
        }
    } catch (e) {
        console.error('Error deleting column:', e);
        showToast('Make sure list is empty before deleting', 'error');
    }
}

function editColumnTitle(columnId) {
    closeAllColumnMenus();
    
    const titleEl = document.querySelector(`.editable-title[data-column-id="${columnId}"]`);
    if (!titleEl) return;
    
    const originalTitle = titleEl.textContent;
    titleEl.contentEditable = true;
    titleEl.focus();
    
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    
    const finishEdit = async () => {
        titleEl.contentEditable = false;
        const newTitle = titleEl.textContent.trim();
        
        if (!newTitle || newTitle === originalTitle) {
            titleEl.textContent = originalTitle;
            return;
        }
        
        try {
            const response = await authFetch(`${API_URL}/api/columns/${columnId}`, {
                method: 'PUT',
                body: JSON.stringify({ title: newTitle })
            });
            
            if (response.ok) {
                await loadColumns();
                showToast('List renamed', 'success');
            } else {
                titleEl.textContent = originalTitle;
                showToast('Failed to rename list', 'error');
            }
        } catch (e) {
            console.error('Error renaming column:', e);
            titleEl.textContent = originalTitle;
            showToast('Failed to rename list', 'error');
        }
    };
    
    titleEl.addEventListener('blur', finishEdit, { once: true });
    titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleEl.blur();
        } else if (e.key === 'Escape') {
            titleEl.textContent = originalTitle;
            titleEl.blur();
        }
    }, { once: true });
}

function scrollToAddCard(columnId) {
    closeAllColumnMenus();
    const column = document.querySelector(`.column[data-column-id="${columnId}"]`);
    if (!column) return;
    
    const addBtn = column.querySelector('.add-card-btn');
    if (addBtn) {
        addBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => {
            addBtn.click();
        }, 300);
    }
}

function closeAllColumnMenus() {
    document.querySelectorAll('.column-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
}

async function moveColumnLeft(columnId) {
    closeAllColumnMenus();
    const index = columns.findIndex(c => c.id === columnId);
    if (index <= 0) return;
    
    // Swap positions
    const temp = columns[index - 1];
    columns[index - 1] = columns[index];
    columns[index] = temp;
    
    // Update positions in database
    await updateColumnPositions();
    renderBoard();
}

async function moveColumnRight(columnId) {
    closeAllColumnMenus();
    const index = columns.findIndex(c => c.id === columnId);
    if (index < 0 || index >= columns.length - 1) return;
    
    // Swap positions
    const temp = columns[index + 1];
    columns[index + 1] = columns[index];
    columns[index] = temp;
    
    // Update positions in database
    await updateColumnPositions();
    renderBoard();
}

async function updateColumnPositions() {
    try {
        // Update all column positions
        for (let i = 0; i < columns.length; i++) {
            await authFetch(`${API_URL}/api/columns/${columns[i].id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: i })
            });
        }
    } catch (e) {
        console.error('Error updating column positions:', e);
        showToast('Failed to update column order', 'error');
    }
}

async function moveColumnLeft(columnId) {
    closeAllColumnMenus();
    const index = columns.findIndex(c => c.id === columnId);
    if (index <= 0) return;
    
    // Swap positions
    const temp = columns[index - 1];
    columns[index - 1] = columns[index];
    columns[index] = temp;
    
    // Update positions in database
    await updateColumnPositions();
    renderBoard();
}

async function moveColumnRight(columnId) {
    closeAllColumnMenus();
    const index = columns.findIndex(c => c.id === columnId);
    if (index < 0 || index >= columns.length - 1) return;
    
    // Swap positions
    const temp = columns[index + 1];
    columns[index + 1] = columns[index];
    columns[index] = temp;
    
    // Update positions in database
    await updateColumnPositions();
    renderBoard();
}

async function updateColumnPositions() {
    try {
        // Update all column positions
        for (let i = 0; i < columns.length; i++) {
            await authFetch(`${API_URL}/api/columns/${columns[i].id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: i })
            });
        }
    } catch (e) {
        console.error('Error updating column positions:', e);
        showToast('Failed to update column order', 'error');
    }
}

// ===== Board Management =====
async function loadBoards() {
    if (!activeWorkspaceId) return;
    try {
        const response = await authFetch(`${API_URL}/api/workspaces/${activeWorkspaceId}/boards`);
        if (!response) return;
        boards = await response.json();
        // If no active board, select the first one
        if (!activeBoardId && boards.length > 0) {
            activeBoardId = boards[0].id;
        }
        renderBoardList();
    } catch (e) {
        console.error('Error loading boards:', e);
        showToast('Failed to load boards', 'error');
    }
}

function renderBoardList() {
    elements.boardList.innerHTML = boards.map(board => {
        const isActive = board.id === activeBoardId;
        return `
            <div class="flex items-center gap-1 group/board">
                <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg flex-1 ${isActive ? 'bg-[#eff1f3] dark:bg-[#1e2936] text-[#111418] dark:text-white' : 'text-[#5c6b7f] dark:text-gray-400 hover:bg-[#eff1f3] dark:hover:bg-[#1e2936] hover:text-[#111418] dark:hover:text-white'} transition-colors group"
                    onclick="switchBoard('${board.id}'); return false;">
                    <span class="material-symbols-outlined text-[18px] group-hover:text-primary transition-colors ${isActive ? 'text-primary' : ''}">dashboard</span>
                    <span class="text-sm font-medium truncate">${escapeHtml(board.name)}</span>
                </a>
                <button onclick="showDeleteBoardModal('${board.id}', '${escapeHtml(board.name)}'); event.stopPropagation(); return false;" 
                    class="opacity-0 group-hover/board:opacity-100 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-[#8a98a8] hover:text-red-600 dark:hover:text-red-400 transition-all" 
                    title="Delete board">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </div>
        `;
    }).join('');
}

async function createBoard(name) {
    if (!activeWorkspaceId) return;
    try {
        const response = await authFetch(`${API_URL}/api/boards`, {
            method: 'POST',
            body: JSON.stringify({ name, workspace_id: activeWorkspaceId })
        });

        if (!response) return;
        const newBoard = await response.json();
        await loadBoards();
        switchBoard(newBoard.id);
        showToast('Board created successfully', 'success');
        hideCreateBoardModal();
    } catch (e) {
        console.error('Error creating board:', e);
        showToast('Failed to create board', 'error');
    }
}

let boardToDeleteId = null;

async function deleteBoard(boardId) {
    try {
        const response = await authFetch(`${API_URL}/api/boards/${boardId}`, {
            method: 'DELETE'
        });

        if (!response || !response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to delete board');
        }

        // Remove board from local array
        boards = boards.filter(b => b.id !== boardId);

        // If we deleted the active board, switch to another board
        if (activeBoardId === boardId) {
            if (boards.length > 0) {
                switchBoard(boards[0].id);
            } else {
                activeBoardId = null;
                tasks = [];
                columns = [];
                renderBoard();
            }
        }

        renderBoardList();
        showToast('Board deleted successfully', 'success');
        hideDeleteBoardModal();
    } catch (e) {
        console.error('Error deleting board:', e);
        showToast(e.message || 'Failed to delete board', 'error');
    }
}

function showDeleteBoardModal(boardId, boardName) {
    boardToDeleteId = boardId;
    elements.deleteBoardName.textContent = boardName;
    elements.deleteBoardConfirmInput.value = '';
    elements.confirmDeleteBoardBtn.disabled = true;
    elements.deleteBoardModal.classList.remove('hidden');
    
    // Store board name for validation
    elements.deleteBoardConfirmInput.dataset.boardName = boardName;
    
    // Focus input
    setTimeout(() => elements.deleteBoardConfirmInput.focus(), 100);
}

function hideDeleteBoardModal() {
    elements.deleteBoardModal.classList.add('hidden');
    elements.deleteBoardConfirmInput.value = '';
    elements.confirmDeleteBoardBtn.disabled = true;
    boardToDeleteId = null;
}

function switchBoard(boardId) {
    if (activeBoardId === boardId) return;
    activeBoardId = boardId;
    renderBoardList();
    loadColumns().then(loadTasks);
    loadActivities();

    // Switch to board view if not already there
    switchView('board');
}

// ===== Create Board Modal =====
function showCreateBoardModal() {
    elements.newBoardName.value = '';
    elements.createBoardModal.classList.remove('hidden');
    setTimeout(() => elements.newBoardName.focus(), 50);
}

function hideCreateBoardModal() {
    elements.createBoardModal.classList.add('hidden');
}

async function loadWorkspaceMembers() {
    if (!activeWorkspaceId) return;
    try {
        const response = await authFetch(`${API_URL}/api/workspaces/${activeWorkspaceId}/members`);
        if (!response) return;
        workspaceMembers = await response.json();
    } catch (e) {
        console.error('Error loading workspace members:', e);
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    const isDone = task.status === 'done';
    const labelStyle = labelColors[task.label] || labelColors.frontend;

    card.className = `task-card group flex flex-col gap-2 p-3 bg-white dark:bg-[#151e29] rounded-lg border border-[#e5e7eb] dark:border-[#1e2936] hover:border-primary/50 dark:hover:border-primary/50 shadow-sm cursor-pointer transition-all ${isDone ? 'opacity-60 hover:opacity-100' : ''}`;
    card.id = task.id;
    card.draggable = true;
    card.dataset.taskId = task.id;

    const priorityColors = {
        low: 'text-green-600 dark:text-green-400',
        medium: 'text-orange-600 dark:text-orange-400',
        high: 'text-red-600 dark:text-red-400'
    };

    const dueDate = task.dueDate || task.due_date;

    card.innerHTML = `
        <div class="flex justify-end items-start">
            ${dueDate ? `<span class="text-[10px] font-medium text-[#5c6b7f] dark:text-gray-400">${formatDate(dueDate)}</span>` : ''}
        </div>
        <span class="text-sm font-medium text-[#111418] dark:text-gray-200 leading-snug ${isDone ? 'line-through decoration-gray-400' : ''}">${escapeHtml(task.title)}</span>
        ${task.description ? `<p class="text-xs text-[#5c6b7f] dark:text-gray-400 line-clamp-2">${escapeHtml(task.description)}</p>` : ''}
        <div class="mt-1 flex items-center justify-between">
            <span class="inline-flex items-center rounded-md ${labelStyle.bg} px-1.5 py-0.5 text-xs font-medium ${labelStyle.text} ring-1 ring-inset ${labelStyle.ring} capitalize">${task.label}</span>
            <div class="flex items-center gap-1.5 ${priorityColors[task.priority]}">
                <span class="material-symbols-outlined text-[14px] icon-filled">flag</span>
                <span class="text-[10px] font-medium capitalize">${task.priority}</span>
            </div>
        </div>
    `;

    // Click to open side panel
    card.addEventListener('click', (e) => {
        if (!card.classList.contains('dragging')) {
            openTaskPanel(task);
        }
    });

    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    return card;
}

// ===== Inline Add Card =====
function showInlineAddForm(columnId) {
    // Hide any existing form
    hideInlineAddForm();

    const column = document.querySelector(`.column[data-column-id="${columnId}"]`);
    if (!column) return;
    const formContainer = column.querySelector('.inline-add-form');
    const addBtn = column.querySelector('.add-card-btn');

    formContainer.innerHTML = `
        <div class="flex flex-col gap-3 p-3 bg-white dark:bg-[#151e29] rounded-lg border border-primary ring-4 ring-primary/20 shadow-xl mb-3">
            <input type="text" class="inline-title-input w-full text-sm font-medium text-[#111418] dark:text-white bg-transparent border-none p-0 focus:ring-0 placeholder-gray-400" placeholder="What needs to be done?" autofocus>
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <select class="inline-priority-select text-xs bg-gray-100 dark:bg-gray-800 border-none rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:ring-0">
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                    </select>
                    <select class="inline-label-select text-xs bg-gray-100 dark:bg-gray-800 border-none rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:ring-0">
                        <option value="backend">Backend</option>
                        <option value="frontend" selected>Frontend</option>
                        <option value="design">Design</option>
                        <option value="devops">DevOps</option>
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <button class="inline-cancel-btn text-xs font-medium text-gray-500 hover:text-[#111418] dark:text-gray-400 dark:hover:text-white px-2 py-1 transition-colors">Cancel</button>
                    <button class="inline-create-btn bg-primary hover:bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded shadow-sm transition-colors">Create</button>
                </div>
            </div>
        </div>
    `;

    formContainer.classList.remove('hidden');
    addBtn.classList.add('hidden');

    const input = formContainer.querySelector('.inline-title-input');
    const cancelBtn = formContainer.querySelector('.inline-cancel-btn');
    const createBtn = formContainer.querySelector('.inline-create-btn');
    const prioritySelect = formContainer.querySelector('.inline-priority-select');
    const labelSelect = formContainer.querySelector('.inline-label-select');

    activeInlineForm = { columnId, formContainer, addBtn };

    // Focus input
    setTimeout(() => input.focus(), 50);

    // Event handlers
    cancelBtn.addEventListener('click', hideInlineAddForm);

    createBtn.addEventListener('click', () => {
        const title = input.value.trim();
        if (title) {
            addTaskToColumn(title, '', prioritySelect.value, columnId, labelSelect.value);
            hideInlineAddForm();
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            addTaskToColumn(input.value.trim(), '', prioritySelect.value, columnId, labelSelect.value);
            hideInlineAddForm();
        } else if (e.key === 'Escape') {
            hideInlineAddForm();
        }
    });
}

function hideInlineAddForm() {
    if (activeInlineForm) {
        activeInlineForm.formContainer.classList.add('hidden');
        activeInlineForm.formContainer.innerHTML = '';
        activeInlineForm.addBtn.classList.remove('hidden');
        activeInlineForm = null;
    }
}

// ===== Side Panel Functions =====
function openTaskPanel(task) {
    currentEditingTask = task;

    // Populate panel
    elements.panelTaskId.textContent = task.id;
    elements.panelTaskStatus.textContent = statusLabels[task.status];
    elements.panelTitle.value = task.title;
    elements.panelDescription.value = task.description || '';
    elements.panelStatusSelect.value = task.status;
    elements.panelPrioritySelect.value = task.priority;
    elements.panelLabelSelect.value = task.label;
    elements.panelDueDate.value = task.dueDate || task.due_date || '';

    // Populate assignee dropdown
    elements.panelAssigneeSelect.innerHTML = '<option value="">Unassigned</option>';
    workspaceMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.full_name || member.email;
        elements.panelAssigneeSelect.appendChild(option);
    });
    elements.panelAssigneeSelect.value = task.assignee_id || '';

    // Render event log
    renderEventLog(task);

    // Show panel
    elements.taskPanel.classList.remove('hidden');
    setTimeout(() => {
        elements.panelContent.classList.remove('translate-x-full');
    }, 10);
}

function closeTaskPanel() {
    elements.panelContent.classList.add('translate-x-full');
    setTimeout(() => {
        elements.taskPanel.classList.add('hidden');
        currentEditingTask = null;
    }, 150);
}

function saveTaskFromPanel() {
    if (!currentEditingTask) return;

    const updates = {
        title: elements.panelTitle.value.trim(),
        description: elements.panelDescription.value.trim(),
        status: elements.panelStatusSelect.value,
        priority: elements.panelPrioritySelect.value,
        label: elements.panelLabelSelect.value,
        dueDate: elements.panelDueDate.value,
        assignee_id: elements.panelAssigneeSelect.value || null
    };

    if (!updates.title) {
        elements.panelTitle.focus();
        return;
    }

    updateTask(currentEditingTask.id, updates);
    closeTaskPanel();
}

// Filter events for this task from globalEvents
function renderEventLog(task) {
    const taskEvents = globalEvents.filter(e => e.originalTaskId === task.id || e.taskId === task.id);

    if (taskEvents.length === 0) {
        elements.panelEventLog.innerHTML = `
            <div class="px-4 py-3 text-center text-gray-400 text-xs">No Kafka events recorded for this task</div>
        `;
        return;
    }

    elements.panelEventLog.innerHTML = taskEvents.slice(0, 5).map(event => `
        <div class="group px-4 py-3 border-b border-[#e5e7eb] dark:border-[#1e2936] hover:bg-white dark:hover:bg-[#151e29] transition-colors flex gap-4 cursor-default">
            <span class="text-[#94a3b8] shrink-0 select-none w-20">${event.time}</span>
            <div class="flex-1 overflow-hidden">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-blue-600 dark:text-blue-400 font-bold">${escapeHtml(event.type)}</span>
                </div>
                <span class="text-[#334155] dark:text-gray-400 block truncate">
                    ${event.type === 'TASK_CREATED' ? 'Task created' : formatEventData(event.data)}
                </span>
            </div>
        </div>
    `).join('');
}

// ===== Task CRUD Operations =====
async function addTask(title, description, priority, status, label) {
    if (!activeBoardId) return;

    const taskData = {
        title,
        description,
        priority,
        status,
        label,
        board_id: activeBoardId
    };

    try {
        const response = await authFetch(`${API_URL}/api/tasks`, {
            method: 'POST',
            body: JSON.stringify(taskData)
        });

        if (!response) return; // authFetch handles redirect

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to create task:', response.status, errorText);
            showToast('Failed to create task', 'error');
            return;
        }

        const newTask = await response.json();
        tasks.push(newTask);
        renderBoard();
        showKafkaEvent('Task created: ' + newTask.id, 'success');

        // Notification is handled by WebSocket now, but for immediate UI feedback:
        if (!elements.activityView.classList.contains('hidden')) renderActivityLog();
    } catch (e) {
        console.error('Error adding task:', e);
        showToast('Failed to create task', 'error');
    }
}

async function addTaskToColumn(title, description, priority, columnId, label) {
    if (!activeBoardId) return;

    const taskData = {
        title,
        description,
        priority,
        label,
        board_id: activeBoardId,
        column_id: columnId
    };

    try {
        const response = await authFetch(`${API_URL}/api/tasks`, {
            method: 'POST',
            body: JSON.stringify(taskData)
        });

        if (!response) return; // authFetch handles redirect

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to create task:', response.status, errorText);
            showToast('Failed to create task', 'error');
            return;
        }

        const newTask = await response.json();
        tasks.push(newTask);
        renderBoard();
        showKafkaEvent('Task created: ' + newTask.id, 'success');

        // Notification is handled by WebSocket now, but for immediate UI feedback:
        if (!elements.activityView.classList.contains('hidden')) renderActivityLog();
    } catch (e) {
        console.error('Error adding task:', e);
        showToast('Failed to create task', 'error');
    }
}

async function updateTask(id, updates) {
    try {
        const response = await authFetch(`${API_URL}/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        if (!response.ok) throw new Error('Failed to update task');

        const updatedTask = await response.json();

        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            tasks[index] = updatedTask;
        }

        renderBoard();
        if (!elements.activityView.classList.contains('hidden')) renderActivityLog();
        showKafkaEvent('Task updated: ' + id, 'success');
    } catch (e) {
        console.error('Error updating task:', e);
        showToast('Failed to update task', 'error');
    }
}

// ===== Delete Confirmation =====
function showDeleteModal(task) {
    taskToDeleteId = task.id;
    elements.deleteTaskTitle.textContent = task.title;
    elements.deleteModal.classList.remove('hidden');
}

function hideDeleteModal() {
    elements.deleteModal.classList.add('hidden');
    taskToDeleteId = null;
}

async function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // No confirm() call here - modal handles it

    try {
        const response = await authFetch(`${API_URL}/api/tasks/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete task');

        tasks = tasks.filter(t => t.id !== id);
        renderBoard();
        if (!elements.activityView.classList.contains('hidden')) renderActivityLog();
        closeTaskPanel();
        showKafkaEvent('Task deleted: ' + id, 'success');
    } catch (e) {
        console.error('Error deleting task:', e);
        showToast('Failed to delete task', 'error');
    }
}

function moveTask(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
        const oldStatus = task.status;
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();

        // Add Kafka event
        if (!task.events) task.events = [];
        const event = {
            time: new Date().toLocaleTimeString(),
            type: 'TASK_MOVED',
            data: `from: "${statusLabels[oldStatus]}", to: "${statusLabels[newStatus]}"`,
            timestamp: new Date().toISOString()
        };
        task.events.push(event);
        globalEvents.unshift({
            ...event,
            taskId: taskId,
            taskTitle: task.title
        });

        saveTasks();
        renderBoard();
        if (!elements.activityView.classList.contains('hidden')) renderActivityLog();
        showKafkaEvent(`Task moved: ${taskId} (${statusLabels[oldStatus]} → ${statusLabels[newStatus]})`);
        sendKafkaEvent('TASK_MOVED', taskId, { from: oldStatus, to: newStatus });

        console.log('Kafka Event → task-moved:', { taskId, from: oldStatus, to: newStatus });
    }
}

// ===== Kafka API Integration =====
async function sendKafkaEvent(eventType, taskId, data = {}) {
    const event = {
        type: eventType,
        taskId: taskId,
        data: data,
        timestamp: new Date().toISOString()
    };

    try {
        const response = await fetch(`${API_URL}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
        const result = await response.json();
        console.log('Kafka API response:', result);

        if (result.status === 'sent') {
            kafkaConnected = true;
            updateKafkaStatusUI();
        }
    } catch (error) {
        console.error('Failed to send Kafka event:', error);
        kafkaConnected = false;
        updateKafkaStatusUI();
    }
}

// ===== WebSocket Connection =====
function connectWebSocket() {
    if (!activeBoardId) return;

    try {
        const wsUrl = getWsUrl(activeBoardId);
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
            console.log('WebSocket connected to board:', activeBoardId);
            kafkaConnected = true;
            updateKafkaStatusUI();
        };

        websocket.onmessage = (event) => {
            console.log('WebSocket message:', event.data);
            try {
                const kafkaEvent = JSON.parse(event.data);
                handleIncomingKafkaEvent(kafkaEvent);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        websocket.onclose = () => {
            console.log('WebSocket disconnected, reconnecting in 3s...');
            kafkaConnected = false;
            updateKafkaStatusUI();
            setTimeout(connectWebSocket, 3000);
        };

        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            kafkaConnected = false;
            updateKafkaStatusUI();
        };
    } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setTimeout(connectWebSocket, 3000);
    }
}

function handleIncomingKafkaEvent(kafkaEvent) {
    // Add to global events (Activity log)
    globalEvents.unshift({
        type: kafkaEvent.type,
        taskId: kafkaEvent.taskId,
        originalTaskId: kafkaEvent.taskId,
        data: kafkaEvent.data || {},
        time: new Date().toLocaleTimeString(),
        timestamp: new Date().toISOString()
    });

    if (!elements.activityView.classList.contains('hidden')) renderActivityLog();

    // Sync tasks on relevant events (non-blocking)
    if (['TASK_CREATED', 'TASK_UPDATED', 'TASK_MOVED', 'TASK_DELETED'].includes(kafkaEvent.type)) {
        loadColumns().then(loadTasks); // Fire and forget - don't block
    }
}

function updateKafkaStatusUI() {
    if (kafkaConnected) {
        elements.kafkaStatus.textContent = 'Kafka Stream Active — Connected';
        elements.kafkaStatus.classList.remove('text-red-400');
        elements.kafkaStatus.classList.add('text-green-400');
    } else {
        elements.kafkaStatus.textContent = 'Kafka Stream — Disconnected (local mode)';
        elements.kafkaStatus.classList.remove('text-green-400');
        elements.kafkaStatus.classList.add('text-red-400');
    }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const toast = document.createElement('div');

    const colors = {
        info: 'bg-[#111418] dark:bg-[#1e2936] border-[#e5e7eb] dark:border-[#2a3645] text-white',
        success: 'bg-emerald-600 border-emerald-500 text-white',
        error: 'bg-red-600 border-red-500 text-white'
    };

    const icons = {
        info: 'info',
        success: 'check_circle',
        error: 'error'
    };

    toast.className = `${colors[type]} px-4 py-3 rounded-lg shadow-lg border flex items-center gap-3 transform transition-all duration-300 translate-y-8 opacity-0 pointer-events-auto min-w-[300px] max-w-[400px]`;

    toast.innerHTML = `
        <span class="material-symbols-outlined text-[20px]">${icons[type]}</span>
        <span class="text-sm font-medium flex-1">${escapeHtml(message)}</span>
        <button class="text-white/70 hover:text-white transition-colors" onclick="this.parentElement.remove()">
            <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
    `;

    elements.toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-8', 'opacity-0');
    });

    // Auto dismiss
    setTimeout(() => {
        toast.classList.add('translate-y-8', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Kafka Status Display =====
function showKafkaEvent(message, type = 'info') {
    // Only update status text if it's a connectivity message
    if (message.includes('Connected') || message.includes('Disconnected')) {
        elements.kafkaStatus.textContent = message;
        setTimeout(() => {
            updateKafkaStatusUI();
        }, 2000);
    }

    // Show toast for event
    showToast(message, type);
}

// ===== Drag and Drop with Reordering =====
let draggedTask = null;
let draggedTaskId = null;

function handleDragStart(e) {
    draggedTask = e.target;
    draggedTaskId = e.target.dataset.taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTaskId);

    // Slight delay to allow the drag image to be created
    setTimeout(() => {
        e.target.style.opacity = '0.4';
    }, 0);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    e.target.style.opacity = '';
    draggedTask = null;
    draggedTaskId = null;

    // Remove all drag indicators
    document.querySelectorAll('.column').forEach(col => {
        col.classList.remove('drag-over');
    });
    document.querySelectorAll('.drop-indicator').forEach(indicator => {
        indicator.remove();
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const taskList = e.target.closest('.task-list');
    if (!taskList || !draggedTask) return;

    // Find the card we're hovering over
    const afterElement = getDragAfterElement(taskList, e.clientY);

    // Remove existing indicators
    document.querySelectorAll('.drop-indicator').forEach(indicator => {
        indicator.remove();
    });

    // Create drop indicator
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator h-1 bg-primary rounded-full my-1 transition-all';

    if (afterElement == null) {
        taskList.appendChild(indicator);
    } else {
        taskList.insertBefore(indicator, afterElement);
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleDragEnter(e) {
    e.preventDefault();
    const column = e.target.closest('.column');
    if (column) {
        column.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const column = e.target.closest('.column');
    const relatedColumn = e.relatedTarget?.closest('.column');

    if (column && column !== relatedColumn) {
        column.classList.remove('drag-over');
        // Remove indicators when leaving column
        column.querySelectorAll('.drop-indicator').forEach(indicator => {
            indicator.remove();
        });
    }
}

function handleDrop(e) {
    e.preventDefault();

    // Remove all indicators
    document.querySelectorAll('.drop-indicator').forEach(indicator => {
        indicator.remove();
    });

    const column = e.target.closest('.column');
    if (!column) return;

    column.classList.remove('drag-over');

    const taskId = e.dataTransfer.getData('text/plain');
    const newColumnId = column.dataset.columnId;
    const taskList = column.querySelector('.task-list');

    if (!taskId || !newColumnId || !taskList) return;

    // Find drop position
    const afterElement = getDragAfterElement(taskList, e.clientY);

    // Get the task being moved
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    const oldColumnId = task.column_id;

    // Remove task from array
    tasks.splice(taskIndex, 1);

    // Update column_id
    task.column_id = newColumnId;
    task.updatedAt = new Date().toISOString();

    // Find insertion position
    if (afterElement) {
        const afterTaskId = afterElement.dataset.taskId;
        const afterIndex = tasks.findIndex(t => t.id === afterTaskId);
        tasks.splice(afterIndex, 0, task);
    } else {
        // Insert at end of the column group
        const lastIndexOfColumn = tasks.reduce((last, t, i) => t.column_id === newColumnId ? i : last, -1);
        if (lastIndexOfColumn === -1) {
            tasks.push(task);
        } else {
            tasks.splice(lastIndexOfColumn + 1, 0, task);
        }
    }

    // Update column if changed
    if (oldColumnId !== newColumnId) {
        updateTask(taskId, { column_id: newColumnId });
    } else {
        // Just reordering in same column - for now we just re-render
        // Real reordering would need a 'position' field in the DB
        renderBoard();
        showKafkaEvent(`Task reordered: ${taskId}`);
    }

    console.log('Kafka Event → task-reordered:', { taskId, column_id: newColumnId });
}

// ===== Column Drag and Drop =====
let draggedColumn = null;

function handleColumnDragStart(e) {
    // Find the column from the dragged header
    const header = e.target.closest('.column-drag-handle');
    if (!header) {
        e.preventDefault();
        return;
    }
    
    draggedColumn = header.closest('.column');
    if (!draggedColumn) {
        e.preventDefault();
        return;
    }
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedColumn.dataset.columnId);
    
    setTimeout(() => {
        draggedColumn.style.opacity = '0.4';
    }, 0);
}

function handleColumnDragEnd(e) {
    if (draggedColumn) {
        draggedColumn.style.opacity = '';
        draggedColumn = null;
    }
    
    // Remove all column drag indicators
    document.querySelectorAll('.column').forEach(col => {
        col.classList.remove('column-drag-over-left', 'column-drag-over-right');
    });
}

function handleColumnDragOver(e) {
    if (!draggedColumn) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetColumn = e.target.closest('.column');
    if (!targetColumn || targetColumn === draggedColumn) return;
    
    // Remove all indicators
    document.querySelectorAll('.column').forEach(col => {
        col.classList.remove('column-drag-over-left', 'column-drag-over-right');
    });
    
    // Determine which side to show indicator
    const rect = targetColumn.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    
    if (e.clientX < midpoint) {
        targetColumn.classList.add('column-drag-over-left');
    } else {
        targetColumn.classList.add('column-drag-over-right');
    }
}

function handleColumnDrop(e) {
    if (!draggedColumn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const targetColumn = e.target.closest('.column');
    if (!targetColumn || targetColumn === draggedColumn) {
        handleColumnDragEnd(e);
        return;
    }
    
    const draggedId = draggedColumn.dataset.columnId;
    const targetId = targetColumn.dataset.columnId;
    
    const draggedIndex = columns.findIndex(c => c.id === draggedId);
    const targetIndex = columns.findIndex(c => c.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
        handleColumnDragEnd(e);
        return;
    }
    
    // Determine drop position
    const rect = targetColumn.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const dropBefore = e.clientX < midpoint;
    
    // Remove dragged column from array
    const [movedColumn] = columns.splice(draggedIndex, 1);
    
    // Calculate new index
    let newIndex = targetIndex;
    if (draggedIndex < targetIndex) {
        newIndex = dropBefore ? targetIndex - 1 : targetIndex;
    } else {
        newIndex = dropBefore ? targetIndex : targetIndex + 1;
    }
    
    // Insert at new position
    columns.splice(newIndex, 0, movedColumn);
    
    // Update positions in database and re-render
    updateColumnPositions().then(() => {
        renderBoard();
        showToast('Column moved', 'success');
    });
    
    handleColumnDragEnd(e);
}

// ===== Theme Toggle =====
function initTheme() {
    const savedTheme = localStorage.getItem('kafka-kanban-theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        updateThemeUI(true);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('kafka-kanban-theme', isDark ? 'dark' : 'light');
    updateThemeUI(isDark);
}

function updateThemeUI(isDark) {
    elements.themeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
    elements.themeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

// ===== Event Listeners =====
function initEventListeners() {
    // Panel close buttons
    elements.closePanelBtn.addEventListener('click', closeTaskPanel);
    elements.cancelPanelBtn.addEventListener('click', closeTaskPanel);
    elements.panelOverlay.addEventListener('click', closeTaskPanel);

    // Panel save
    elements.savePanelBtn.addEventListener('click', saveTaskFromPanel);

    // Panel delete
    elements.deleteTaskBtn.addEventListener('click', () => {
        if (currentEditingTask) {
            showDeleteModal(currentEditingTask);
        }
    });

    // Delete Modal
    elements.cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    elements.confirmDeleteBtn.addEventListener('click', async () => {
        if (taskToDeleteId) {
            await deleteTask(taskToDeleteId);
            hideDeleteModal();
            closeTaskPanel(); // Close the side panel too
        }
    });

    // Close modal on outside click
    elements.deleteModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal || e.target.classList.contains('bg-gray-900/50')) {
            hideDeleteModal();
        }
    });

    // Board Creation
    elements.createBoardBtn.addEventListener('click', showCreateBoardModal);
    elements.cancelCreateBoardBtn.addEventListener('click', hideCreateBoardModal);

    elements.confirmCreateBoardBtn.addEventListener('click', () => {
        const name = elements.newBoardName.value.trim();
        if (name) {
            createBoard(name);
        }
    });

    // List Creation
    elements.cancelCreateListBtn.addEventListener('click', hideCreateListModal);
    elements.confirmCreateListBtn.addEventListener('click', createColumn);
    
    // Allow Enter key to create list
    elements.newListTitle.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createColumn();
        }
    });

    // Board Deletion
    elements.cancelDeleteBoardBtn.addEventListener('click', hideDeleteBoardModal);
    elements.deleteBoardConfirmInput.addEventListener('input', () => {
        const boardName = elements.deleteBoardConfirmInput.dataset.boardName;
        elements.confirmDeleteBoardBtn.disabled = elements.deleteBoardConfirmInput.value !== boardName;
    });
    elements.confirmDeleteBoardBtn.addEventListener('click', async () => {
        if (boardToDeleteId) {
            await deleteBoard(boardToDeleteId);
        }
    });

    // List Deletion
    elements.cancelDeleteListBtn.addEventListener('click', hideDeleteListModal);

    // Close create board modal on outside click
    elements.createBoardModal.addEventListener('click', (e) => {
        if (e.target === elements.createBoardModal || e.target.classList.contains('bg-gray-900/50')) {
            hideCreateBoardModal();
        }
    });

    // Close create list modal on outside click
    elements.createListModal.addEventListener('click', (e) => {
        if (e.target === elements.createListModal || e.target.classList.contains('bg-gray-900/50')) {
            hideCreateListModal();
        }
    });

    // Close delete board modal on outside click
    elements.deleteBoardModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteBoardModal || e.target.classList.contains('bg-gray-900/50')) {
            hideDeleteBoardModal();
        }
    });

    // Create board on Enter key
    elements.newBoardName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const name = elements.newBoardName.value.trim();
            if (name) {
                createBoard(name);
            }
        } else if (e.key === 'Escape') {
            hideCreateBoardModal();
        }
    });



    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.taskPanel.classList.contains('hidden')) {
                closeTaskPanel();
            } else if (!elements.deleteModal.classList.contains('hidden')) {
                hideDeleteModal();
            } else if (!elements.deleteBoardModal.classList.contains('hidden')) {
                hideDeleteBoardModal();
            } else if (!elements.deleteListModal.classList.contains('hidden')) {
                hideDeleteListModal();
            } else if (!elements.createListModal.classList.contains('hidden')) {
                hideCreateListModal();
            } else if (!elements.createBoardModal.classList.contains('hidden')) {
                hideCreateBoardModal();
            } else if (!elements.createBoardModal.classList.contains('hidden')) {
                hideCreateBoardModal();
            } else {
                hideInlineAddForm();
            }
        }
    });

    // Navigation
    elements.navBoard.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('board');
    });

    elements.navActivity.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('activity');
    });

    elements.navMyTasks.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('my-tasks');
    });

    // Theme
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Global click to close inline forms and column menus
    document.addEventListener('click', (e) => {
        if (activeInlineForm && !e.target.closest('.inline-add-form') && !e.target.closest('.add-card-btn') && !e.target.closest('#addTaskBtn')) {
            hideInlineAddForm();
        }
        
        // Close column menus when clicking outside
        if (!e.target.closest('.column-menu') && !e.target.closest('.column-menu-btn')) {
            closeAllColumnMenus();
        }
    });
}

function attachBoardEventListeners() {
    // Add card buttons in columns
    document.querySelectorAll('.add-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showInlineAddForm(btn.dataset.columnId);
        });
    });

    // Column menu buttons
    document.querySelectorAll('.column-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const columnId = btn.dataset.columnId;
            const menu = document.querySelector(`.column-menu[data-column-id="${columnId}"]`);
            
            // Close other menus
            document.querySelectorAll('.column-menu').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            
            // Toggle this menu
            menu.classList.toggle('hidden');
        });
    });

    // Drag and drop on columns (for tasks)
    document.querySelectorAll('.column').forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragenter', handleDragEnter);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', handleDrop);
        
        // Column reordering drag indicators
        column.addEventListener('dragover', handleColumnDragOver);
        column.addEventListener('drop', handleColumnDrop);
    });
    
    // Column drag and drop for reordering (only from header)
    document.querySelectorAll('.column-drag-handle').forEach(handle => {
        handle.addEventListener('dragstart', handleColumnDragStart);
        handle.addEventListener('dragend', handleColumnDragEnd);
    });
}
// ===== End of Event Listeners =====

// ===== Utility Functions =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatEventData(data) {
    if (!data) return '';
    if (typeof data === 'string') return escapeHtml(data);

    // Handle specific fields to make them more readable
    const parts = [];
    if (data.title) parts.push(`Title: "${data.title}"`);
    if (data.status) parts.push(`Status: ${statusLabels[data.status] || data.status}`);
    if (data.priority) parts.push(`Priority: ${data.priority}`);
    if (data.from && data.to) parts.push(`Moved from ${statusLabels[data.from] || data.from} to ${statusLabels[data.to] || data.to}`);
    if (data.description) parts.push(`Description updated`);
    if (data.assignee_id) parts.push(`Assignee updated`);

    // Fallback if generic object
    if (parts.length === 0 && Object.keys(data).length > 0) {
        return escapeHtml(JSON.stringify(data).substring(0, 100) + (JSON.stringify(data).length > 100 ? '...' : ''));
    }

    return escapeHtml(parts.join(', '));
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// ===== Initialize Application =====
async function init() {
    initTheme();

    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    try {
        // Fetch User Info
        const userRes = await authFetch(`${API_URL}/api/auth/me`);
        if (!userRes) return;
        currentUser = await userRes.json();
        console.log('Logged in as:', currentUser.full_name);

        // Fetch Workspaces
        const wsRes = await authFetch(`${API_URL}/api/workspaces`);
        const workspaces = await wsRes.json();

        if (workspaces.length > 0) {
            activeWorkspaceId = workspaces[0].id;
        }

        await loadWorkspaceMembers();
        await loadBoards(); // Sets activeBoardId and renders list

        if (activeBoardId) {
            await loadColumns().then(loadTasks);
        }

        initEventListeners();
        connectWebSocket();
        console.log('Kafka Kanban Board initialized');
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);

