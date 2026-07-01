import cors from "cors";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { isGithubDbSyncEnabled, scheduleDatabaseSync } from "./gitSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const bundledDbPath = path.join(dataDir, "store.db");
const runtimeDbPath = process.env.VERCEL ? path.join(os.tmpdir(), "store.db") : bundledDbPath;
const dbPath = process.env.DB_PATH || runtimeDbPath;
const storeWhatsapp = "553598213049";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

fs.mkdirSync(dataDir, { recursive: true });
if (process.env.VERCEL && !fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
  fs.copyFileSync(bundledDbPath, dbPath);
}

const db = new DatabaseSync(dbPath);
if (process.env.VERCEL) {
  db.exec("PRAGMA journal_mode = DELETE;");
} else {
  db.exec("PRAGMA journal_mode = WAL;");
}
db.exec("PRAGMA foreign_keys = ON;");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const sessions = new Map();

function checkpointDatabase() {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
}

function scheduleStoreBackup(reason) {
  scheduleDatabaseSync(checkpointDatabase, reason);
}

function withTransaction(work) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = work();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

const MARCAS = [
  "Eudora", "O Boticario", "O Boticário", "Jequiti", "Avon", "Mary Kay", "Natura",
  "Oui-Original-Unique-Individuel", "Pierre Alexander", "Tupperware", "Pierre-cosmeticos",
  "Quem Disse Berenice", "Outra"
];

const ESTILOS = [
  "Perfumaria", "Skincare", "Cabelo", "Corpo e Banho", "Make", "Masculinos",
  "Femininos Nina Secrets", "Marcas", "Infantil", "Casa", "Solar", "Maquiage",
  "Teen", "Kits e Presentes", "Cuidados com o Corpo", "Lancamentos", "Lançamentos",
  "Acessorios de Casa", "Acessórios de Casa", "Outro"
];

const TIPOS = [
  "Perfumaria masculina", "Perfumaria feminina", "Body splash", "Body spray",
  "Eau de parfum", "Desodorantes", "Perfumaria infantil", "Perfumaria vegana",
  "Familia olfativa", "Família olfativa", "Clareador de manchas", "Anti-idade",
  "Protetor solar facial", "Rosto", "Tratamento para o rosto", "Acne", "Limpeza",
  "Esfoliante", "Tonico facial", "Tônico facial", "Kits de tratamento",
  "Tratamento para cabelos", "Shampoo", "Condicionador", "Leave-in e Creme para Pentear",
  "Finalizador", "Modelador", "Acessorios", "Acessórios", "Kits e looks", "Boca",
  "Olhos", "Pincis", "Pincéis", "Paleta", "Unhas", "Sobrancelhas", "Hidratante",
  "Cuidados pos-banho", "Cuidados pós-banho", "Cuidados para o banho", "Barba",
  "Oleo corporal", "Óleo corporal", "Cuidados intimos", "Cuidados íntimos", "Unissex",
  "Bronzeamento", "Protetor solar", "Depilacao", "Depilação", "Maos", "Mãos",
  "Labios", "Lábios", "Pes", "Pés", "Pes sol", "Pés sol", "Protetor solar corporal",
  "Colonias", "Colônias", "Estojo", "Sabonetes", "Sabonete liquido", "Sabonete líquido",
  "Sabonete em barra", "Creme hidratante para as maos", "Creme hidratante para as mãos",
  "Creme hidratante para os pes", "Creme hidratante para os pés", "Miniseries",
  "Kits de perfumes", "Antissinais", "Mascara", "Máscara", "Creme bisnaga",
  "Roll On Fragrânciado", "Roll On On Duty", "Shampoo 2 em 1", "Spray corporal",
  "Booster de Tratamento", "Creme para Pentear", "Oleo de Tratamento", "Óleo de Tratamento",
  "Pre-shampoo", "Pré-shampoo", "Serum de Tratamento", "Sérum de Tratamento",
  "Shampoo e Condicionador", "Garrafas", "Armazenamentos", "Micro-ondas", "Servir",
  "Preparo", "Lazer/Outdoor", "Presentes", "Outro"
];

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT,
      birth_date TEXT,
      email TEXT,
      phone TEXT,
      cpf TEXT,
      profile_image BLOB,
      preferred_type TEXT,
      preferred_brand TEXT,
      preferred_style TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      style TEXT,
      type TEXT,
      price REAL,
      quantity INTEGER,
      expiration_date TEXT,
      image BLOB
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      quantity INTEGER,
      total_value REAL,
      sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const hasAdmin = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (!hasAdmin) {
    const hash = bcrypt.hashSync("admin123", 10);
    db.prepare("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)")
      .run("admin", hash, "admin", "Administrador");
  }
}

initDb();

