let menuItems = [];
let orders = JSON.parse(localStorage.getItem("orders") || "{}");

async function importMenu() {
  const url = document.getElementById("menuUrl").value.trim();
  const status = document.getElementById("status");

  if (!url.includes("korpa.ba/partner/")) {
    status.textContent = "Ubaci validan Korpa partner link.";
    return;
  }

  status.textContent = "Učitavam artikle...";

  try {
    const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    const response = await fetch(proxyUrl);
    const html = await response.text();

    menuItems = parseKorpaHtml(html);

    if (menuItems.length === 0) {
      status.textContent = "Nisam uspio izvući artikle. Korpa možda blokira ovaj restoran.";
      return;
    }

    localStorage.setItem("menuItems", JSON.stringify(menuItems));
    status.textContent = `Učitano artikala: ${menuItems.length}`;
    renderItems();
    renderSummary();

  } catch (err) {
    console.error(err);
    status.textContent = "Greška kod importa. Probaj drugi Korpa link.";
  }
}

function parseKorpaHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.innerText
    .replace(/\r/g, "")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  const items = [];

  for (let i = 0; i < text.length; i++) {
    const line = cleanText(text[i]);

    const next1 = cleanText(text[i + 1] || "");
    const next2 = cleanText(text[i + 2] || "");
    const next3 = cleanText(text[i + 3] || "");

    const priceLine = [next1, next2, next3].find(x => /^\d+([.,]\d+)?\s*KM$/i.test(x));

    if (
      line.length > 2 &&
      priceLine &&
      !line.toLowerCase().includes("trenutno nedostupno") &&
      !line.toLowerCase().includes("switch to english")
    ) {
      const price = priceLine.replace(",", ".").replace(/KM/i, "").trim();

      if (!items.some(x => x.name === line && x.price === price)) {
        items.push({
          id: slugify(line + "-" + price),
          name: line,
          price: Number(price),
          qty: 0
        });
      }
    }
  }

  return items;
}

function renderItems() {
  const saved = localStorage.getItem("menuItems");
  if (saved && menuItems.length === 0) {
    menuItems = JSON.parse(saved);
  }

  const container = document.getElementById("items");
  container.innerHTML = "";

  menuItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="item-title">${item.name}</div>
      <div class="price">${item.price.toFixed(2)} KM</div>
      <div class="controls">
        <button onclick="addItem('${item.id}')">+</button>
        <button onclick="removeItem('${item.id}')">-</button>
      </div>
    `;

    container.appendChild(div);
  });
}

function addItem(itemId) {
  const person = document.getElementById("personName").value.trim();

  if (!person) {
    alert("Upiši ime prvo.");
    return;
  }

  if (!orders[person]) orders[person] = {};
  if (!orders[person][itemId]) orders[person][itemId] = 0;

  orders[person][itemId]++;
  saveOrders();
}

function removeItem(itemId) {
  const person = document.getElementById("personName").value.trim();

  if (!person || !orders[person] || !orders[person][itemId]) return;

  orders[person][itemId]--;

  if (orders[person][itemId] <= 0) {
    delete orders[person][itemId];
  }

  saveOrders();
}

function saveOrders() {
  localStorage.setItem("orders", JSON.stringify(orders));
  renderSummary();
}

function renderSummary() {
  const saved = localStorage.getItem("menuItems");
  if (saved && menuItems.length === 0) {
    menuItems = JSON.parse(saved);
  }

  const summary = {};

  Object.keys(orders).forEach(person => {
    Object.keys(orders[person]).forEach(itemId => {
      const qty = orders[person][itemId];
      const item = menuItems.find(x => x.id === itemId);
      if (!item) return;

      if (!summary[itemId]) {
        summary[itemId] = {
          name: item.name,
          price: item.price,
          totalQty: 0,
          people: []
        };
      }

      summary[itemId].totalQty += qty;
      summary[itemId].people.push(`${person}: ${qty}`);
    });
  });

  const container = document.getElementById("summary");
  container.innerHTML = "";

  let grandTotal = 0;

  Object.values(summary).forEach(row => {
    const total = row.totalQty * row.price;
    grandTotal += total;

    const div = document.createElement("div");
    div.className = "summary-row";
    div.innerHTML = `
      <b>${row.name}</b><br>
      Količina: ${row.totalQty}<br>
      Ukupno: ${total.toFixed(2)} KM<br>
      <span class="small">${row.people.join(", ")}</span>
    `;
    container.appendChild(div);
  });

  const totalDiv = document.createElement("div");
  totalDiv.className = "summary-row";
  totalDiv.innerHTML = `<b>UKUPNO: ${grandTotal.toFixed(2)} KM</b>`;
  container.appendChild(totalDiv);
}

function clearAll() {
  if (!confirm("Obrisati narudžbe i artikle?")) return;
  localStorage.clear();
  menuItems = [];
  orders = {};
  renderItems();
  renderSummary();
}

function cleanText(x) {
  return x.replace(/\s+/g, " ").replace("Image", "").trim();
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

renderItems();
renderSummary();
