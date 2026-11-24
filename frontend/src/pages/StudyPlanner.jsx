import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FASTAPI_API_URL } from "../config";

const API_BASE_URL = FASTAPI_API_URL;

const DAILY_LIMIT_OPTIONS = [30, 45, 60, 90, 120, 180];

// ============================================================
// HELPERS
// ============================================================

function getStudentId() {
  try {
    const user = JSON.parse(localStorage.getItem("user"));

    return (
      user?.student_id ||
      user?.studentId ||
      user?.id ||
      localStorage.getItem("student_id") ||
      ""
    );
  } catch {
    return localStorage.getItem("student_id") || "";
  }
}

// Local calendar date as YYYY-MM-DD (toISOString() would use UTC and
// show the wrong day for students in e.g. India after midnight).
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function formatLongDate(key) {
  return parseDateKey(key).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relativeDayLabel(key, todayKey) {
  const diff = Math.round(
    (parseDateKey(key) - parseDateKey(todayKey)) / 86400000
  );

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) {
    return parseDateKey(key).toLocaleDateString("en-IN", { weekday: "long" });
  }
  return formatLongDate(key);
}

function formatMinutes(total) {
  const mins = Number(total) || 0;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const PRIORITY_STYLES = {
  HIGH: {
    label: "High Priority",
    color: "#f87171",
    bg: "rgba(239, 68, 68, 0.15)",
    border: "rgba(239, 68, 68, 0.35)",
    bar: "#ef4444",
  },
  MEDIUM: {
    label: "Medium Priority",
    color: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.15)",
    border: "rgba(245, 158, 11, 0.35)",
    bar: "#f59e0b",
  },
  LOW: {
    label: "Low Priority",
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.15)",
    border: "rgba(56, 189, 248, 0.35)",
    bar: "#38bdf8",
  },
};

function priorityStyle(priority) {
  return PRIORITY_STYLES[String(priority || "").toUpperCase()] || PRIORITY_STYLES.LOW;
}

function normalizeTask(task) {
  return {
    id: task.schedule_id,
    topic: task.topic || "Study Task",
    subject: task.subject || "General",
    priority: String(task.priority || "LOW").toUpperCase(),
    scheduledDate: String(task.scheduled_date || "").slice(0, 10),
    duration: Number(task.estimated_minutes || 15),
    completed: Boolean(task.completed_today),
    struggleScore: Number(task.struggle_score || 0),
    repetition: Number(task.repetition || 0),
    easeFactor: Number(task.ease_factor || 2.5),
    intervalDays: Number(task.interval_days || 1),
    status: task.status || "PENDING",
  };
}

// ============================================================
// COMPONENT
// ============================================================