function stripPassword(user) {
  if (!user) return null;
  const { password, profile_image, ...safe } = user;
  return { ...safe, hasProfileImage: Boolean(profile_image?.length) };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function safeRole(role) {
  return ["admin", "funcionario", "cliente"].includes(role) ? role : "cliente";
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const user = token ? sessions.get(token) : null;
  if (!user) return res.status(401).json({ error: "Login necessario." });
  req.user = user;
  next();
}

function requireStaff(req, res, next) {
  if (!["admin", "funcionario"].includes(req.user.role)) {
    return res.status(403).json({ error: "Acesso restrito." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Somente admin." });
  next();
}

function productList() {
  return db.prepare(`
    SELECT id, name, brand, style, type, price, quantity, expiration_date,
           CASE WHEN image IS NULL OR length(image) = 0 THEN 0 ELSE 1 END AS hasImage
    FROM products
    ORDER BY name COLLATE NOCASE
  `).all();
}

function saleRows(limit = 200) {
  return db.prepare(`
    SELECT s.id, s.product_id, p.name AS product_name, s.quantity, s.total_value,
           s.sale_date, s.user_id, u.name AS user_name
    FROM sales s
    LEFT JOIN products p ON p.id = s.product_id
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.sale_date DESC, s.id DESC
    LIMIT ?
  `).all(limit);
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function buildWhatsappMessage({ items, customer, userName, total }) {
  const lines = [
    "Novo pedido/venda - Cores & Fragrancias by Berenice",
    "",
    `Cliente: ${customer?.name || "Nao informado"}`,
    customer?.phone ? `Telefone: ${customer.phone}` : null,
    customer?.email ? `Email: ${customer.email}` : null,
    userName ? `Registrado por: ${userName}` : null,
    "",
    "Itens:"
  ].filter(Boolean);

  for (const item of items) {
    lines.push(`- ${item.quantity}x ${item.name} (${item.brand || "Sem marca"}) - ${brl(item.price)} cada - subtotal ${brl(item.subtotal)}`);
  }
  lines.push("", `Total: ${brl(total)}`, `Data: ${new Date().toLocaleString("pt-BR")}`);
  return lines.join("\n");
}

function parseCsv(text) {
  const delimiter = [",", ";", "\t", "|"]
    .map((d) => [d, (text.split("\n")[0].match(new RegExp(`\\${d}`, "g")) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map((h) => normalizeText(h).replace(/\s+/g, "_"));
  return rows.map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username || "");
  if (!user || !bcrypt.compareSync(password || "", user.password)) {
    return res.status(401).json({ error: "Usuario ou senha incorretos." });
  }
  const token = randomUUID();
  const safe = stripPassword(user);
  sessions.set(token, safe);
  res.json({ token, user: safe });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  sessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/meta", (_req, res) => {
  res.json({ marcas: MARCAS, estilos: ESTILOS, tipos: TIPOS, whatsapp: storeWhatsapp });
});

app.get("/api/products", requireAuth, (req, res) => {
  const search = normalizeText(req.query.search || "");
  let rows = productList();
  if (search) {
    const terms = search.split(/\s+/).filter(Boolean);
    rows = rows.filter((row) => {
      const haystack = normalizeText([row.id, row.name, row.brand, row.style, row.type, row.price, row.quantity, row.expiration_date].join(" "));
      return terms.every((term) => haystack.includes(term));
    });
  }
  res.json(rows);
});

app.get("/api/products/:id/image", (req, res) => {
  const row = db.prepare("SELECT image FROM products WHERE id = ?").get(Number(req.params.id));
  if (!row?.image?.length) return res.status(404).end();
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("jpeg").send(Buffer.from(row.image));
});

app.post("/api/products", requireAuth, requireStaff, upload.single("image"), (req, res) => {
  const product = req.body;
  if (!product.name?.trim()) return res.status(400).json({ error: "Nome do produto e obrigatorio." });
  const info = db.prepare(`
    INSERT INTO products (name, brand, style, type, price, quantity, expiration_date, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    product.name.trim(),
    product.brand || "Outra",
    product.style || "Outro",
    product.type || "Outro",
    Number(product.price || 0),
    Number(product.quantity || 0),
    product.expiration_date || "",
    req.file?.buffer || null
  );
  scheduleStoreBackup("produto cadastrado");
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put("/api/products/:id", requireAuth, requireStaff, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Produto nao encontrado." });
  const p = req.body;
  if (req.file?.buffer) {
    db.prepare(`
      UPDATE products SET name=?, brand=?, style=?, type=?, price=?, quantity=?, expiration_date=?, image=? WHERE id=?
    `).run(p.name, p.brand, p.style, p.type, Number(p.price || 0), Number(p.quantity || 0), p.expiration_date || "", req.file.buffer, id);
  } else {
    db.prepare(`
      UPDATE products SET name=?, brand=?, style=?, type=?, price=?, quantity=?, expiration_date=? WHERE id=?
    `).run(p.name, p.brand, p.style, p.type, Number(p.price || 0), Number(p.quantity || 0), p.expiration_date || "", id);
  }
  scheduleStoreBackup("produto atualizado");
  res.json({ ok: true });
});

app.delete("/api/products/:id", requireAuth, requireStaff, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  scheduleStoreBackup("produto removido");
  res.json({ ok: true });
});

app.get("/api/users", requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT id, username, role, name, birth_date, email, phone, cpf, preferred_type, preferred_brand, preferred_style
    FROM users ORDER BY id
  `).all();
  res.json(rows);
});

app.post("/api/users", requireAuth, requireAdmin, (req, res) => {
  const user = req.body || {};
  if (!user.username || !user.password) return res.status(400).json({ error: "Usuario e senha sao obrigatorios." });
  const hash = bcrypt.hashSync(user.password, 10);
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password, role, name, birth_date, email, phone, cpf, preferred_type, preferred_brand, preferred_style)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.username, hash, safeRole(user.role), user.name || user.username, user.birth_date || "", user.email || "", user.phone || "", user.cpf || "", user.preferred_type || "", user.preferred_brand || "", user.preferred_style || "");
    scheduleStoreBackup("usuario cadastrado");
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: "Usuario ja existe." });
  }
});

app.get("/api/dashboard", requireAuth, requireStaff, (_req, res) => {
  const products = productList();
  const sales = saleRows(50);
  const totalStock = products.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalStockValue = products.reduce((sum, row) => sum + Number(row.price || 0) * Number(row.quantity || 0), 0);
  const totalSold = db.prepare("SELECT COALESCE(SUM(quantity), 0) AS total FROM sales").get().total;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_value), 0) AS total FROM sales").get().total;
  const today = new Date();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const birthdays = db.prepare(`
    SELECT id, name, phone, email, birth_date FROM users
    WHERE role = 'cliente' AND birth_date IS NOT NULL AND birth_date != '' AND substr(birth_date, 6, 5) = ?
  `).all(monthDay);
  res.json({ totalStock, totalStockValue, totalSold, totalRevenue, sales, birthdays });
});

