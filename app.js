let menuItems = JSON.parse(localStorage.getItem("menuItems") || "[]");
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
    const proxies = [
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
      "https://corsproxy.io/?" + encodeURIComponent(url)
    ];

    let html = "";

    for (const proxyUrl of proxies) {
      try {
        const response = await fetch(proxyUrl);
        const temp = await response.text();

        if (temp && temp.length > 1000) {
          html = temp;
          break;
        }
      } catch (e) {
        console.log("Proxy failed:", proxyUrl, e);
      }
    }

    if (!html) {
      status.textContent = "Import nije uspio. Proxy blokiran.";
      return;
    }

    menuItems = parseKorpaHtml(html);

    if (menuItems.length === 0) {
      status.textContent = "HTML je učitan, ali artikli nisu prepoznati.";
      console.log(html.slice(0, 3000));
      return;
    }

    localStorage.setItem("menuItems", JSON.stringify(menuItems));
    status.textContent = `Učitano artikala: ${menuItems.length}`;

    renderItems();
    renderSummary();

  } catch (err) {
    console.error(err);
    status.textContent = "Greška kod importa artikala.";
  }
}

function parseKorpaHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  let textLines = doc.body.innerText
    .replace(/\r/g, "")
    .split("\n")
    .map(x => cleanText(x))
    .filter(Boolean);

  const items = [];

  for (let i = 0; i < textLines.length; i++) {
    const name = textLines[i];

    const lookAhead = [
      textLines[i + 1] || "",
      textLines[i + 2] || "",
      textLines[i + 3] || "",
      textLines[i + 4] || ""
    ];

    const priceLine = lookAhead.find(x =>
      /^(\d+|\d+[.,]\d{1,2})\s*KM$/i.test(x) ||
      /^KM\s*(\d+|\d+[.,]\d{1,2})$/i.test(x)
    );

    if (!priceLine) continue;
    if (!isValidItemName(name)) continue;

    const price = extractPrice(priceLine);

    if (!price || price <= 0) continue;

    const exists = items.some(x => x.name === name && x.price === price);
    if (!exists) {
      items.push({
        id: slugify(name + "-" + price),
        name,
        price
      });
    }
  }

  return items;
}

function isValidItemName(name) {
  const badWords = [
    "korpa",
    "login",
    "register",
    "search",
    "dostava",
    "korpa.ba",
    "switch to english",
    "trenutno nedostupno",
    "popularno",
    "kategorije",
    "minimalna narudžba",
    "vrijeme dostave"
  ];

  const lower = name.toLowerCase();

  if (name.length < 3) return false;
  if (name.length > 90) return false;
  if (/^\d/.test(name)) return false;
  if (badWords.some(w => lower.includes(w))) return false;
  if (/^\d+([.,]\d+)?\s*km$/i.test(name)) return false;

  return true;
}

function extractPrice(text) {
  const match = text.replace(",", ".").match(/(\d+(\.\d{1,2})?)/);
  return match ? Number(match[1]) : 0;
}

function renderItems() {
  const container = document.getElementById("items");
  container.innerHTML = "";

  if (menuItems.length === 0) {
    container.innerHTML = `<div class="box">Nema artikala. Prvo uradi import.</div>`;
    return;
  }

  menuItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="item-title">${escapeHtml(item.name)}</div>
      <div class="price">${item.price.toFixed(2)} KM</div>
      <div>
        <button onclick="removeItem('${item.id}')">-</button>
        <span class="qty">${getCurrentPersonQty(item.id)}</span>
        <button onclick="addItem('${item.id}')">+</button>
      </div>
    `;

    container.appendChild(div);
  });
}

function addItem(itemId) {
  const person = getPerson();
  if (!person) return;

  if (!orders[person]) orders[person] = {};
  if (!orders[person][itemId]) orders[person][itemId] = 0;

  orders[person][itemId]++;
  saveOrders();
}

function removeItem(itemId) {
  const person = getPerson();
  if (!person) return;

  if (!orders[person] || !orders[person][itemId]) return;

  orders[person][itemId]--;

  if (orders[person][itemId] <= 0) {
    delete orders[person][itemId];
  }

  saveOrders();
}

function getPerson() {
  const person = document.getElementById("personName").value.trim();

  if (!person) {
    alert("Prvo upiši ime.");
    return "";
  }

  localStorage.setItem("personName", person);
  return person;
}

function getCurrentPersonQty(itemId) {
  const person = document.getElementById("personName").value.trim();
  if (!person || !orders[person] || !orders[person][itemId]) return 0;
  return orders[person][itemId];
}

function saveOrders() {
  localStorage.setItem("orders", JSON.stringify(orders));
  renderItems();
  renderSummary();
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
      if (!item) return;

      if (!summary[itemId]) {
        summary[itemId] = {
          name: item.name,
          price: item.price,
          qty: 0,
          people: []
        };
      }

      summary[itemId].qty += qty;
      summary[itemId].people.push(`${person}: ${qty}`);
    });
  });

  const rows = Object.values(summary);

  if (rows.length === 0) {
    container.innerHTML = `<div class="summary-row">Još nema narudžbi.</div>`;
    return;
  }

  rows.forEach(row => {
    const total = row.qty * row.price;
    grandTotal += total;

    const div = document.createElement("div");
    div.className = "summary-row";
    div.innerHTML = `
      <b>${escapeHtml(row.name)}</b><br>
      Količina ukupno: ${row.qty}<br>
      Cijena: ${row.price.toFixed(2)} KM<br>
      Ukupno: ${total.toFixed(2)} KM<br>
      <span class="small">${escapeHtml(row.people.join(", "))}</span>
    `;

    container.appendChild(div);
  });

  const totalDiv = document.createElement("div");
  totalDiv.className = "summary-row";
  totalDiv.innerHTML = `<b>UKUPNO SVE: ${grandTotal.toFixed(2)} KM</b>`;
  container.appendChild(totalDiv);
}

function clearOrders() {
  if (!confirm("Obrisati samo narudžbe?")) return;
  orders = {};
  localStorage.setItem("orders", JSON.stringify(orders));
  renderItems();
  renderSummary();
}

function clearAll() {
  if (!confirm("Obrisati sve artikle i narudžbe?")) return;
  menuItems = [];
  orders = {};
  localStorage.removeItem("menuItems");
  localStorage.removeItem("orders");
  renderItems();
  renderSummary();
}

function cleanText(x) {
  return x
    .replace(/\s+/g, " ")
    .replace(/Image/gi, "")
    .trim();
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("personName").value =
  localStorage.getItem("personName") || "";

document.getElementById("personName").addEventListener("input", () => {
  localStorage.setItem("personName", document.getElementById("personName").value.trim());
  renderItems();
});

renderItems();
renderSummary();
