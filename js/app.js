'use strict';

/* =========================================================
   STATE
   ========================================================= */

const STORAGE_KEY = 'ledger.tasks';
const THEME_KEY   = 'ledger.theme';

let tasks = [];
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';
let deleteTargetId = null;

const CATEGORY_LABELS = {
  personal: 'Personal',
  work: 'Work',
  study: 'Study',
  shopping: 'Shopping',
  other: 'Other'
};

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

/* =========================================================
   DOM REFERENCES
   ========================================================= */

const el = {
  taskList: document.getElementById('taskList'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptyBody: document.getElementById('emptyBody'),
  emptyStateAddBtn: document.getElementById('emptyStateAddBtn'),

  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  filterRow: document.getElementById('filterRow'),

  statTotal: document.getElementById('statTotal'),
  statActive: document.getElementById('statActive'),
  statCompleted: document.getElementById('statCompleted'),
  statHigh: document.getElementById('statHigh'),
  statPercent: document.getElementById('statPercent'),
  progressRing: document.getElementById('progressRing'),

  themeToggle: document.getElementById('themeToggle'),
  themeToggleLabel: document.getElementById('themeToggleLabel'),

  openAddModalBtn: document.getElementById('openAddModalBtn'),
  taskModalOverlay: document.getElementById('taskModalOverlay'),
  taskForm: document.getElementById('taskForm'),
  modalTitle: document.getElementById('modalTitle'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  cancelModalBtn: document.getElementById('cancelModalBtn'),

  taskId: document.getElementById('taskId'),
  taskTitle: document.getElementById('taskTitle'),
  titleError: document.getElementById('titleError'),
  taskDescription: document.getElementById('taskDescription'),
  taskPriority: document.getElementById('taskPriority'),
  taskCategory: document.getElementById('taskCategory'),
  taskDueDate: document.getElementById('taskDueDate'),

  deleteModalOverlay: document.getElementById('deleteModalOverlay'),
  deleteTaskName: document.getElementById('deleteTaskName'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  toastStack: document.getElementById('toastStack'),
  todayDate: document.getElementById('todayDate')
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

/* =========================================================
   STORAGE
   ========================================================= */

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(tasks)) tasks = [];
    
    // Validate tasks and remove any with missing required fields
    tasks = tasks.filter(task => {
      return task && typeof task === 'object' && task.id && task.title;
    });
  } catch (err) {
    console.error('Failed to load tasks from localStorage:', err);
    tasks = [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save tasks to localStorage:', err);
    showToast('Could not save — storage may be full.', 'delete');
  }
}

function loadTheme() {
  let theme = 'light';
  try {
    theme = localStorage.getItem(THEME_KEY) || 'light';
  } catch (err) {
    console.error('Failed to load theme:', err);
  }
  applyTheme(theme, false);
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.error('Failed to save theme:', err);
  }
}

/* =========================================================
   ID / UTIL
   ========================================================= */

function generateId() {
  return 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const formatted = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = date < today;
  return { formatted, isOverdue };
}

/* =========================================================
   CRUD
   ========================================================= */

function createTask(data) {
  const task = {
    id: generateId(),
    title: data.title.trim(),
    description: data.description.trim(),
    priority: data.priority,
    category: data.category,
    dueDate: data.dueDate || '',
    completed: false,
    createdAt: Date.now()
  };
  tasks.unshift(task);
  saveTasks();
  renderTasks();
  updateStatistics();
  showToast('Task added', 'add');
}

function updateTask(id, data) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.title = data.title.trim();
  task.description = data.description.trim();
  task.priority = data.priority;
  task.category = data.category;
  task.dueDate = data.dueDate || '';
  saveTasks();
  renderTasks();
  updateStatistics();
  showToast('Task updated', 'update');
}

function deleteTask(id) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks.splice(idx, 1);
  saveTasks();
  renderTasks();
  updateStatistics();
  showToast('Task deleted', 'delete');
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  renderTasks();
  updateStatistics();
  showToast(task.completed ? 'Task completed' : 'Task restored', task.completed ? 'complete' : 'restore');
}

/* =========================================================
   FILTER / SEARCH / SORT
   ========================================================= */

function filterTasks(list) {
  switch (currentFilter) {
    case 'active': return list.filter(t => !t.completed);
    case 'completed': return list.filter(t => t.completed);
    case 'high': return list.filter(t => t.priority === 'high');
    case 'medium': return list.filter(t => t.priority === 'medium');
    case 'low': return list.filter(t => t.priority === 'low');
    default: return list;
  }
}

function searchTasks(list) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return list;
  return list.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description && t.description.toLowerCase().includes(q))
  );
}