app.get("/api/sales", requireAuth, requireStaff, (_req, res) => {
  res.json(saleRows(500));
});

app.post("/api/sales", requireAuth, (req, res) => {
  const items = Array.isArray(req.body.items)
    ? req.body.items
    : [{ product_id: req.body.product_id, quantity: req.body.quantity }];
  const customer = req.body.customer || {};
  if (!items.length) return res.status(400).json({ error: "Nenhum item informado." });

  const tx = () => withTransaction(() => {
    const soldItems = [];
    let total = 0;
    for (const item of items) {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(item.product_id));
      const qty = Number(item.quantity || 0);
      if (!product) throw new Error("Produto nao encontrado.");
      if (qty <= 0) throw new Error("Quantidade invalida.");
      if (Number(product.quantity || 0) < qty) throw new Error(`Estoque insuficiente para ${product.name}.`);
      const subtotal = Number(product.price || 0) * qty;
      db.prepare("UPDATE products SET quantity = quantity - ? WHERE id = ?").run(qty, product.id);
      db.prepare("INSERT INTO sales (product_id, quantity, total_value, user_id) VALUES (?, ?, ?, ?)")
        .run(product.id, qty, subtotal, req.user.id);
      soldItems.push({ id: product.id, name: product.name, brand: product.brand, price: product.price, quantity: qty, subtotal });
      total += subtotal;
    }
    const message = buildWhatsappMessage({ items: soldItems, customer, userName: req.user.name, total });
    const whatsappUrl = `https://wa.me/${storeWhatsapp}?text=${encodeURIComponent(message)}`;
    return { items: soldItems, total, message, whatsappUrl };
  });

  try {
    const result = tx();
    scheduleStoreBackup("venda registrada");
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/import/csv", requireAuth, requireStaff, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo CSV nao enviado." });
  const text = req.file.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  let imported = 0;
  let failed = 0;
  const errors = [];

  const upsert = db.prepare(`
    INSERT INTO products (id, name, brand, style, type, price, quantity, expiration_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, brand=excluded.brand, style=excluded.style, type=excluded.type,
      price=excluded.price, quantity=excluded.quantity, expiration_date=excluded.expiration_date
  `);
  const insert = db.prepare(`
    INSERT INTO products (name, brand, style, type, price, quantity, expiration_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = () => withTransaction(() => {
    rows.forEach((row, index) => {
      try {
        const name = row.nome || row.name;
        if (!name?.trim()) throw new Error("nome vazio");
        const id = row.id ? Number(row.id) : null;
        const values = [
          name.trim(),
          row.marca || row.brand || "Outra",
          row.estilo || row.style || "Outro",
          row.tipo || row.type || "Outro",
          Number(String(row.preco || row.price || 0).replace(",", ".")),
          Number(row.quantidade || row.quantity || 0),
          row.data_validade || row.expiration_date || ""
        ];
        if (id) upsert.run(id, ...values);
        else insert.run(...values);
        imported += 1;
      } catch (error) {
        failed += 1;
        errors.push(`Linha ${index + 2}: ${error.message}`);
      }
    });
  });
  tx();
  if (imported > 0) scheduleStoreBackup("produtos importados por CSV");
  res.json({ imported, failed, errors });
});

app.post("/api/import/database", requireAuth, requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Banco .db nao enviado." });
  const tmpPath = path.join(dataDir, `import-${Date.now()}.db`);
  fs.writeFileSync(tmpPath, req.file.buffer);
  let products = 0;
  let users = 0;
  let sales = 0;
  try {
    db.exec(`ATTACH DATABASE '${tmpPath.replaceAll("'", "''")}' AS incoming;`);
    const tx = () => withTransaction(() => {
      const incomingProducts = db.prepare("SELECT id, name, brand, style, type, price, quantity, expiration_date, image FROM incoming.products").all();
      const upsertProduct = db.prepare(`
        INSERT INTO products (id, name, brand, style, type, price, quantity, expiration_date, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, brand=excluded.brand, style=excluded.style, type=excluded.type,
          price=excluded.price, quantity=excluded.quantity, expiration_date=excluded.expiration_date,
          image=COALESCE(excluded.image, products.image)
      `);
      incomingProducts.forEach((p) => {
        upsertProduct.run(p.id, p.name, p.brand, p.style, p.type, p.price, p.quantity, p.expiration_date, p.image);
        products += 1;
      });

      const incomingUsers = db.prepare("SELECT username, password, role, name, birth_date, email, phone, cpf, profile_image, preferred_type, preferred_brand, preferred_style FROM incoming.users").all();
      const upsertUser = db.prepare(`
        INSERT INTO users (username, password, role, name, birth_date, email, phone, cpf, profile_image, preferred_type, preferred_brand, preferred_style)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          role=excluded.role, name=excluded.name, birth_date=excluded.birth_date, email=excluded.email,
          phone=excluded.phone, cpf=excluded.cpf, profile_image=COALESCE(excluded.profile_image, users.profile_image),
          preferred_type=excluded.preferred_type, preferred_brand=excluded.preferred_brand, preferred_style=excluded.preferred_style
      `);
      incomingUsers.forEach((u) => {
        upsertUser.run(u.username, u.password, u.role, u.name, u.birth_date, u.email, u.phone, u.cpf, u.profile_image, u.preferred_type, u.preferred_brand, u.preferred_style);
        users += 1;
      });

      const incomingSales = db.prepare("SELECT id, product_id, quantity, total_value, sale_date, user_id FROM incoming.sales").all();
      const upsertSale = db.prepare(`
        INSERT OR IGNORE INTO sales (id, product_id, quantity, total_value, sale_date, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      incomingSales.forEach((s) => {
        const result = upsertSale.run(s.id, s.product_id, s.quantity, s.total_value, s.sale_date, s.user_id);
        if (result.changes) sales += 1;
      });
    });
    tx();
    db.exec("DETACH DATABASE incoming;");
    if (products > 0 || users > 0 || sales > 0) scheduleStoreBackup("banco importado");
    res.json({ products, users, sales });
  } catch (error) {
    try { db.exec("DETACH DATABASE incoming;"); } catch {}
    res.status(400).json({ error: `Falha ao importar banco: ${error.message}` });
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

app.get("/api/export/products.csv", requireAuth, requireStaff, (_req, res) => {
  const rows = productList();
  const header = ["id", "nome", "marca", "estilo", "tipo", "preco", "quantidade", "data_validade"];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [header.join(";"), ...rows.map((p) => [
    p.id, p.name, p.brand, p.style, p.type, p.price, p.quantity, p.expiration_date
  ].map(escape).join(";"))].join("\n");
  res.setHeader("Content-Disposition", "attachment; filename=produtos.csv");
  res.type("text/csv").send(csv);
});

if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const dist = path.join(rootDir, "dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(dist, "index.html"));
  });
}

const port = Number(process.env.PORT || 3001);
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`API Cores & Fragrancias rodando em http://localhost:${port}`);
    if (isGithubDbSyncEnabled()) {
      console.log("Sincronizacao automatica do banco com GitHub ativada.");
    }
  });
}

export default app;