export default function StudyPlanner() {
  const navigate = useNavigate();
  const studentId = getStudentId();
  const todayKey = toDateKey(new Date());

  const [plan, setPlan] = useState({
    todayTasks: [],
    completedToday: [],
    allTasks: [],
  });
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [maxDailyMinutes, setMaxDailyMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyTask, setBusyTask] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  // ------------------------------------------------------------
  // LOAD PLAN
  // ------------------------------------------------------------

  const fetchPlan = async () => {
    if (!studentId) {
      setError("Student ID not found. Please log in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/revision/${studentId}/plan`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Revision plan API error:", response.status, errorText);

        // Saved login points to a student this server doesn't know
        // (e.g. the database was recreated): sign out and log in again.
        if (response.status === 404 || response.status === 400) {
          localStorage.removeItem("user");
          localStorage.removeItem("student_id");
          window.location.href = "/login";
          return;
        }

        let detail = "";
        try {
          detail = JSON.parse(errorText)?.detail || "";
        } catch {
          /* not JSON */
        }
        const serverError = new Error(detail || `Server error ${response.status}`);
        serverError.status = response.status;
        throw serverError;
      }

      const data = await response.json();

      if (data.max_daily_minutes !== undefined) {
        setMaxDailyMinutes(Number(data.max_daily_minutes));
      }

      setPlan({
        todayTasks: (data.today_tasks || []).map(normalizeTask),
        completedToday: (data.completed_today || []).map(normalizeTask),
        allTasks: (data.all_tasks || []).map(normalizeTask),
      });
    } catch (err) {
      console.error("Revision planner fetch error:", err);

      setError(
        err.status
          ? `The server could not build your study plan (${String(err.message).slice(0, 160)}). Check the FastAPI terminal for details.`
          : `Cannot reach the backend at ${API_BASE_URL}. Make sure FastAPI is running (npm start).`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------

  // Tasks to review on the selected day (today also shows what was finished today)
  const dayTasks = useMemo(() => {
    if (selectedDate === todayKey) {
      return [...plan.todayTasks, ...plan.completedToday];
    }
    return plan.allTasks.filter((task) => task.scheduledDate === selectedDate);
  }, [plan, selectedDate, todayKey]);

  // Every future review, oldest first (completed-today tasks show their NEXT review date)
  const upcomingTasks = useMemo(
    () =>
      plan.allTasks
        .filter((task) => task.scheduledDate > todayKey)
        .sort(
          (a, b) =>
            a.scheduledDate.localeCompare(b.scheduledDate) ||
            b.struggleScore - a.struggleScore
        ),
    [plan, todayKey]
  );

  const upcomingByDate = useMemo(() => {
    const groups = new Map();
    upcomingTasks.forEach((task) => {
      if (!groups.has(task.scheduledDate)) groups.set(task.scheduledDate, []);
      groups.get(task.scheduledDate).push(task);
    });
    return [...groups.entries()];
  }, [upcomingTasks]);

  // 7-day strip: how busy each day is
  const weekStrip = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(todayKey, i);
      const tasks =
        key === todayKey
          ? plan.todayTasks
          : plan.allTasks.filter((task) => task.scheduledDate === key);
      return {
        key,
        count: tasks.length,
        minutes: tasks.reduce((sum, task) => sum + task.duration, 0),
      };
    });
  }, [plan, todayKey]);

  const completedCount = dayTasks.filter((task) => task.completed).length;
  const pendingTasks = dayTasks.filter((task) => !task.completed);
  const pendingMinutes = pendingTasks.reduce((sum, task) => sum + task.duration, 0);
  const completionPct = dayTasks.length
    ? Math.round((completedCount / dayTasks.length) * 100)
    : 0;
  const loadPct = Math.min(
    100,
    Math.round((pendingMinutes / Math.max(1, maxDailyMinutes)) * 100)
  );
  const hasAnyTasks = plan.allTasks.length > 0;

  // ------------------------------------------------------------
  // ACTIONS
  // ------------------------------------------------------------

  const reviewTask = async (task, qualityScore) => {
    setBusyTask(task.id);
    setActionError("");

    try {
      const response = await fetch(`${API_BASE_URL}/revision/${studentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: task.id,
          quality_score: qualityScore,
        }),
      });

      if (!response.ok) {
        console.error("Review API error:", response.status, await response.text());
        throw new Error(`Failed to save review (${response.status})`);
      }

      // Backend recalculates interval / next review date, so reload the plan
      await fetchPlan();
    } catch (err) {
      console.error("Complete revision error:", err);
      setActionError("Unable to save this review. Please try again.");
    } finally {
      setBusyTask(null);
    }
  };

  const changeDailyLimit = async (minutes) => {
    const previous = maxDailyMinutes;
    setMaxDailyMinutes(minutes);
    setActionError("");

    try {
      const response = await fetch(`${API_BASE_URL}/revision/${studentId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_daily_minutes: minutes }),
      });

      if (!response.ok) throw new Error(`Settings failed (${response.status})`);

      await fetchPlan();
    } catch (err) {
      console.error("Update daily limit error:", err);
      setMaxDailyMinutes(previous);
      setActionError("Could not change the daily study limit.");
    }
  };

  const practiceTopic = (task) =>
    navigate(
      `/test?topic=${encodeURIComponent(task.topic)}&subject=${encodeURIComponent(task.subject)}`
    );

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  const isToday = selectedDate === todayKey;

  return (
    <div className="sp-page">
      <div className="sp-container">
        {/* ============ MAIN CARD ============ */}
        <div className="sp-card">
          <div className="sp-header">
            <div>
              <div className="sp-badge">
                <span className="sp-dot" />
                Spaced Repetition Planner
              </div>
              <h3 className="sp-title">Study Planner</h3>
              <p className="sp-desc">
                Revision schedule built from your struggles via{" "}
                <code>SM-2 × Struggle Score × Daily Limit</code>
              </p>
            </div>

            <div className="sp-actions">
              <label className="sp-field">
                <span>Daily limit</span>
                <select
                  className="sp-input"
                  value={maxDailyMinutes}
                  onChange={(e) => changeDailyLimit(Number(e.target.value))}
                  disabled={loading}
                >
                  {[...new Set([...DAILY_LIMIT_OPTIONS, maxDailyMinutes])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {formatMinutes(m)}
                      </option>
                    ))}
                </select>
              </label>

              <label className="sp-field">
                <span>Date</span>
                <input
                  type="date"
                  className="sp-input"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                />
              </label>

              <button
                type="button"
                className="sp-btn-secondary"
                onClick={() => setShowInfo((v) => !v)}
              >
                <i className="bi bi-info-circle me-1" /> How it works
              </button>

              <button
                type="button"
                className="sp-btn-primary"
                onClick={fetchPlan}
                disabled={loading}
              >
                <i className={`bi bi-arrow-clockwise me-1 ${loading ? "sp-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {showInfo && (
            <div className="sp-info">
              <div className="sp-info-head">
                <i className="bi bi-cpu text-info me-2" />
                <strong>How your plan is built</strong>
              </div>
              <div className="sp-info-grid">
                <div className="sp-info-item">
                  <span className="sp-info-name">Weak topics first</span>
                  <span className="sp-info-text">
                    Topics from Top Struggles are added automatically, hardest first.
                  </span>
                </div>
                <div className="sp-info-item">
                  <span className="sp-info-name">Spaced repetition (SM-2)</span>
                  <span className="sp-info-text">
                    Mark a topic as revised and it returns after a growing gap: 1 day, 6 days, then longer.
                  </span>
                </div>
                <div className="sp-info-item">
                  <span className="sp-info-name">Daily limit</span>
                  <span className="sp-info-text">
                    Tasks overflowing your daily limit move to the next free day.
                  </span>
                </div>
              </div>
            </div>
          )}

          {actionError && (
            <div className="sp-error sp-error-inline">
              <i className="bi bi-exclamation-triangle-fill me-2" />
              {actionError}
            </div>
          )}

          {loading && !hasAnyTasks ? (
            <div className="sp-state">
              <div className="spinner-border text-info" role="status" style={{ width: 32, height: 32 }}>
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 sp-muted">Building your revision schedule...</p>
            </div>
          ) : error ? (
            <div className="sp-error">
              <i className="bi bi-exclamation-triangle-fill me-2" />
              {error}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger ms-3"
                onClick={fetchPlan}
              >
                Retry
              </button>
            </div>
          ) : !hasAnyTasks ? (
            <div className="sp-state">
              <i className="bi bi-journal-check text-info" style={{ fontSize: 34 }} />
              <h5 className="mt-2 text-light">No revision tasks yet</h5>
              <p className="sp-muted mb-3">
                Take a practice test and your weak topics will be scheduled here automatically.
              </p>
              <button type="button" className="sp-btn-primary" onClick={() => navigate("/test")}>
                <i className="bi bi-lightning-charge-fill me-1" /> Take a practice test
              </button>
            </div>
          ) : (
            <>
              {/* ---------- stats ---------- */}
              <div className="sp-stats">
                <div className="sp-stat">
                  <span className="sp-stat-label">
                    <i className="bi bi-list-task me-1" /> Tasks
                  </span>
                  <span className="sp-stat-value">{dayTasks.length}</span>
                  <span className="sp-stat-sub">{isToday ? "for today" : "on this day"}</span>
                </div>
                <div className="sp-stat">
                  <span className="sp-stat-label">
                    <i className="bi bi-check2-circle me-1" /> Completed
                  </span>
                  <span className="sp-stat-value" style={{ color: "#34d399" }}>{completedCount}</span>
                  <div className="sp-track">
                    <div className="sp-fill" style={{ width: `${completionPct}%`, background: "#34d399" }} />
                  </div>
                </div>
                <div className="sp-stat">
                  <span className="sp-stat-label">
                    <i className="bi bi-hourglass-split me-1" /> Pending
                  </span>
                  <span className="sp-stat-value" style={{ color: "#fbbf24" }}>{pendingTasks.length}</span>
                  <span className="sp-stat-sub">still to revise</span>
                </div>
                <div className="sp-stat">
                  <span className="sp-stat-label">
                    <i className="bi bi-stopwatch me-1" /> Study time
                  </span>
                  <span className="sp-stat-value">{formatMinutes(pendingMinutes)}</span>
                  <div className="sp-track">
                    <div
                      className="sp-fill"
                      style={{ width: `${loadPct}%`, background: loadPct >= 100 ? "#f59e0b" : "#38bdf8" }}
                    />
                  </div>
                  <span className="sp-stat-sub">of {formatMinutes(maxDailyMinutes)} daily limit</span>
                </div>
              </div>

              {/* ---------- week strip ---------- */}
              <div className="sp-week">
                {weekStrip.map((day) => (
                  <button
                    type="button"
                    key={day.key}
                    className={`sp-day ${day.key === selectedDate ? "sp-day-active" : ""}`}
                    onClick={() => setSelectedDate(day.key)}
                  >
                    <span className="sp-day-name">
                      {day.key === todayKey
                        ? "Today"
                        : parseDateKey(day.key).toLocaleDateString("en-IN", { weekday: "short" })}
                    </span>
                    <span className="sp-day-num">{parseDateKey(day.key).getDate()}</span>
                    <span className="sp-day-meta">
                      {day.count ? `${day.count} topic${day.count > 1 ? "s" : ""}` : "Free"}
                    </span>
                  </button>
                ))}
              </div>

              {/* ---------- selected day ---------- */}
              <div className="sp-section-head">
                <i className="bi bi-calendar-event me-2" />
                {relativeDayLabel(selectedDate, todayKey)} · {formatLongDate(selectedDate)}
              </div>

              {dayTasks.length === 0 ? (
                <div className="sp-state sp-state-small">
                  <i className="bi bi-cup-hot text-success" style={{ fontSize: 28 }} />
                  <h6 className="mt-2 text-light">Nothing scheduled</h6>
                  <p className="sp-muted mb-0">
                    {upcomingTasks.length > 0 && selectedDate <= todayKey
                      ? `You're all caught up. Next revision: ${relativeDayLabel(upcomingTasks[0].scheduledDate, todayKey)}.`
                      : "No revision tasks on this day."}
                  </p>
                </div>
              ) : (
                <div className="sp-list">
                  {dayTasks.map((task, index) => {
                    const style = priorityStyle(task.priority);
                    const busy = busyTask === task.id;
                    const scorePct = Math.max(4, Math.min(100, Math.round((task.struggleScore / 1.5) * 100)));

                    return (
                      <div
                        className={`sp-item ${task.completed ? "sp-item-done" : ""}`}
                        key={`${task.id}-${task.completed ? "d" : "p"}`}
                      >
                        <div className="sp-rank" style={{ borderColor: style.border, color: style.color }}>
                          {task.completed ? <i className="bi bi-check-lg" /> : `#${index + 1}`}
                        </div>

                        <div className="sp-info-col">
                          <div className="sp-title-row">
                            <span className="sp-topic">{task.topic}</span>
                            <span className="sp-pill">{task.subject}</span>
                            {task.completed ? (
                              <span
                                className="sp-badge-sm"
                                style={{ color: "#34d399", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)" }}
                              >
                                Revised today
                              </span>
                            ) : (
                              <span
                                className="sp-badge-sm"
                                style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
                              >
                                {style.label}
                              </span>
                            )}
                          </div>

                          <div className="sp-progress-row">
                            <div className="sp-progress-info">
                              <span>Struggle score: {task.struggleScore.toFixed(2)}</span>
                              <span className="sp-muted">~{formatMinutes(task.duration)}</span>
                            </div>
                            <div className="sp-track sp-track-lg">
                              <div className="sp-fill" style={{ width: `${scorePct}%`, background: style.bar }} />
                            </div>
                          </div>

                          <div className="sp-metrics">
                            <span>Review <strong>#{task.repetition + 1}</strong></span>
                            <span>Interval <strong>{task.intervalDays}d</strong></span>
                            <span>Ease <strong>{task.easeFactor.toFixed(2)}</strong></span>
                          </div>
                        </div>

                        {!task.completed && (
                          <div className="sp-action-col">
                            <button
                              type="button"
                              className="sp-btn-go"
                              disabled={busy}
                              onClick={() => reviewTask(task, 5)}
                            >
                              <i className="bi bi-check2-circle me-1" />
                              {busy ? "Saving..." : "Revised"}
                            </button>
                            <button
                              type="button"
                              className="sp-btn-ghost"
                              disabled={busy}
                              onClick={() => reviewTask(task, 2)}
                              title="Still hard - you'll see it again tomorrow"
                            >
                              Still hard
                            </button>
                            <button
                              type="button"
                              className="sp-btn-ghost"
                              onClick={() => practiceTopic(task)}
                            >
                              <i className="bi bi-lightning-charge-fill me-1" />
                              Practice
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ============ UPCOMING CARD ============ */}
        {!error && hasAnyTasks && (
          <div className="sp-card">
            <div className="sp-header sp-header-tight">
              <div>
                <div className="sp-badge">
                  <span className="sp-dot" />
                  Coming up
                </div>
                <h3 className="sp-title">Upcoming Revisions</h3>
                <p className="sp-desc">
                  {upcomingTasks.length
                    ? `${upcomingTasks.length} topic${upcomingTasks.length > 1 ? "s" : ""} scheduled over the next ${upcomingByDate.length} day${upcomingByDate.length > 1 ? "s" : ""}.`
                    : "Nothing scheduled yet."}
                </p>
              </div>
            </div>

            {upcomingByDate.length === 0 ? (
              <div className="sp-state sp-state-small">
                <i className="bi bi-calendar-check text-success" style={{ fontSize: 28 }} />
                <p className="sp-muted mt-2 mb-0">
                  Everything is scheduled for today. Finish it and your next reviews will appear here.
                </p>
              </div>
            ) : (
              <div className="sp-upcoming">
                {upcomingByDate.map(([dateKey, tasks]) => (
                  <div className="sp-group" key={dateKey}>
                    <button
                      type="button"
                      className="sp-group-head"
                      onClick={() => {
                        setSelectedDate(dateKey);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      title="Open this day"
                    >
                      <span>
                        <strong>{relativeDayLabel(dateKey, todayKey)}</strong>
                        <span className="sp-muted"> · {formatLongDate(dateKey)}</span>
                      </span>
                      <span className="sp-muted">
                        {tasks.length} topic{tasks.length > 1 ? "s" : ""} ·{" "}
                        {formatMinutes(tasks.reduce((s, t) => s + t.duration, 0))}
                      </span>
                    </button>

                    {tasks.map((task) => {
                      const style = priorityStyle(task.priority);
                      return (
                        <div className="sp-up-row" key={task.id}>
                          <span className="sp-up-dot" style={{ background: style.bar }} />
                          <span className="sp-up-topic">{task.topic}</span>
                          <span className="sp-pill">{task.subject}</span>
                          <span className="sp-up-meta">
                            {task.repetition > 0 ? `Review #${task.repetition + 1}` : "First review"}
                            {" · "}
                            {formatMinutes(task.duration)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .sp-page {
          min-height: 100vh;
          background: #0b1220;
          color: #f8fafc;
          padding: 24px 16px 48px;
        }
        .sp-container { max-width: 1100px; margin: 0 auto; }

        .sp-card {
          background: #0F172A;
          border: 1px solid #1E293B;
          border-radius: 20px;
          padding: 24px;
          color: #f8fafc;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          margin-bottom: 24px;
        }
        .sp-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          flex-wrap: wrap; gap: 16px; margin-bottom: 20px;
        }
        .sp-header-tight { margin-bottom: 12px; }
        .sp-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600;
          color: #38bdf8; margin-bottom: 8px;
        }
        .sp-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #38bdf8;
          box-shadow: 0 0 8px #38bdf8; animation: sp-pulse 2s infinite;
        }
        @keyframes sp-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.85); } }
        .sp-title { font-size: 22px; font-weight: 700; color: #fff; margin: 0 0 4px; }
        .sp-desc { color: #94a3b8; font-size: 13px; margin: 0; }
        .sp-desc code {
          background: rgba(30, 41, 59, 0.8); color: #38bdf8; padding: 2px 6px;
          border-radius: 6px; font-size: 12px;
        }
        .sp-muted { color: #94a3b8; }

        .sp-actions { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
        .sp-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #94a3b8; margin: 0; }
        .sp-input {
          background: #1E293B; border: 1px solid #334155; color: #e2e8f0;
          font-size: 13px; padding: 7px 10px; border-radius: 10px; color-scheme: dark;
        }
        .sp-input:focus { outline: none; border-color: #38bdf8; }
        .sp-btn-secondary {
          background: #1E293B; border: 1px solid #334155; color: #cbd5e1; font-size: 13px;
          font-weight: 500; padding: 8px 14px; border-radius: 10px; cursor: pointer; transition: all .2s;
        }
        .sp-btn-secondary:hover { background: #334155; color: #fff; }
        .sp-btn-primary {
          background: #0284c7; border: 1px solid #0369a1; color: #fff; font-size: 13px;
          font-weight: 600; padding: 8px 16px; border-radius: 10px; cursor: pointer;
          transition: all .2s; display: inline-flex; align-items: center;
        }
        .sp-btn-primary:hover:not(:disabled) { background: #0369a1; }
        .sp-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .sp-spin { animation: sp-rot 1s linear infinite; display: inline-block; }
        @keyframes sp-rot { to { transform: rotate(360deg); } }

        .sp-info {
          background: rgba(15, 23, 42, 0.8); border: 1px solid #1E293B; border-left: 4px solid #38bdf8;
          border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px;
        }
        .sp-info-head { display: flex; align-items: center; color: #e2e8f0; margin-bottom: 10px; }
        .sp-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
        .sp-info-item { background: rgba(30, 41, 59, 0.5); border-radius: 8px; padding: 10px; }
        .sp-info-name { display: block; font-weight: 600; color: #f1f5f9; font-size: 12px; margin-bottom: 2px; }
        .sp-info-text { color: #94a3b8; font-size: 12px; line-height: 1.4; }

        .sp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 18px; }
        .sp-stat {
          background: #131E32; border: 1px solid #1E293B; border-radius: 14px; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .sp-stat-label { font-size: 12px; color: #94a3b8; }
        .sp-stat-value { font-size: 26px; font-weight: 700; color: #f8fafc; line-height: 1.1; }
        .sp-stat-sub { font-size: 11px; color: #94a3b8; }

        .sp-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; margin-bottom: 22px; }
        .sp-day {
          background: #131E32; border: 1px solid #1E293B; border-radius: 12px; padding: 10px 6px;
          display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer;
          color: #cbd5e1; transition: all .2s;
        }
        .sp-day:hover { border-color: #38bdf8; transform: translateY(-2px); }
        .sp-day-active { border-color: #38bdf8; background: rgba(56, 189, 248, 0.12); color: #fff; }
        .sp-day-name { font-size: 11px; color: #94a3b8; }
        .sp-day-active .sp-day-name { color: #7dd3fc; }
        .sp-day-num { font-size: 18px; font-weight: 700; }
        .sp-day-meta { font-size: 10px; color: #94a3b8; }

        .sp-section-head { font-size: 15px; font-weight: 600; color: #e2e8f0; margin-bottom: 12px; }

        .sp-list { display: flex; flex-direction: column; gap: 12px; }
        .sp-item {
          display: flex; align-items: center; gap: 16px; padding: 16px 20px; border-radius: 14px;
          background: #131E32; border: 1px solid #1E293B;
          transition: transform .2s, border-color .2s, box-shadow .2s;
        }
        .sp-item:hover { transform: translateY(-2px); border-color: #38bdf8; box-shadow: 0 6px 18px rgba(0,0,0,.3); }
        .sp-item-done { opacity: .72; }
        .sp-rank {
          flex-shrink: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          border-radius: 10px; background: rgba(15, 23, 42, .9); border: 1px solid; font-weight: 700; font-size: 14px;
        }
        .sp-info-col { flex: 1; min-width: 0; }
        .sp-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
        .sp-topic { font-size: 16px; font-weight: 600; color: #f8fafc; }
        .sp-pill {
          background: #1E293B; border: 1px solid #334155; color: #94a3b8; font-size: 11px; font-weight: 500;
          padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: .05em;
        }
        .sp-badge-sm { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 20px; }
        .sp-progress-row { margin-bottom: 8px; }
        .sp-progress-info { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: #cbd5e1; }
        .sp-track { width: 100%; height: 6px; background: #0B1120; border-radius: 999px; overflow: hidden; }
        .sp-track-lg { height: 6px; }
        .sp-fill { height: 100%; border-radius: 999px; transition: width .4s ease; }
        .sp-metrics { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #94a3b8; }
        .sp-metrics strong { color: #f1f5f9; }

        .sp-action-col { flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; min-width: 120px; }
        .sp-btn-go {
          background: linear-gradient(135deg, #059669, #047857); border: 1px solid #34d399; color: #fff;
          font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 10px; cursor: pointer;
          white-space: nowrap; transition: all .2s;
        }
        .sp-btn-go:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 4px 12px rgba(52, 211, 153, .35); }
        .sp-btn-go:disabled { opacity: .6; cursor: wait; }
        .sp-btn-ghost {
          background: #1E293B; border: 1px solid #334155; color: #cbd5e1; font-size: 12px;
          padding: 6px 12px; border-radius: 10px; cursor: pointer; white-space: nowrap; transition: all .2s;
        }
        .sp-btn-ghost:hover:not(:disabled) { background: #334155; color: #fff; }

        .sp-state { padding: 40px 20px; text-align: center; }
        .sp-state-small { padding: 24px 16px; background: #131E32; border: 1px dashed #334155; border-radius: 14px; }
        .sp-error {
          background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px; color: #fca5a5; font-size: 14px; padding: 16px 20px;
        }
        .sp-error-inline { margin-bottom: 16px; padding: 10px 14px; font-size: 13px; }

        .sp-upcoming { display: flex; flex-direction: column; gap: 14px; }
        .sp-group { background: #131E32; border: 1px solid #1E293B; border-radius: 14px; overflow: hidden; }
        .sp-group-head {
          width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
          background: rgba(30, 41, 59, 0.55); border: 0; border-bottom: 1px solid #1E293B;
          color: #f1f5f9; font-size: 13px; padding: 10px 16px; cursor: pointer; text-align: left;
        }
        .sp-group-head:hover { background: rgba(56, 189, 248, 0.12); }
        .sp-up-row {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px;
          border-top: 1px solid rgba(30, 41, 59, .7);
        }
        .sp-up-row:first-of-type { border-top: 0; }
        .sp-up-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .sp-up-topic { font-size: 14px; font-weight: 600; color: #f8fafc; }
        .sp-up-meta { margin-left: auto; font-size: 12px; color: #94a3b8; }

        @media (max-width: 768px) {
          .sp-item { flex-direction: column; align-items: flex-start; }
          .sp-action-col { width: 100%; flex-direction: row; flex-wrap: wrap; }
          .sp-action-col button { flex: 1; }
          .sp-week { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
      `}</style>
    </div>
  );
}
