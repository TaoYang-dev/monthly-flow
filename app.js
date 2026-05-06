const STORAGE_KEY = "monthly-flow-items-v1";
const BALANCE_KEY = "monthly-flow-balance-v1";

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

let items = loadItems();
let editingId = null;
let activeFilter = "all";

const form = document.querySelector("#itemForm");
const formTitle = document.querySelector("#formTitle");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const categoryInput = document.querySelector("#categoryInput");
const itemList = document.querySelector("#itemList");
const emptyListText = document.querySelector("#emptyListText");
const timeline = document.querySelector("#timeline");
const template = document.querySelector("#itemTemplate");
const monthSelect = document.querySelector("#monthSelect");
const balanceInput = document.querySelector("#balanceInput");
const chart = document.querySelector("#categoryChart");
const emptyChartText = document.querySelector("#emptyChartText");
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

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
  const totals = getTotals();
  const net = totals.income - totals.expense;
  const savingsRate = totals.income > 0 ? Math.round((net / totals.income) * 100) : 0;
  const netEl = document.querySelector("#netTotal");

  document.querySelector("#incomeTotal").textContent = currency.format(totals.income);
  document.querySelector("#expenseTotal").textContent = currency.format(totals.expense);
  netEl.textContent = currency.format(net);
  netEl.classList.toggle("positive", net >= 0);
  netEl.classList.toggle("negative", net < 0);
  document.querySelector("#savingsRate").textContent = `${savingsRate}%`;
}

function renderItems() {
  itemList.innerHTML = "";
  const filtered = items
    .filter((item) => activeFilter === "all" || item.type === activeFilter)
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));

  emptyListText.hidden = filtered.length > 0;

  filtered.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(item.type);
    node.querySelector(".date-day").textContent = item.day;
    node.querySelector(".item-name").textContent = item.name;
    node.querySelector(".item-meta").textContent = `${item.category}${item.account ? ` • ${item.account}` : ""}`;
    node.querySelector(".item-amount").textContent = `${item.type === "income" ? "+" : "-"}${exactCurrency.format(item.amount)}`;
    node.querySelector(".item-notes").textContent = item.notes || "";
    node.querySelector(".edit-button").addEventListener("click", () => editItem(item.id));
    node.querySelector(".delete-button").addEventListener("click", () => deleteItem(item.id));
    itemList.append(node);
  });
}

function renderTimeline() {
  timeline.innerHTML = "";
  const sorted = [...items].sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Your due-date timeline will appear here.";
    timeline.append(empty);
    return;
  }

  sorted.forEach((item) => {
    const entry = document.createElement("article");
    entry.className = `timeline-entry ${item.type}`;
    entry.innerHTML = `
      <span>Day ${item.day} • ${item.category}</span>
      <strong>${escapeHtml(item.name)} · ${item.type === "income" ? "+" : "-"}${exactCurrency.format(item.amount)}</strong>
    `;
    timeline.append(entry);
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
  monthSelect.innerHTML = "";

  for (let index = 0; index < 12; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    const option = document.createElement("option");
    option.value = date.toISOString();
    option.textContent = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    monthSelect.append(option);
  }
}

function renderForecast() {
  const totals = getTotals();
  const selectedIndex = monthSelect.selectedIndex >= 0 ? monthSelect.selectedIndex : 0;
  const startingBalance = Number(balanceInput.value) || 0;
  const projected = startingBalance + (totals.income - totals.expense) * (selectedIndex + 1);
  document.querySelector("#projectedBalance").textContent = exactCurrency.format(projected);
}

function renderAll() {
  renderSummary();
  renderItems();
  renderTimeline();
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
  items = items.filter((item) => item.id !== id);
  saveItems();
  if (editingId === id) resetForm();
  renderAll();
}

function resetForm() {
  editingId = null;
  form.reset();
  updateCategories("income");
  formTitle.textContent = "Add income or expense";
  submitButton.textContent = "Add recurring item";
  cancelEditButton.hidden = true;
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
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const item = {
    id: editingId || createId(),
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

monthSelect.addEventListener("change", renderForecast);

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ items, balance: balanceInput.value }, null, 2)], { type: "application/json" });
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
    if (!Array.isArray(data.items)) throw new Error("Invalid backup file");
    items = data.items;
    balanceInput.value = data.balance || "0";
    saveItems();
    localStorage.setItem(BALANCE_KEY, balanceInput.value);
    resetForm();
    renderAll();
  } catch {
    alert("That backup could not be imported.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#resetButton").addEventListener("click", () => {
  if (!confirm("Reset all recurring items?")) return;
  items = [];
  saveItems();
  resetForm();
  renderAll();
});

updateCategories();
renderMonthOptions();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
