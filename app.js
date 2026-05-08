const STORAGE_KEY = "monthly-flow-items-v1";
const BALANCE_KEY = "monthly-flow-balance-v1";
const SYNC_ENDPOINT_KEY = "monthly-flow-sync-endpoint-v1";
const COMPLETIONS_KEY = "monthly-flow-completions-v1";
const MONTH_ITEMS_KEY = "monthly-flow-month-items-v1";

const categories = {
  income: ["Salary", "Freelance", "Investment", "Benefits", "Other income"],
  expense: ["Housing", "Utilities", "Insurance", "Debt", "Subscriptions", "Food", "Transport", "Savings", "Other expense"]
};

const sampleItems = [
  { id: createId(), type: "income", name: "Primary paycheck", amount: 5200, day: 1, category: "Salary", account: "Checking", notes: "Monthly net pay" },
  { id: createId(), type: "expense", name: "Rent", amount: 1850, day: 3, category: "Housing", account: "Checking", notes: "" },
  { id: createId(), type: "expense", name: "Internet", amount: 68, day: 12, category: "Utilities", account: "Credit card", notes: "" },
  { id: createId(), type: "expense", name: "Gym", amount: 45, day: 18, category: "Subscriptions", account: "Credit card", notes: "" }
];

let monthItems = loadMonthItems();
let items = ensureMonthItems(getMonthKeyFromDate(new Date()));
let completions = loadCompletions();
let editingId = null;
let activeFilter = "all";

const form = document.querySelector("#itemForm");
const formTitle = document.querySelector("#formTitle");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const categoryInput = document.querySelector("#categoryInput");
const itemList = document.querySelector("#itemList");
const emptyListText = document.querySelector("#emptyListText");
const groupedLists = document.querySelector("#groupedLists");
const template = document.querySelector("#itemTemplate");
const monthSelect = document.querySelector("#monthSelect");
const balanceInput = document.querySelector("#balanceInput");
const chart = document.querySelector("#categoryChart");
const emptyChartText = document.querySelector("#emptyChartText");
const syncButton = document.querySelector("#syncButton");
const loadSyncButton = document.querySelector("#loadSyncButton");
const syncSettingsButton = document.querySelector("#syncSettingsButton");
const syncStatus = document.querySelector("#syncStatus");
const ctx = chart.getContext("2d");

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const exactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function loadItems() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return sampleItems;

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : sampleItems;
  } catch {
    return sampleItems;
  }
}

function loadCompletions() {
  const saved = localStorage.getItem(COMPLETIONS_KEY);
  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function loadMonthItems() {
  const saved = localStorage.getItem(MONTH_ITEMS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to legacy migration below.
    }
  }

  return {
    [getMonthKeyFromDate(new Date())]: cloneItems(loadItems())
  };
}

function cloneItems(sourceItems) {
  return JSON.parse(JSON.stringify(sourceItems));
}

function normalizeItem(item) {
  return {
    ...item,
    kind: item.kind || "recurring"
  };
}

function normalizeItems(sourceItems) {
  return cloneItems(sourceItems).map(normalizeItem);
}

function getMonthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function saveMonthItems() {
  monthItems[getSelectedMonthKey()] = cloneItems(items);
  localStorage.setItem(MONTH_ITEMS_KEY, JSON.stringify(monthItems));
}