function sortTasks(list) {
  const sorted = [...list];
  switch (currentSort) {
    case 'oldest':
      sorted.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case 'due':
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
      break;
    case 'priority':
      sorted.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
      break;
    case 'alpha':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default: // newest
      sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

function getVisibleTasks() {
  let list = tasks;
  list = filterTasks(list);
  list = searchTasks(list);
  list = sortTasks(list);
  return list;
}

/* =========================================================
   RENDER
   ========================================================= */

function renderTasks() {
  const visible = getVisibleTasks();
  el.taskList.innerHTML = '';

  if (visible.length === 0) {
    el.emptyState.hidden = false;
    el.taskList.hidden = true;

    if (tasks.length === 0) {
      el.emptyTitle.textContent = 'No entries yet';
      el.emptyBody.textContent = 'Create your first task to get started.';
      el.emptyStateAddBtn.hidden = false;
    } else {
      el.emptyTitle.textContent = 'No matching tasks found';
      el.emptyBody.textContent = 'Try a different search term or filter.';
      el.emptyStateAddBtn.hidden = true;
    }
    return;
  }

  el.emptyState.hidden = true;
  el.taskList.hidden = false;

  const fragment = document.createDocumentFragment();
  visible.forEach(task => fragment.appendChild(renderTaskCard(task)));
  el.taskList.appendChild(fragment);
}

function renderTaskCard(task) {
  const li = document.createElement('li');

  const card = document.createElement('div');
  card.className = 'task-card' + (task.completed ? ' is-completed' : '');
  card.dataset.id = task.id;

  const due = formatDueDate(task.dueDate);

  card.innerHTML = `
    <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''}
      aria-label="Mark &quot;${escapeHtml(task.title)}&quot; as ${task.completed ? 'active' : 'complete'}">
    <div class="task-main">
      <div class="task-top-row">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <div class="task-actions">
          <button type="button" class="icon-btn icon-btn--edit" data-action="edit" data-id="${task.id}" aria-label="Edit &quot;${escapeHtml(task.title)}&quot;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="icon-btn icon-btn--danger icon-btn--delete" data-action="delete" data-id="${task.id}" aria-label="Delete &quot;${escapeHtml(task.title)}&quot;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          </button>
        </div>
      </div>
      ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
      <div class="task-meta">
        <span class="badge badge--priority-${task.priority}">${task.priority}</span>
        <span class="badge badge--category">${CATEGORY_LABELS[task.category] || 'Other'}</span>
        ${due ? `<span class="badge badge--due ${due.isOverdue && !task.completed ? 'is-overdue' : ''}">${due.isOverdue && !task.completed ? 'Overdue · ' : 'Due '}${due.formatted}</span>` : ''}
      </div>
    </div>
  `;

  // Use event delegation with a guard to prevent initialization triggers
  card.addEventListener('click', function(e) {
    const target = e.target.closest('button, input');
    if (!target) return;
    
    if (target.classList.contains('task-check')) {
      e.stopPropagation();
      toggleTask(task.id);
    } else if (target.dataset.action === 'edit') {
      e.stopPropagation();
      openTaskModal(task.id);
    } else if (target.dataset.action === 'delete') {
      e.stopPropagation();
      e.preventDefault();
      openDeleteModal(task.id);
    }
  });

  li.appendChild(card);
  return li;
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStatistics() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const active = total - completed;
  const high = tasks.filter(t => t.priority === 'high' && !t.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  el.statTotal.textContent = total;
  el.statActive.textContent = active;
  el.statCompleted.textContent = completed;
  el.statHigh.textContent = high;
  el.statPercent.textContent = percent + '%';

  const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
  el.progressRing.style.strokeDashoffset = String(offset);
}

/* =========================================================
   TASK MODAL (add / edit)
   ========================================================= */

function openTaskModal(id) {
  el.taskForm.reset();
  el.titleError.hidden = true;
  el.taskTitle.classList.remove('has-error');

  if (id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    el.modalTitle.textContent = 'Edit entry';
    el.taskId.value = task.id;
    el.taskTitle.value = task.title;
    el.taskDescription.value = task.description;
    el.taskPriority.value = task.priority;
    el.taskCategory.value = task.category;
    el.taskDueDate.value = task.dueDate;
  } else {
    el.modalTitle.textContent = 'New entry';
    el.taskId.value = '';
    el.taskPriority.value = 'medium';
    el.taskCategory.value = 'personal';
  }

  el.taskModalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => el.taskTitle.focus(), 0);
}

function closeTaskModal() {
  el.taskModalOverlay.hidden = true;
  document.body.style.overflow = '';
}

function handleTaskFormSubmit(e) {
  e.preventDefault();
  const title = el.taskTitle.value;

  if (!title.trim()) {
    el.titleError.hidden = false;
    el.taskTitle.classList.add('has-error');
    el.taskTitle.focus();
    return;
  }

  const data = {
    title,
    description: el.taskDescription.value,
    priority: el.taskPriority.value,
    category: el.taskCategory.value,
    dueDate: el.taskDueDate.value
  };

  const id = el.taskId.value;
  if (id) {
    updateTask(id, data);
  } else {
    createTask(data);
  }

  closeTaskModal();
}

/* =========================================================
   DELETE MODAL
   ========================================================= */

function openDeleteModal(id) {
  if (!id) {
    console.warn('Delete modal blocked: no ID provided');
    return;
  }
  
  const task = tasks.find(t => t.id === id);
  if (!task) {
    console.warn('Delete modal blocked: task not found');
    return;
  }
  
  // Check if modal is already open
  if (!el.deleteModalOverlay.hidden) {
    console.warn('Delete modal already open');
    return;
  }
  
  deleteTargetId = id;
  el.deleteTaskName.textContent = task.title;
  el.deleteModalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => el.confirmDeleteBtn.focus(), 0);
}

function closeDeleteModal() {
  el.deleteModalOverlay.hidden = true;
  document.body.style.overflow = '';
  deleteTargetId = null;
}

/* =========================================================
   TOASTS
   ========================================================= */

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'delete' ? ' toast--delete' : '');
  toast.textContent = message;
  el.toastStack.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2600);
}

