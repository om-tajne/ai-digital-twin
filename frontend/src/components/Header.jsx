import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "./Header.css";

const Header = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
              <form className="header-search-form" onSubmit={(e) => e.preventDefault()}>
                <div className="search-input-wrapper">
                  <i className="bi bi-search search-icon"></i>
                  <input
                    type="search"
                    className="form-control header-search-input"
                    placeholder="Search..."
                  />
                </div>
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