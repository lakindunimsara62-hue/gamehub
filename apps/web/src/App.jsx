
import React, { useEffect, useMemo, useState } from "react";

const API = "http://127.0.0.1:4000";

const fallback = [
  { id:"demo-1", name:"Pixel Quest", category:"Game", description:"A sample adventure game listing.", version:"1.0", size:"Demo" },
  { id:"demo-2", name:"Open Paint", category:"Software", description:"A sample creative software listing.", version:"2.1", size:"Demo" },
  { id:"demo-3", name:"Racing Legends", category:"Game", description:"A sample racing game listing.", version:"1.2", size:"Demo" }
];

export default function App() {
  const [items, setItems] = useState(fallback);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("All");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminConfigured, setAdminConfigured] = useState(null);
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [adminBusy, setAdminBusy] = useState(false);

  async function refresh() {
    try {
      const res = await fetch(`${API}/api/items`);
      if (!res.ok) throw new Error("API unavailable");

      const data = await res.json();
      setItems(data.length ? data : fallback);
    } catch {
      setNotice("Could not connect to GameHub API.");
    }
  }

  async function checkAdmin() {
    try {
      const res = await fetch(`${API}/api/admin/status`);
      const data = await res.json();
      setAdminConfigured(data.configured);
    } catch {
      setAdminConfigured(null);
    }
  }

  useEffect(() => {
    refresh();
    checkAdmin();
  }, []);

  const shown = useMemo(() => items.filter(x =>
    (tab === "All" || x.category === tab) &&
    `${x.name} ${x.description} ${x.category}`
      .toLowerCase().includes(query.toLowerCase())
  ), [items, query, tab]);

  async function upload(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setUploading(true);
    setNotice("");

    try {
      const res = await fetch(`${API}/api/upload`, {
        method: "POST",
        body: new FormData(form)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Upload failed");

      setNotice("Upload received. It is waiting for admin approval.");
      form.reset();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function loadPending(authToken) {
    const res = await fetch(`${API}/api/admin/pending`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load uploads.");

    setPending(data);
  }

  async function loadApproved() {
    const res = await fetch(`${API}/api/items`);
    const data = await res.json();

    if (!res.ok) throw new Error("Could not load approved files.");

    setApproved(data);
  }

  async function adminLogin(e) {
    e.preventDefault();
    setAdminBusy(true);
    setNotice("");

    try {
      if (adminConfigured === false) {
        const setupRes = await fetch(`${API}/api/admin/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });

        const setupData = await setupRes.json();
        if (!setupRes.ok) throw new Error(setupData.error || "Setup failed");

        setAdminConfigured(true);
      }

      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      setToken(data.token);

      await Promise.all([
        loadPending(data.token),
        loadApproved()
      ]);

      setPassword("");
      setNotice("Admin login successful.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function adminAction(id, action) {
    setAdminBusy(true);
    setNotice("");

    try {
      const res = await fetch(`${API}/api/admin/${action}/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      await Promise.all([
        loadPending(token),
        loadApproved(),
        refresh()
      ]);

      setNotice(action === "approve" ? "Upload approved!" : "Upload rejected.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function deleteApproved(id, name) {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${name}"?`
    );

    if (!confirmed) return;

    setAdminBusy(true);
    setNotice("");

    try {
      const res = await fetch(`${API}/api/admin/delete/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed.");

      await Promise.all([
        loadApproved(),
        refresh()
      ]);

      setNotice("File deleted successfully.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function refreshAdmin() {
    setAdminBusy(true);

    try {
      await Promise.all([
        loadPending(token),
        loadApproved(),
        refresh()
      ]);
      setNotice("Uploads refreshed.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function logout() {
    setToken("");
    setPending([]);
    setApproved([]);
    setAdminOpen(false);
    setNotice("Admin logged out.");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">G</span> GAMEHUB
        </a>

        <nav>
          <a href="#store">Store</a>
          <a href="#upload">Upload</a>
          <a href="#about">About</a>
          <a href="#admin" onClick={() => setAdminOpen(true)}>Admin</a>
        </nav>

        <span className="platform">WINDOWS 10 / 11</span>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">YOUR DIGITAL LIBRARY</p>
            <h1>Games and software.<br /><span>All in one place.</span></h1>

            <p className="sub">
              Discover community uploads, browse your next favourite game,
              and keep your downloads organised.
            </p>

            <a className="primary" href="#store">
              Explore the store <b>↗</b>
            </a>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="orb orb-a"></div>
            <div className="orb orb-b"></div>
            <div className="console">
              <div className="screen">GH<span>+</span></div>
              <div className="controller"><i></i><i></i></div>
            </div>
            <div className="float-card">✦ &nbsp; DISCOVER MORE</div>
          </div>
        </section>

        <section id="store" className="store section">
          <div className="section-head">
            <div>
              <p className="eyebrow">THE CATALOGUE</p>
              <h2>Explore the library</h2>
            </div>

            <input
              className="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search games & software..."
              aria-label="Search catalogue"
            />
          </div>

          <div className="filters">
            {["All", "Game", "Software"].map(t => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="cards">
            {shown.map((item, i) => (
              <article className="item-card" key={item.id}>
                <div className={`cover cover-${i % 3}`}>
                  <span>{item.category === "Game" ? "🎮" : "🧰"}</span>
                  <small>{item.category.toUpperCase()}</small>
                </div>

                <div className="item-info">
                  <div className="item-title">
                    <h3>{item.name}</h3>
                    <span>v{item.version || "1.0"}</span>
                  </div>

                  <p>{item.description}</p>

                  <div className="item-foot">
                    <small>{item.size || "File size varies"}</small>

                    {item.downloadUrl ? (
                      <a className="download" href={`${API}${item.downloadUrl}`}>
                        Download ↓
                      </a>
                    ) : (
                      <button
                        className="download"
                        onClick={() => setNotice("This is a sample listing.")}
                      >
                        Details ↗
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {!shown.length && <p className="empty">No matching items found.</p>}
          </div>
        </section>

        <section id="upload" className="upload-section section">
          <div>
            <p className="eyebrow">SHARE WITH THE COMMUNITY</p>
            <h2>Have something<br />worth sharing?</h2>

            <p className="sub">
              Upload software or games you own or are authorised to distribute.
              Every upload stays private until it is reviewed.
            </p>
          </div>

          <form className="upload-form" onSubmit={upload}>
            <label>
              Title
              <input name="name" required maxLength="80" placeholder="e.g. My Indie Game" />
            </label>

            <div className="form-row">
              <label>
                Type
                <select name="category">
                  <option>Game</option>
                  <option>Software</option>
                </select>
              </label>

              <label>
                Version
                <input name="version" placeholder="1.0" />
              </label>
            </div>

            <label>
              Description
              <textarea name="description" required maxLength="500" placeholder="What does it do?" />
            </label>

            <label>
              Download file
              <input name="file" type="file" required />
            </label>

            <button className="primary full" disabled={uploading}>
              {uploading ? "Uploading..." : "Submit for review ↑"}
            </button>

            <small className="hint">
              Only upload files you own or are authorised to distribute.
            </small>
          </form>
        </section>

        {adminOpen && (
          <section id="admin" className="section" style={{
            background: "#151b2b",
            color: "white",
            padding: "32px",
            borderRadius: "16px",
            margin: "30px 0"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap"
            }}>
              <div>
                <p className="eyebrow">GAMEHUB CONTROL PANEL</p>
                <h2 style={{ color: "white" }}>Admin Dashboard</h2>
              </div>

              <button onClick={() => setAdminOpen(false)}>Close</button>
            </div>

            {!token ? (
              <form onSubmit={adminLogin} style={{
                maxWidth: "420px",
                display: "grid",
                gap: "14px",
                marginTop: "24px"
              }}>
                <h3>
                  {adminConfigured === false
                    ? "Create Admin Password"
                    : "Admin Login"}
                </h3>

                <p>
                  {adminConfigured === false
                    ? "First time? Create a password with at least 8 characters."
                    : "Enter your admin password to manage uploads."}
                </p>

                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength="8"
                  required
                  placeholder="Admin password"
                  style={{ padding: "12px", borderRadius: "8px" }}
                />

                <button className="primary" disabled={adminBusy}>
                  {adminBusy
                    ? "Please wait..."
                    : adminConfigured === false
                      ? "Create Password & Login"
                      : "Login"}
                </button>
              </form>
            ) : (
              <div style={{ marginTop: "24px" }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap"
                }}>
                  <h3>Admin Controls</h3>
                  <button onClick={logout}>Logout</button>
                </div>

                <button onClick={refreshAdmin} disabled={adminBusy}>
                  {adminBusy ? "Please wait..." : "Refresh uploads"}
                </button>

                <div style={{ marginTop: "24px" }}>
                  <h3>Pending Uploads ({pending.length})</h3>

                  {pending.length === 0 ? (
                    <p>No pending uploads.</p>
                  ) : (
                    <div style={{
                      display: "grid",
                      gap: "14px",
                      marginTop: "18px"
                    }}>
                      {pending.map(item => (
                        <div key={item.id} style={{
                          background: "#222b40",
                          padding: "18px",
                          borderRadius: "12px"
                        }}>
                          <h3>{item.name}</h3>
                          <p>{item.description}</p>
                          <p>
                            {item.category} · v{item.version} · {item.size}
                          </p>
                          <p>File: {item.originalName}</p>

                          <div style={{
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap"
                          }}>
                            <button
                              disabled={adminBusy}
                              onClick={() => adminAction(item.id, "approve")}
                            >
                              Approve
                            </button>

                            <button
                              disabled={adminBusy}
                              onClick={() => adminAction(item.id, "reject")}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "32px" }}>
                  <h3>Approved Files ({approved.length})</h3>

                  {approved.length === 0 ? (
                    <p>No approved files.</p>
                  ) : (
                    <div style={{
                      display: "grid",
                      gap: "14px",
                      marginTop: "18px"
                    }}>
                      {approved.map(item => (
                        <div key={item.id} style={{
                          background: "#222b40",
                          padding: "18px",
                          borderRadius: "12px"
                        }}>
                          <h3>{item.name}</h3>
                          <p>{item.description}</p>
                          <p>
                            {item.category} · v{item.version} · {item.size}
                          </p>
                          <p>Downloads: {item.downloads || 0}</p>

                          <button
                            disabled={adminBusy}
                            onClick={() => deleteApproved(item.id, item.name)}
                            style={{
                              background: "#b42332",
                              color: "white",
                              padding: "10px 16px",
                              border: "none",
                              borderRadius: "8px",
                              cursor: "pointer"
                            }}
                          >
                            Delete file
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
      </main>

      <footer id="about">
        <span className="brand">
          <span className="brand-mark">G</span> GAMEHUB
        </span>
        <span>Community-powered downloads · Windows 10 / 11</span>
        <span>© 2026 GameHub concept</span>
      </footer>
    </div>
  );
}