function ensureMonthItems(monthKey) {
  if (!monthItems[monthKey]) {
    const sourceKey = Object.keys(monthItems)
      .filter((key) => key < monthKey)
      .sort()
      .pop();
    const sourceItems = sourceKey ? monthItems[sourceKey] : loadItems();
    monthItems[monthKey] = normalizeItems(sourceItems)
      .filter((item) => item.kind !== "one-time");
    localStorage.setItem(MONTH_ITEMS_KEY, JSON.stringify(monthItems));
  }

  return normalizeItems(monthItems[monthKey]);
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveItems() {
  saveMonthItems();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function saveCompletions() {
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
}

function getBackupPayload() {
  return {
    app: "Monthly Flow",
    syncedAt: new Date().toISOString(),
    balance: balanceInput.value || "0",
    items,
    monthItems,
    completions
  };
}

function updateSyncStatus(message) {
  const endpoint = localStorage.getItem(SYNC_ENDPOINT_KEY);
  syncStatus.textContent = message || (endpoint ? "Ready to sync" : "Not configured");
}

function loadBackupPayload(payload) {
  if (!payload || !Array.isArray(payload.items)) throw new Error("Invalid backup payload");
  monthItems = payload.monthItems && typeof payload.monthItems === "object"
    ? payload.monthItems
    : { [getSelectedMonthKey()]: payload.items };
  Object.keys(monthItems).forEach((monthKey) => {
    monthItems[monthKey] = normalizeItems(monthItems[monthKey]);
  });
  items = ensureMonthItems(getSelectedMonthKey());
  completions = payload.completions && typeof payload.completions === "object" ? payload.completions : {};
  balanceInput.value = payload.balance || "0";
  saveItems();
  saveCompletions();
  localStorage.setItem(BALANCE_KEY, balanceInput.value);
  resetForm();
  renderAll();
}

function getSelectedMonthKey() {
  const date = monthSelect.value ? new Date(monthSelect.value) : new Date();
  return getMonthKeyFromDate(date);
}

function isItemComplete(itemId) {
  return Boolean(completions[getSelectedMonthKey()]?.[itemId]);
}

function setItemComplete(itemId, complete) {
  const monthKey = getSelectedMonthKey();
  completions[monthKey] = completions[monthKey] || {};

  if (complete) {
    completions[monthKey][itemId] = true;
  } else {
    delete completions[monthKey][itemId];
  }

  if (!Object.keys(completions[monthKey]).length) delete completions[monthKey];
  saveCompletions();
  renderSummary();
  renderItems();
  renderGroups();
}

function requestLatestBackup(endpoint) {
  return new Promise((resolve, reject) => {
    const callbackName = `monthlyFlowSync${Date.now()}${Math.random().toString(16).slice(2)}`;
    const separator = endpoint.includes("?") ? "&" : "?";
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Sync timed out"));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (response) => {
      cleanup();
      response?.ok ? resolve(response.payload) : reject(new Error(response?.error || "Sync failed"));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Sync failed"));
    };

    script.src = `${endpoint}${separator}callback=${encodeURIComponent(callbackName)}`;
    document.body.append(script);
  });
}

function getTotals() {
  return items.reduce(
    (totals, item) => {
      totals[item.type] += Number(item.amount) || 0;
      return totals;
    },
    { income: 0, expense: 0 }
  );
}

function getTotalsFor(sourceItems) {
  return sourceItems.reduce(
    (totals, item) => {
      totals[item.type] += Number(item.amount) || 0;
      return totals;
    },
    { income: 0, expense: 0 }
  );
}

function updateCategories(type = getSelectedType()) {
  categoryInput.innerHTML = "";
  categories[type].forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryInput.append(option);
  });
}

function getSelectedType() {
  return new FormData(form).get("type") || "income";
}

function renderSummary() {
  const monthEndTotals = getTotalsFor(items);
  const checkedTotals = getTotalsFor(items.filter((item) => isItemComplete(item.id)));
  const monthEndNet = monthEndTotals.income - monthEndTotals.expense;
  const checkedNet = checkedTotals.income - checkedTotals.expense;
  const monthEndSavingsRate = monthEndTotals.income > 0 ? Math.round((monthEndNet / monthEndTotals.income) * 100) : 0;
  const checkedSavingsRate = checkedTotals.income > 0 ? Math.round((checkedNet / checkedTotals.income) * 100) : 0;
  const netActualEl = document.querySelector("#netActual");
  const netTotalEl = document.querySelector("#netTotal");

  document.querySelector("#incomeActual").textContent = currency.format(checkedTotals.income);
  document.querySelector("#incomeTotal").textContent = currency.format(monthEndTotals.income);
  document.querySelector("#expenseActual").textContent = currency.format(checkedTotals.expense);
  document.querySelector("#expenseTotal").textContent = currency.format(monthEndTotals.expense);
  netActualEl.textContent = currency.format(checkedNet);
  netTotalEl.textContent = currency.format(monthEndNet);
  netActualEl.classList.toggle("positive", checkedNet >= 0);
  netActualEl.classList.toggle("negative", checkedNet < 0);
  netTotalEl.classList.toggle("positive", monthEndNet >= 0);
  netTotalEl.classList.toggle("negative", monthEndNet < 0);
  document.querySelector("#savingsRateActual").textContent = `${checkedSavingsRate}%`;
  document.querySelector("#savingsRate").textContent = `${monthEndSavingsRate}%`;
}

function renderItems() {
  itemList.innerHTML = "";
  const filtered = items
    .filter((item) => activeFilter === "all" || item.type === activeFilter)
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));

  emptyListText.hidden = filtered.length > 0;

  filtered.forEach((item) => {
    itemList.append(createItemNode(item));
  });
}

