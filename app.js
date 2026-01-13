/**
 * Kafka Kanban Board - Frontend Application
 * Superthread-style task management with inline creation and slide-out panel
 */

// ===== State Management =====
const STORAGE_KEY = 'kafka-kanban-tasks';

let tasks = [];
let currentEditingTask = null;
let activeInlineForm = null;

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
    panelEventLog: document.getElementById('panelEventLog'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    cancelPanelBtn: document.getElementById('cancelPanelBtn'),
    savePanelBtn: document.getElementById('savePanelBtn'),
    deleteTaskBtn: document.getElementById('deleteTaskBtn'),
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
    headerCounts: {
        todo: document.getElementById('headerTodoCount'),
        inprogress: document.getElementById('headerProgressCount'),
        done: document.getElementById('headerDoneCount')
    }
};

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
function loadTasks() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        tasks = stored ? JSON.parse(stored) : getDefaultTasks();
    } catch (e) {
        console.error('Error loading tasks:', e);
        tasks = getDefaultTasks();
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
function renderBoard() {
    // Clear all lists
    Object.values(elements.lists).forEach(list => {
        list.innerHTML = '';
    });

    // Group tasks by status
    const grouped = {
        todo: tasks.filter(t => t.status === 'todo'),
        inprogress: tasks.filter(t => t.status === 'inprogress'),
        done: tasks.filter(t => t.status === 'done')
    };

    // Render tasks in each column
    Object.entries(grouped).forEach(([status, statusTasks]) => {
        const list = elements.lists[status];

        if (statusTasks.length === 0) {
            list.innerHTML = renderEmptyState();
        } else {
            statusTasks.forEach(task => {
                list.appendChild(createTaskCard(task));
            });
        }

        // Update counts
        elements.counts[status].textContent = statusTasks.length;
        if (elements.headerCounts[status]) {
            elements.headerCounts[status].textContent = statusTasks.length;
        }
    });
}

function renderEmptyState() {
    return `
        <div class="flex flex-col items-center justify-center py-8 text-[#8a98a8]">
            <span class="material-symbols-outlined text-3xl mb-2 opacity-50">inbox</span>
            <p class="text-sm">No tasks yet</p>
        </div>
    `;
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

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <span class="text-[10px] font-medium text-[#8a98a8] ${isDone ? 'line-through' : ''}">${task.id}</span>
            ${task.dueDate ? `<span class="text-[10px] font-medium text-[#5c6b7f] dark:text-gray-400">${formatDate(task.dueDate)}</span>` : ''}
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
function showInlineAddForm(status) {
    // Hide any existing form
    hideInlineAddForm();

    const column = document.querySelector(`.column[data-status="${status}"]`);
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

    activeInlineForm = { status, formContainer, addBtn };

    // Focus input
    setTimeout(() => input.focus(), 50);

    // Event handlers
    cancelBtn.addEventListener('click', hideInlineAddForm);

    createBtn.addEventListener('click', () => {
        const title = input.value.trim();
        if (title) {
            addTask(title, '', prioritySelect.value, status, labelSelect.value);
            hideInlineAddForm();
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            addTask(input.value.trim(), '', prioritySelect.value, status, labelSelect.value);
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
    elements.panelDueDate.value = task.dueDate || '';

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
        dueDate: elements.panelDueDate.value
    };

    if (!updates.title) {
        elements.panelTitle.focus();
        return;
    }

    updateTask(currentEditingTask.id, updates);
    closeTaskPanel();
}

function renderEventLog(task) {
    if (!task.events || task.events.length === 0) {
        elements.panelEventLog.innerHTML = `
            <div class="px-4 py-3 text-center text-gray-400 text-xs">No Kafka events recorded for this task</div>
        `;
        return;
    }

    elements.panelEventLog.innerHTML = task.events.slice(-5).map(event => `
        <div class="group px-4 py-3 border-b border-[#e5e7eb] dark:border-[#1e2936] hover:bg-white dark:hover:bg-[#151e29] transition-colors flex gap-4 cursor-default">
            <span class="text-[#94a3b8] shrink-0 select-none w-20">${event.time}</span>
            <div class="flex-1 overflow-hidden">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-blue-600 dark:text-blue-400 font-bold">${event.type}</span>
                </div>
                <span class="text-[#334155] dark:text-gray-400 block truncate">${event.data}</span>
            </div>
        </div>
    `).join('');
}

// ===== Task CRUD Operations =====
function addTask(title, description, priority, status, label) {
    const task = new Task(title, description, priority, status, label);

    // Add Kafka event
    task.events.push({
        time: new Date().toLocaleTimeString(),
        type: 'TASK_CREATED',
        data: `topic: "task-events", key: "${task.id}"`
    });

    tasks.push(task);
    saveTasks();
    renderBoard();
    showKafkaEvent('Task created: ' + task.id);

    console.log('Kafka Event → task-created:', task);
}

function updateTask(id, updates) {
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
        const oldStatus = tasks[index].status;

        tasks[index] = {
            ...tasks[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Add Kafka event
        if (!tasks[index].events) tasks[index].events = [];

        if (oldStatus !== updates.status) {
            tasks[index].events.push({
                time: new Date().toLocaleTimeString(),
                type: 'TASK_MOVED',
                data: `from: "${statusLabels[oldStatus]}", to: "${statusLabels[updates.status]}"`
            });
        } else {
            tasks[index].events.push({
                time: new Date().toLocaleTimeString(),
                type: 'TASK_UPDATED',
                data: `fields: title, description, priority, label`
            });
        }

        saveTasks();
        renderBoard();
        showKafkaEvent('Task updated: ' + id);

        console.log('Kafka Event → task-updated:', tasks[index]);
    }
}

function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task && confirm(`Delete task "${task.title}"?`)) {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderBoard();
        closeTaskPanel();
        showKafkaEvent('Task deleted: ' + id);

        console.log('Kafka Event → task-deleted:', id);
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
        task.events.push({
            time: new Date().toLocaleTimeString(),
            type: 'TASK_MOVED',
            data: `from: "${statusLabels[oldStatus]}", to: "${statusLabels[newStatus]}"`
        });

        saveTasks();
        renderBoard();
        showKafkaEvent(`Task moved: ${taskId} (${statusLabels[oldStatus]} → ${statusLabels[newStatus]})`);

        console.log('Kafka Event → task-moved:', { taskId, from: oldStatus, to: newStatus });
    }
}

// ===== Kafka Status Display =====
function showKafkaEvent(message) {
    elements.kafkaStatus.textContent = message;
    setTimeout(() => {
        elements.kafkaStatus.textContent = 'Kafka Stream Active — Syncing events...';
    }, 2000);
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
    const newStatus = column.dataset.status;
    const taskList = column.querySelector('.task-list');

    if (!taskId || !newStatus || !taskList) return;

    // Find drop position
    const afterElement = getDragAfterElement(taskList, e.clientY);

    // Get the task being moved
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    const oldStatus = task.status;

    // Remove task from array
    tasks.splice(taskIndex, 1);

    // Update status
    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    // Find insertion position
    if (afterElement) {
        const afterTaskId = afterElement.dataset.taskId;
        const afterIndex = tasks.findIndex(t => t.id === afterTaskId);
        tasks.splice(afterIndex, 0, task);
    } else {
        // Insert at end of the status group
        const lastIndexOfStatus = tasks.reduce((last, t, i) => t.status === newStatus ? i : last, -1);
        if (lastIndexOfStatus === -1) {
            tasks.push(task);
        } else {
            tasks.splice(lastIndexOfStatus + 1, 0, task);
        }
    }

    // Add Kafka event
    if (!task.events) task.events = [];
    if (oldStatus !== newStatus) {
        task.events.push({
            time: new Date().toLocaleTimeString(),
            type: 'TASK_MOVED',
            data: `from: "${statusLabels[oldStatus]}", to: "${statusLabels[newStatus]}"`
        });
        showKafkaEvent(`Task moved: ${taskId} (${statusLabels[oldStatus]} → ${statusLabels[newStatus]})`);
    } else {
        task.events.push({
            time: new Date().toLocaleTimeString(),
            type: 'TASK_REORDERED',
            data: `column: "${statusLabels[newStatus]}"`
        });
        showKafkaEvent(`Task reordered: ${taskId}`);
    }

    saveTasks();
    renderBoard();

    console.log('Kafka Event → task-reordered:', { taskId, status: newStatus });
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
    // Add card buttons in columns
    document.querySelectorAll('.add-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showInlineAddForm(btn.dataset.status);
        });
    });

    // Panel close buttons
    elements.closePanelBtn.addEventListener('click', closeTaskPanel);
    elements.cancelPanelBtn.addEventListener('click', closeTaskPanel);
    elements.panelOverlay.addEventListener('click', closeTaskPanel);

    // Panel save
    elements.savePanelBtn.addEventListener('click', saveTaskFromPanel);

    // Panel delete
    elements.deleteTaskBtn.addEventListener('click', () => {
        if (currentEditingTask) {
            deleteTask(currentEditingTask.id);
        }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.taskPanel.classList.contains('hidden')) {
                closeTaskPanel();
            } else {
                hideInlineAddForm();
            }
        }
    });

    // Drag and drop on columns
    document.querySelectorAll('.column').forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragenter', handleDragEnter);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', handleDrop);
    });

    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Click outside to hide inline form
    document.addEventListener('click', (e) => {
        if (activeInlineForm && !e.target.closest('.inline-add-form') && !e.target.closest('.add-card-btn') && !e.target.closest('#addTaskBtn')) {
            hideInlineAddForm();
        }
    });
}

// ===== Utility Functions =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// ===== Initialize Application =====
function init() {
    initTheme();
    loadTasks();
    renderBoard();
    initEventListeners();
    console.log('Kafka Kanban Board initialized');
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
