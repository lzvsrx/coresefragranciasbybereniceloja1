import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3, Download, Edit3, FileUp, LogOut, PackagePlus, Search,
  ShoppingCart, Trash2, Upload, UserPlus, Users, WalletCards
} from "lucide-react";
import "./styles.css";

const API = "";

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function useAuth() {
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem("cf-auth");
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed?.token || !parsed?.user?.role) {
        localStorage.removeItem("cf-auth");
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem("cf-auth");
      return null;
    }
  });

  const save = (next) => {
    setAuth(next);
    if (next) localStorage.setItem("cf-auth", JSON.stringify(next));
    else localStorage.removeItem("cf-auth");
  };

  return [auth, save];
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset = () => {
    localStorage.removeItem("cf-auth");
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="login-shell">
        <div className="login-panel">
          <img className="login-logo" src="/logo1.jpeg" alt="Cores & Fragrancias by Berenice" />
          <h1>Cores & Fragrancias</h1>
          <div className="alert error">
            O navegador guardou uma sessao antiga ou houve erro ao abrir a tela. Clique em limpar e entrar novamente.
          </div>
          <button className="primary" type="button" onClick={this.reset}>Limpar sessao e reabrir</button>
          <small>{String(this.state.error?.message || "")}</small>
        </div>
      </main>
    );
  }
}

function request(auth, url, options = {}) {
  const { reloadOnUnauthorized = true, ...fetchOptions } = options;
  return fetch(`${API}${url}`, {
    ...fetchOptions,
    headers: {
      ...(fetchOptions.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(fetchOptions.headers || {})
    }
  }).then(async (res) => {
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : await res.text();
    if (res.status === 401 && reloadOnUnauthorized) {
      localStorage.removeItem("cf-auth");
      window.location.reload();
      throw new Error("Sessao expirada. Entre novamente.");
    }
    if (!res.ok) throw new Error(data?.error || "Erro na requisicao.");
    return data;
  });
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: "admin", password: "admin123" });
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await request(null, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
        reloadOnUnauthorized: false
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <img className="login-logo" src="/logo1.jpeg" alt="Cores & Fragrancias by Berenice" />
        <h1>Cores & Fragrancias</h1>
        <p>by Berenice</p>
        <label>Usuario<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label>Senha<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary" type="submit">Entrar</button>
        <small>Admin padrao: admin / admin123</small>
      </form>
    </main>
  );
}