function createItemNode(item) {
  const node = template.content.firstElementChild.cloneNode(true);
  const complete = isItemComplete(item.id);
  node.classList.add(item.type);
  node.classList.toggle("complete", complete);
  node.querySelector(".item-check").checked = complete;
  node.querySelector(".item-check").setAttribute("aria-label", `Mark ${item.name} as happened`);
  node.querySelector(".item-check").addEventListener("change", (event) => setItemComplete(item.id, event.target.checked));
  node.querySelector(".date-day").textContent = item.day;
  node.querySelector(".item-name").textContent = item.name;
  node.querySelector(".item-meta").textContent = `${getKindLabel(item.kind)} • ${item.category}${item.account ? ` • ${item.account}` : ""}`;
  node.querySelector(".item-amount").textContent = `${item.type === "income" ? "+" : "-"}${exactCurrency.format(item.amount)}`;
  node.querySelector(".item-notes").textContent = item.notes || "";
  node.querySelector(".edit-button").addEventListener("click", () => editItem(item.id));
  node.querySelector(".delete-button").addEventListener("click", () => deleteItem(item.id));
  return node;
}

function getKindLabel(kind) {
  return {
    recurring: "Recurring item",
    variable: "Recurring variable",
    "one-time": "One time"
  }[kind] || "Recurring item";
}

function renderGroups() {
  groupedLists.innerHTML = "";
  const groups = [
    ["recurring", "Recurring items"],
    ["variable", "Recurring variable"],
    ["one-time", "One time"]
  ];

  groups.forEach(([kind, title]) => {
    const groupItems = items
      .filter((item) => normalizeItem(item).kind === kind)
      .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
    const section = document.createElement("section");
    section.className = "logging-group";
    section.innerHTML = `<h3>${title}</h3>`;
    const list = document.createElement("div");
    list.className = "item-list";

    if (groupItems.length) {
      groupItems.forEach((item) => list.append(createItemNode(item)));
    } else {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = `No ${title.toLowerCase()} for this month.`;
      list.append(empty);
    }

    section.append(list);
    groupedLists.append(section);
  });
}

function renderChart() {
  const expensesByCategory = items
    .filter((item) => item.type === "expense")
    .reduce((groups, item) => {
      groups[item.category] = (groups[item.category] || 0) + Number(item.amount);
      return groups;
    }, {});

  const entries = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);
  ctx.clearRect(0, 0, chart.width, chart.height);
  emptyChartText.hidden = entries.length > 0;
  if (!entries.length) return;

  const palette = ["#bb3e36", "#2f6f99", "#176f53", "#b47a18", "#705f99", "#c85f2d", "#4d7d7b", "#916545", "#6f7982"];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const centerX = 135;
  const centerY = 130;
  const radius = 92;
  let start = -Math.PI / 2;

  entries.forEach(([, value], index) => {
    const angle = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = palette[index % palette.length];
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, 52, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "#17201c";
  ctx.font = "700 18px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(currency.format(total), centerX, centerY + 6);

  ctx.textAlign = "left";
  ctx.font = "700 13px Inter, sans-serif";
  entries.slice(0, 6).forEach(([category, value], index) => {
    const y = 52 + index * 30;
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(280, y - 11, 14, 14);
    ctx.fillStyle = "#17201c";
    ctx.fillText(category, 304, y);
    ctx.fillStyle = "#68736c";
    ctx.fillText(currency.format(value), 304, y + 16);
  });
}

function renderMonthOptions() {
  const now = new Date();
  const currentMonth = getMonthKeyFromDate(new Date(now.getFullYear(), now.getMonth(), 1));
  monthSelect.innerHTML = "";

  for (let index = -11; index <= 12; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    const option = document.createElement("option");
    option.value = date.toISOString();
    option.textContent = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    option.selected = getMonthKeyFromDate(date) === currentMonth;
    monthSelect.append(option);
  }
}

function renderForecast() {
  const totals = getTotals();
  const startingBalance = Number(balanceInput.value) || 0;
  const projected = startingBalance + totals.income - totals.expense;
  document.querySelector("#projectedBalance").textContent = exactCurrency.format(projected);
}

function renderAll() {
  renderSummary();
  renderItems();
  renderGroups();
  renderChart();
  renderForecast();
}

function editItem(id) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;

  editingId = id;
  formTitle.textContent = "Edit recurring item";
  submitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;

  form.elements.type.value = item.type;
  form.elements.kind.value = normalizeItem(item).kind;
  updateCategories(item.type);
  form.elements.name.value = item.name;
  form.elements.amount.value = item.amount;
  form.elements.day.value = item.day;
  form.elements.category.value = item.category;
  form.elements.account.value = item.account || "";
  form.elements.notes.value = item.notes || "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteItem(id) {
  const monthKey = getSelectedMonthKey();
  items = items.filter((item) => item.id !== id);
  if (completions[monthKey]) {
    delete completions[monthKey][id];
    if (!Object.keys(completions[monthKey]).length) delete completions[monthKey];
  }
  saveItems();
  saveCompletions();
  if (editingId === id) resetForm();
  renderAll();
}

