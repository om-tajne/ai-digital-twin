import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { FASTAPI_API_URL } from "../config";
import "./Header.css";

const Header = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [topics, setTopics] = useState([]);
  const searchRef = useRef(null);

  const navLinks = [
    { path: "/", label: "Home", icon: "bi-house-door" },
    { path: "/library", label: "Library", icon: "bi-book" },
    { path: "/test", label: "Test Practice", icon: "bi-pencil-square" },
    { path: "/dashboard", label: "Top Struggles", icon: "bi-bar-chart-line" },
    { path: "/study-planner", label: "Study Planner", icon: "bi-calendar-check" },
    { path: "/payment", label: "Pro Plan", icon: "bi-credit-card" },
    { path: "/parents-dashboard", label: "Parents Dashboard", icon: "bi-people" },
    { path: "/student-profile", label: "Student Profile", icon: "bi-person-circle" },
  ];

  const studentId = user?.student_id || user?.id;

  // Load the student's topics once so search can jump straight to practice
  useEffect(() => {
    if (!studentId || !searchOpen) return;
    let cancelled = false;
    fetch(`${FASTAPI_API_URL}/mastery/${studentId}`)
      .then((r) => (r.ok ? r.json() : { mastery: [] }))
      .then((d) => {
        if (!cancelled) setTopics(Array.isArray(d?.mastery) ? d.mastery : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studentId, searchOpen]);

  useEffect(() => {
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const pageHits = navLinks
      .filter((l) => l.label.toLowerCase().includes(q))
      .map((l) => ({
        key: `page-${l.path}`,
        icon: l.icon,
        label: l.label,
        hint: "Page",
        go: () => navigate(l.path),
      }));

    const seen = new Set();
    const topicHits = topics
      .filter((t) => (t.topic || "").toLowerCase().includes(q))
      .filter((t) => {
        const k = (t.topic || "").toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 6)
      .map((t) => ({
        key: `topic-${t.mastery_id}`,
        icon: "bi-lightning-charge-fill",
        label: `Practice ${t.topic}`,
        hint: `${Math.round(t.percentage ?? 0)}% mastery`,
        go: () =>
          navigate(
            `/test?topic=${encodeURIComponent(t.topic)}&subject=${encodeURIComponent(
              t.subject || "General"
            )}`
          ),
      }));

    return [...pageHits, ...topicHits];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, topics]);

  const runResult = (item) => {
    if (!item) return;
    item.go();
    setQuery("");
    setSearchOpen(false);
    setIsMobileMenuOpen(false);
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  return (
    <header className="header-navbar sticky-top">
      <div className="container-fluid px-3 px-lg-4">
        <div className="d-flex align-items-center justify-content-between py-2">
          
          {/* Brand Logo */}
          <Link to="/" className="d-flex align-items-center text-decoration-none me-3">
            <span className="brand-icon me-2">
              <i className="bi bi-cpu-fill"></i>
            </span>
            <span className="brand-text fw-bold">AI Digital Twin</span>
          </Link>

          {/* Mobile Toggler Button */}
          <button
            className="mobile-toggle-btn d-lg-none"
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation"
          >
            <i className={`bi ${isMobileMenuOpen ? "bi-x-lg" : "bi-list"}`}></i>
          </button>

          {/* Collapsible Navigation Container */}
          <div className={`nav-collapse-container ${isMobileMenuOpen ? "show" : ""}`}>
            
            {/* Main Navigation Links */}
            <nav className="mx-auto">
              <ul className="header-nav-list">
                {navLinks.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <li key={link.path}>
                      <Link
                        to={link.path}
                        className={`nav-item-custom ${isActive ? "active" : ""}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <i className={`bi ${link.icon} nav-icon`}></i>
                        <span>{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Right Action Controls: Search & Auth */}
            <div className="header-right-actions">
              
              {/* Search Bar */}
              <form
                className="header-search-form"
                ref={searchRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  runResult(results[activeIndex] || results[0]);
                }}
              >
                <div className="search-input-wrapper">
                  <i className="bi bi-search search-icon"></i>
                  <input
                    type="search"
                    className="form-control header-search-input"
                    placeholder="Search pages & topics..."
                    value={query}
                    autoComplete="off"
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={onSearchKeyDown}
                  />
                </div>

                {searchOpen && query.trim() && (
                  <ul className="header-search-results">
                    {results.length === 0 ? (
                      <li className="header-search-empty">No matches for "{query.trim()}"</li>
                    ) : (
                      results.map((item, i) => (
                        <li key={item.key}>
                          <button
                            type="button"
                            className={`header-search-item ${i === activeIndex ? "active" : ""}`}
                            onMouseEnter={() => setActiveIndex(i)}
                            onClick={() => runResult(item)}
                          >
                            <i className={`bi ${item.icon}`}></i>
                            <span className="hs-label">{item.label}</span>
                            <span className="hs-hint">{item.hint}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </form>

              {/* User Authentication Actions */}
              {!user ? (
                <div className="auth-buttons-group">
                  <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    <button className="btn btn-outline-custom">Login</button>
                  </Link>
                  <Link to="/signup" onClick={() => setIsMobileMenuOpen(false)}>
                    <button className="btn btn-primary-custom">Sign Up</button>
                  </Link>
                </div>
              ) : (
                <div className="user-profile-group">
                  <div className="user-avatar-badge me-2">
                    {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <span className="user-name-text me-3 d-none d-xl-inline">
                    {user.full_name || "User"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-custom btn-sm"
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}

            </div>

          </div>

        </div>
      </div>
    </header>
  );
};

export default Header;