function App() {
  const [auth, setAuth] = useAuth();
  const [view, setView] = useState("catalog");

  if (!auth?.token || !auth?.user?.role) return <Login onLogin={setAuth} />;

  const tabs = [
    ["catalog", "Catalogo"],
    ...(auth.user.role !== "cliente" ? [["dashboard", "Dashboard"], ["products", "Produtos"]] : []),
    ...(auth.user.role === "admin" ? [["users", "Usuarios"]] : [])
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img className="brand-logo" src="/logo1.jpeg" alt="Cores & Fragrancias by Berenice" />
        <div>
          <strong>{auth.user.name || auth.user.username}</strong>
          <span>{auth.user.role}</span>
        </div>
        <nav>
          {tabs.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
        </nav>
        <button className="ghost logout" onClick={() => setAuth(null)}><LogOut size={18} /> Sair</button>
      </aside>
      <main className="content">
        {view === "catalog" && <Catalog auth={auth} />}
        {view === "dashboard" && <Dashboard auth={auth} />}
        {view === "products" && <Products auth={auth} />}
        {view === "users" && <UsersPage auth={auth} />}
      </main>
    </div>
  );
}

function Catalog({ auth }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: auth.user.name || "", phone: "", email: "" });
  const [notice, setNotice] = useState("");

  async function load() {
    setProducts(await request(auth, `/api/products?search=${encodeURIComponent(search)}`));
  }
  useEffect(() => { load(); }, [search]);

  const total = cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0);

  function add(product) {
    if (product.quantity <= 0) return;
    setCart((items) => {
      const existing = items.find((item) => item.id === product.id);
      if (existing) return items.map((item) => item.id === product.id ? { ...item, cartQuantity: Math.min(item.cartQuantity + 1, item.stock) } : item);
      return [...items, { ...product, stock: product.quantity, cartQuantity: 1 }];
    });
  }

  async function checkout() {
    setNotice("");
    try {
      const data = await request(auth, "/api/sales", {
        method: "POST",
        body: JSON.stringify({ customer, items: cart.map((item) => ({ product_id: item.id, quantity: item.cartQuantity })) })
      });
      setCart([]);
      await load();
      setNotice(`Venda registrada: ${money(data.total)}. Abrindo WhatsApp com os detalhes.`);
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <section>
      <Header title="Catalogo" subtitle="Produtos, valores e estoque do banco atual." />
      <div className="toolbar">
        <div className="search"><Search size={18} /><input placeholder="Buscar produto, marca, tipo..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>
      <div className="catalog-layout">
        <div className="product-grid">
          {products.map((p) => <ProductCard key={p.id} product={p} onAdd={() => add(p)} />)}
        </div>
        <aside className="cart-panel">
          <h2><ShoppingCart size={20} /> Carrinho</h2>
          <label>Cliente<input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></label>
          <label>Telefone<input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></label>
          <label>Email<input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></label>
          <div className="cart-items">
            {cart.map((item) => (
              <div className="cart-row" key={item.id}>
                <span>{item.name}</span>
                <input type="number" min="1" max={item.stock} value={item.cartQuantity} onChange={(e) => setCart(cart.map((x) => x.id === item.id ? { ...x, cartQuantity: Math.min(Number(e.target.value), x.stock) } : x))} />
                <button className="icon" onClick={() => setCart(cart.filter((x) => x.id !== item.id))}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <strong className="total">{money(total)}</strong>
          {notice && <div className={`alert ${notice.includes("registrada") ? "ok" : "error"}`}>{notice}</div>}
          <button className="primary" disabled={!cart.length} onClick={checkout}><WalletCards size={18} /> Finalizar e avisar WhatsApp</button>
        </aside>
      </div>
    </section>
  );
}

function ProductCard({ product, onAdd }) {
  return (
    <article className="product-card">
      <div className="photo">
        {product.hasImage ? <img src={`/api/products/${product.id}/image`} alt={product.name} loading="lazy" /> : <span>Sem imagem</span>}
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        <p>{product.brand} | {product.style} | {product.type}</p>
        <div className="price">{money(product.price)}</div>
        <div className={product.quantity > 0 ? "stock" : "stock out"}>{product.quantity > 0 ? `Disponivel: ${product.quantity}` : "Esgotado"}</div>
        <button className="secondary" disabled={product.quantity <= 0} onClick={onAdd}><ShoppingCart size={17} /> Adicionar</button>
      </div>
    </article>
  );
}

function Header({ title, subtitle }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

function Dashboard({ auth }) {
  const [data, setData] = useState(null);
  useEffect(() => { request(auth, "/api/dashboard").then(setData); }, []);
  if (!data) return <div className="loading">Carregando...</div>;
  return (
    <section>
      <Header title="Dashboard" subtitle="Visao geral de estoque, vendas e aniversariantes." />
      {!!data.birthdays.length && <div className="alert birthday">Hoje e aniversario de {data.birthdays.length} cliente(s): {data.birthdays.map((b) => b.name).join(", ")}</div>}
      <div className="metrics">
        <Metric icon={<PackagePlus />} label="Produtos em estoque" value={data.totalStock} />
        <Metric icon={<ShoppingCart />} label="Produtos vendidos" value={data.totalSold} />
        <Metric icon={<BarChart3 />} label="Valor em estoque" value={money(data.totalStockValue)} />
        <Metric icon={<WalletCards />} label="Receita vendida" value={money(data.totalRevenue)} />
      </div>
      <h2>Ultimas vendas</h2>
      <DataTable rows={data.sales} columns={["id", "product_name", "quantity", "total_value", "sale_date", "user_name"]} moneyCols={["total_value"]} />
    </section>
  );
}

function Metric({ icon, label, value }) {
  return <div className="metric">{React.cloneElement(icon, { size: 24 })}<span>{label}</span><strong>{value}</strong></div>;
}

function Products({ auth }) {
  const [meta, setMeta] = useState({ marcas: [], estilos: [], tipos: [] });
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const empty = { name: "", brand: "Outra", style: "Outro", type: "Outro", price: 0, quantity: 1, expiration_date: todayIso() };

  async function load() {
    setProducts(await request(auth, `/api/products?search=${encodeURIComponent(search)}`));
  }
  async function loadStats() {
    setStats(await request(auth, "/api/dashboard"));
  }
  useEffect(() => { request(auth, "/api/meta").then(setMeta); }, []);
  useEffect(() => { load(); }, [search]);
  useEffect(() => { loadStats(); }, []);

  async function saveProduct(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const id = fd.get("id");
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/products/${id}` : "/api/products";
    await request(auth, url, { method, body: fd });
    form.reset();
    setEditing(null);
    setMessage("Produto salvo com sucesso.");
    await load();
    await loadStats();
  }

  async function removeProduct(id) {
    if (!confirm("Excluir este produto?")) return;
    await request(auth, `/api/products/${id}`, { method: "DELETE" });
    await load();
    await loadStats();
  }

  async function markSold(product) {
    if (Number(product.quantity || 0) <= 0) {
      setMessage("Este produto esta sem estoque para marcar como vendido.");
      return;
    }

    const rawQty = prompt(`Quantidade vendida de "${product.name}"`, "1");
    if (rawQty === null) return;

    const quantity = Number(rawQty.replace(",", "."));
    if (!Number.isInteger(quantity) || quantity < 1) {
      setMessage("Informe uma quantidade inteira maior que zero.");
      return;
    }
    if (quantity > Number(product.quantity || 0)) {
      setMessage(`Estoque insuficiente. Disponivel: ${product.quantity}.`);
      return;
    }

    try {
      const sale = await request(auth, "/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customer: { name: "Venda no balcao", phone: "", email: "" },
          items: [{ product_id: product.id, quantity }]
        })
      });
      setMessage(`${quantity} item(ns) vendido(s): ${product.name}. Total desta venda: ${money(sale.total)}.`);
      await load();
      await loadStats();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const data = await request(auth, "/api/import/csv", { method: "POST", body: fd });
    setMessage(`${data.imported} produto(s) importados. ${data.failed} falha(s).`);
    await load();
    await loadStats();
  }

  async function importDb(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const data = await request(auth, "/api/import/database", { method: "POST", body: fd });
    setMessage(`Banco importado: ${data.products} produtos, ${data.users} usuarios, ${data.sales} vendas.`);
    await load();
    await loadStats();
  }

  async function exportCsv() {
    const res = await fetch("/api/export/products.csv", { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error("Falha ao exportar CSV.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "produtos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <Header title="Produtos" subtitle="Cadastro, estoque, importacao e exportacao." />
      {message && <div className="alert ok">{message}</div>}
      {stats && (
        <div className="metrics compact-metrics">
          <Metric icon={<ShoppingCart />} label="Produtos vendidos" value={stats.totalSold} />
          <Metric icon={<WalletCards />} label="Valor total vendido" value={money(stats.totalRevenue)} />
          <Metric icon={<PackagePlus />} label="Produtos em estoque" value={stats.totalStock} />
          <Metric icon={<BarChart3 />} label="Valor em estoque" value={money(stats.totalStockValue)} />
        </div>
      )}
      <form key={editing?.id || "new"} className="product-form" onSubmit={saveProduct}>
        <input type="hidden" name="id" value={editing?.id || ""} />
        <label>Nome<input name="name" defaultValue={editing?.name || empty.name} required /></label>
        <label>Marca<Select name="brand" options={meta.marcas} value={editing?.brand || empty.brand} /></label>
        <label>Estilo<Select name="style" options={meta.estilos} value={editing?.style || empty.style} /></label>
        <label>Tipo<Select name="type" options={meta.tipos} value={editing?.type || empty.type} /></label>
        <label>Preco<input name="price" type="number" step="0.01" min="0" defaultValue={editing?.price || empty.price} /></label>
        <label>Quantidade<input name="quantity" type="number" step="1" min="0" defaultValue={editing?.quantity ?? empty.quantity} /></label>
        <label>Validade<input name="expiration_date" type="date" defaultValue={editing?.expiration_date || empty.expiration_date} /></label>
        <label>Imagem<input name="image" type="file" accept="image/png,image/jpeg" /></label>
        <button className="primary" type="submit"><PackagePlus size={18} /> {editing ? "Salvar" : "Cadastrar"}</button>
        {editing && <button className="ghost" type="button" onClick={() => setEditing(null)}>Cancelar</button>}
      </form>
      <div className="toolbar">
        <div className="search"><Search size={18} /><input placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="secondary" type="button" onClick={exportCsv}><Download size={18} /> CSV</button>
        <label className="secondary file-button"><Upload size={18} /> Importar CSV<input hidden type="file" accept=".csv,text/csv" onChange={importCsv} /></label>
        {auth.user.role === "admin" && <label className="secondary file-button"><FileUp size={18} /> Importar DB<input hidden type="file" accept=".db,.sqlite" onChange={importDb} /></label>}
      </div>
      <div className="admin-grid">
        {products.map((p) => (
          <article className="admin-product" key={p.id}>
            {p.hasImage && <img src={`/api/products/${p.id}/image`} alt="" loading="lazy" />}
            <strong>{p.name}</strong>
            <span>{p.brand} | {p.type}</span>
            <b>{money(p.price)} | Estoque {p.quantity}</b>
            <div className="row-actions">
              <button className="sold-button" disabled={Number(p.quantity || 0) <= 0} onClick={() => markSold(p)}><WalletCards size={17} /> Vendido</button>
              <button className="icon" onClick={() => setEditing(p)}><Edit3 size={17} /></button>
              <button className="icon danger" onClick={() => removeProduct(p.id)}><Trash2 size={17} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Select({ name, options, value }) {
  return <select name={name} defaultValue={value}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}

function UsersPage({ auth }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const load = () => request(auth, "/api/users").then(setUsers);
  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await request(auth, "/api/users", { method: "POST", body: JSON.stringify(data) });
    e.currentTarget.reset();
    setMessage("Usuario criado.");
    await load();
  }

  return (
    <section>
      <Header title="Usuarios" subtitle="Clientes, funcionarios e administradores." />
      {message && <div className="alert ok">{message}</div>}
      <form className="product-form" onSubmit={createUser}>
        <label>Usuario<input name="username" required /></label>
        <label>Senha<input name="password" type="password" required /></label>
        <label>Funcao<select name="role"><option value="cliente">cliente</option><option value="funcionario">funcionario</option><option value="admin">admin</option></select></label>
        <label>Nome<input name="name" /></label>
        <label>Nascimento<input name="birth_date" type="date" /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>Telefone<input name="phone" /></label>
        <label>CPF<input name="cpf" /></label>
        <button className="primary"><UserPlus size={18} /> Criar</button>
      </form>
      <h2><Users size={20} /> Usuarios existentes</h2>
      <DataTable rows={users} columns={["id", "username", "role", "name", "email", "phone", "birth_date"]} />
    </section>
  );
}

function DataTable({ rows, columns, moneyCols = [] }) {
  if (!rows?.length) return <div className="empty">Sem registros.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || idx}>{columns.map((col) => <td key={col}>{moneyCols.includes(col) ? money(row[col]) : String(row[col] ?? "")}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