function resetForm() {
  editingId = null;
  form.reset();
  updateCategories("income");
  updateFormMode();
  cancelEditButton.hidden = true;
}

function updateFormMode() {
  const kind = new FormData(form).get("kind") || "recurring";
  formTitle.textContent = `Add ${getKindLabel(kind).toLowerCase()}`;
  submitButton.textContent = `Add ${getKindLabel(kind).toLowerCase()}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

form.addEventListener("change", (event) => {
  if (event.target.name === "type") updateCategories(event.target.value);
  if (event.target.name === "kind") updateFormMode();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const item = {
    id: editingId || createId(),
    kind: data.get("kind") || "recurring",
    type: data.get("type"),
    name: String(data.get("name")).trim(),
    amount: Number(data.get("amount")),
    day: Math.min(31, Math.max(1, Number(data.get("day")) || 1)),
    category: data.get("category"),
    account: String(data.get("account")).trim(),
    notes: String(data.get("notes")).trim()
  };

  if (!item.name || item.amount < 0) return;

  if (editingId) {
    items = items.map((existing) => existing.id === editingId ? item : existing);
  } else {
    items = [...items, item];
  }

  saveItems();
  resetForm();
  renderAll();
});

cancelEditButton.addEventListener("click", resetForm);

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderItems();
  });
});

balanceInput.value = localStorage.getItem(BALANCE_KEY) || "0";
balanceInput.addEventListener("input", () => {
  localStorage.setItem(BALANCE_KEY, balanceInput.value);
  renderForecast();
});

monthSelect.addEventListener("change", () => {
  items = ensureMonthItems(getSelectedMonthKey());
  resetForm();
  renderAll();
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(getBackupPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "monthly-flow-backup.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    loadBackupPayload(data);
  } catch {
    alert("That backup could not be imported.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#resetButton").addEventListener("click", () => {
  const monthName = monthSelect.options[monthSelect.selectedIndex]?.textContent || "this month";
  if (!confirm(`Reset all recurring items for ${monthName}? Previous months will stay saved.`)) return;
  const monthKey = getSelectedMonthKey();
  items = [];
  delete completions[monthKey];
  saveItems();
  saveCompletions();
  resetForm();
  renderAll();
});

syncSettingsButton.addEventListener("click", () => {
  const current = localStorage.getItem(SYNC_ENDPOINT_KEY) || "";
  const endpoint = prompt("Google Apps Script web app URL", current);
  if (endpoint === null) return;

  const trimmed = endpoint.trim();
  if (trimmed) {
    localStorage.setItem(SYNC_ENDPOINT_KEY, trimmed);
  } else {
    localStorage.removeItem(SYNC_ENDPOINT_KEY);
  }

  updateSyncStatus();
});

loadSyncButton.addEventListener("click", async () => {
  const endpoint = localStorage.getItem(SYNC_ENDPOINT_KEY);
  if (!endpoint) {
    updateSyncStatus("Add script URL first");
    syncSettingsButton.click();
    return;
  }

  if (!confirm("Load the latest Drive backup onto this device? This replaces the current local entries.")) return;

  loadSyncButton.disabled = true;
  updateSyncStatus("Loading...");

  try {
    const payload = await requestLatestBackup(endpoint);
    loadBackupPayload(payload);
    updateSyncStatus(`Loaded ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
  } catch {
    updateSyncStatus("Load failed");
  } finally {
    loadSyncButton.disabled = false;
  }
});

syncButton.addEventListener("click", async () => {
  const endpoint = localStorage.getItem(SYNC_ENDPOINT_KEY);
  if (!endpoint) {
    updateSyncStatus("Add script URL first");
    syncSettingsButton.click();
    return;
  }

  syncButton.disabled = true;
  updateSyncStatus("Pushing...");

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(getBackupPayload())
    });
    updateSyncStatus(`Pushed ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
  } catch {
    updateSyncStatus("Push failed");
  } finally {
    syncButton.disabled = false;
  }
});

updateCategories();
renderMonthOptions();
updateFormMode();
renderAll();
updateSyncStatus();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
