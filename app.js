let menuItems = JSON.parse(localStorage.getItem("go_items") || "[]");
let orders = JSON.parse(localStorage.getItem("go_orders") || "{}");

// Restore saved name
document.getElementById("personName").value = localStorage.getItem("go_person") || "";
document.getElementById("personName").addEventListener("input", () => {
  localStorage.setItem("go_person", document.getElementById("personName").value.trim());
  renderItems();
});

// ─── IMPORT ───────────────────────────────────────────────────────────────────

function importFromPaste() {
  const text = document.getElementById("pasteArea").value.trim();
  const status = document.getElementById("status");

  if (!text || text.length < 100) {
    setStatus("Zalijepi tekst sa korpa.ba stranice.", true);
    return;
  }

  menuItems = parseText(text);

  if (menuItems.length === 0) {
    setStatus("Nisam prepoznao artikle. Provjeri da li si kopirao cijelu stranicu (Ctrl+A, Ctrl+C).", true);
    return;
  }

  localStorage.setItem("go_items", JSON.stringify(menuItems));
  setStatus("Učitano artikala: " + menuItems.length, false);
  document.getElementById("pasteArea").value = "";
  renderItems();
  renderSummary();
}

// ─── PARSER ───────────────────────────────────────────────────────────────────

function parseText(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map(x => x.replace(/\s+/g, " ").replace(/[*#|>]/g, "").trim())
    .filter(Boolean);

  const items = [];
  const priceExact = /^(\d{1,3}([.,]\d{1,2})?)\s*KM$/i;
  const priceInline = /(\d{1,3}([.,]\d{1,2})?)\s*KM/i;

  for (let i = 0; i < lines.length; i++) {
    const name = lines[i];

    if (!isValidName(name)) continue;

    // Look at next 5 lines for a price
    const ahead = [
      lines[i + 1] || "",
      lines[i + 2] || "",
      lines[i + 3] || "",
      lines[i + 4] || "",
      lines[i + 5] || ""
    ];

    let priceLine = ahead.find(x => priceExact.test(x));
    if (!priceLine) priceLine = ahead.find(x => priceInline.test(x));
    if (!priceLine) continue;

    const priceMatch = priceLine.replace(",", ".").match(/(\d+(\.\d{1,2})?)/);
    if (!priceMatch) continue;

    const price = Number(priceMatch[1]);
    if (!price || price < 0.5 || price > 500) continue;

    const id = slugify(name + "-" + price);
    if (!items.some(x => x.id === id)) {
      items.push({ id, name, price });
    }
  }

  return items;
}

function isValidName(name) {
  const bad = [
    "korpa", "login", "register", "dostava", "switch to english",
    "nedostupno", "kategorije", "minimalna", "vrijeme", "title:",
    "url source:", "markdown", "home", "restaurants", "pretraga",
    "naručivanje", "narudžba", "cookies", "politika", "pratite",
    "instagram", "facebook", "info@", "tel:", "©", "all rights", "http",
    "radno vrijeme", "o nama", "kontakt", "uvjeti", "privatnost"
  ];
  const low = name.toLowerCase();

  if (name.length < 3 || name.length > 100) return false;
  if (/^\d/.test(name)) return false;
  if (/^\d+([.,]\d+)?\s*KM$/i.test(name)) return false;
  if (name.startsWith("[") || name.startsWith("(")) return false;
  if (name.includes("http")) return false;
  if (bad.some(w => low.includes(w))) return false;

  return true;
}

// ─── ORDERING ─────────────────────────────────────────────────────────────────

function getPerson() {
  const p = document.getElementById("personName").value.trim();
  if (!p) {
    alert("Prvo upiši ime.");
    return "";
  }
  localStorage.setItem("go_person", p);
  return p;
}

function getQty(itemId) {
  const p = document.getElementById("personName").value.trim();
  return (p && orders[p] && orders[p][itemId]) ? orders[p][itemId] : 0;
}

function addItem(itemId) {
  const p = getPerson();
  if (!p) return;
  if (!orders[p]) orders[p] = {};
  orders[p][itemId] = (orders[p][itemId] || 0) + 1;
  save();
}

function removeItem(itemId) {
  const p = getPerson();
  if (!p) return;
  if (!orders[p] || !orders[p][itemId]) return;
  orders[p][itemId]--;
  if (orders[p][itemId] <= 0) delete orders[p][itemId];
  save();
}

function save() {
  localStorage.setItem("go_orders", JSON.stringify(orders));
  renderItems();
  renderSummary();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderItems() {
  const container = document.getElementById("items");
  container.innerHTML = "";

  if (menuItems.length === 0) {
    container.innerHTML = `<p class="empty">Nema artikala. Uradi import.</p>`;
    return;
  }

  menuItems.forEach(item => {
    const qty = getQty(item.id);
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">${escapeHtml(item.name)}</div>
      <div class="item-price">${item.price.toFixed(2)} KM</div>
      <div class="qty-row">
        <button class="qty-btn" onclick="removeItem('${item.id}')">−</button>
        <span class="qty-num" id="q-${item.id}">${qty}</span>
        <button class="qty-btn" onclick="addItem('${item.id}')">+</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderSummary() {
  const container = document.getElementById("summary");
  container.innerHTML = "";

  const summary = {};
  let grandTotal = 0;

  Object.keys(orders).forEach(person => {
    Object.keys(orders[person]).forEach(itemId => {
      const qty = orders[person][itemId];
      const item = menuItems.find(x => x.id === itemId);
      if (!item || qty <= 0) return;

      if (!summary[itemId]) {
        summary[itemId] = {
          name: item.name,
          price: item.price,
          qty: 0,
          people: []
        };
      }

      summary[itemId].qty += qty;
      summary[itemId].people.push(person + ": " + qty);
    });
  });

  const rows = Object.values(summary);

  if (rows.length === 0) {
    container.innerHTML = `<p class="empty">Još nema narudžbi.</p>`;
    return;
  }

  rows.forEach(row => {
    const total = row.qty * row.price;
    grandTotal += total;

    const div = document.createElement("div");
    div.className = "summary-row";
    div.innerHTML = `
      <b>${escapeHtml(row.name)}</b><br>
      Količina: ${row.qty} &nbsp;·&nbsp; Ukupno: ${total.toFixed(2)} KM<br>
      <span class="small">${escapeHtml(row.people.join(" · "))}</span>
    `;
    container.appendChild(div);
  });

  const totalDiv = document.createElement("div");
  totalDiv.className = "summary-row total";
  totalDiv.innerHTML = `UKUPNO SVE: <b>${grandTotal.toFixed(2)} KM</b>`;
  container.appendChild(totalDiv);
}

// ─── CLEAR ────────────────────────────────────────────────────────────────────

function clearOrders() {
  if (!confirm("Obrisati sve narudžbe?")) return;
  orders = {};
  localStorage.setItem("go_orders", JSON.stringify(orders));
  renderItems();
  renderSummary();
}

function clearAll() {
  if (!confirm("Obrisati sve artikle i narudžbe?")) return;
  menuItems = [];
  orders = {};
  localStorage.removeItem("go_items");
  localStorage.removeItem("go_orders");
  document.getElementById("status").textContent = "";
  renderItems();
  renderSummary();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function setStatus(msg, isErr) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.style.color = isErr ? "red" : "green";
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/[š]/g, "s")
    .replace(/[đ]/g, "d")
    .replace(/[ž]/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

renderItems();
renderSummary();