/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  el.themeToggleLabel.textContent = theme === 'dark' ? 'Midnight ink' : 'Ink on paper';
  if (persist) saveTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark', true);
}

/* =========================================================
   MISC UI
   ========================================================= */

function renderTodayDate() {
  const today = new Date();
  el.todayDate.textContent = today.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  });
}

function setFilter(filter) {
  currentFilter = filter;
  [...el.filterRow.querySelectorAll('.chip')].forEach(chip => {
    const active = chip.dataset.filter === filter;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', String(active));
  });
  renderTasks();
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function bindEvents() {
  el.openAddModalBtn.addEventListener('click', () => openTaskModal(null));
  el.emptyStateAddBtn.addEventListener('click', () => openTaskModal(null));
  el.closeModalBtn.addEventListener('click', closeTaskModal);
  el.cancelModalBtn.addEventListener('click', closeTaskModal);
  el.taskModalOverlay.addEventListener('click', e => {
    if (e.target === el.taskModalOverlay) closeTaskModal();
  });
  el.taskForm.addEventListener('submit', handleTaskFormSubmit);
  el.taskTitle.addEventListener('input', () => {
    if (el.taskTitle.value.trim()) {
      el.titleError.hidden = true;
      el.taskTitle.classList.remove('has-error');
    }
  });

  el.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  el.deleteModalOverlay.addEventListener('click', e => {
    if (e.target === el.deleteModalOverlay) closeDeleteModal();
  });
  el.confirmDeleteBtn.addEventListener('click', () => {
    if (deleteTargetId) deleteTask(deleteTargetId);
    closeDeleteModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!el.taskModalOverlay.hidden) closeTaskModal();
      if (!el.deleteModalOverlay.hidden) closeDeleteModal();
    }
  });

  el.searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
    renderTasks();
  });

  el.sortSelect.addEventListener('change', e => {
    currentSort = e.target.value;
    renderTasks();
  });

  el.filterRow.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    setFilter(chip.dataset.filter);
  });

  el.themeToggle.addEventListener('click', toggleTheme);
}

/* =========================================================
   INIT
   ========================================================= */

function init() {
  loadTheme();
  loadTasks();
  bindEvents();
  renderTodayDate();
  renderTasks();
  updateStatistics();
  
  // Force delete modal to be hidden
  el.deleteModalOverlay.setAttribute('hidden', '');
  el.deleteModalOverlay.hidden = true;
  document.body.style.overflow = '';
  
  console.log('Ledger initialized successfully');
  console.log(`Tasks loaded: ${tasks.length}`);
}

// Clear any corrupted data if needed
function fixCorruptedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(task => task && typeof task === 'object' && task.id && task.title);
        if (valid.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
          console.log('Fixed corrupted data. Removed', parsed.length - valid.length, 'invalid entries');
        }
      }
    }
  } catch (e) {
    console.error('Error fixing data:', e);
  }
}

// Run fix on load
document.addEventListener('DOMContentLoaded', () => {
  fixCorruptedData();
  init();
});