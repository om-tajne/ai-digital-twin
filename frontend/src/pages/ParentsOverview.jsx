import React, { useState, useEffect, useContext, useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ShieldCheck,
  Award,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  BrainCircuit,
  Eye,
  Layers,
  Filter,
  Activity,
  Users,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { AuthContext } from "../context/AuthContext";

// Set VITE_API_URL (Vite) or REACT_APP_API_URL (CRA) in production.
const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "http://localhost:8000";

// Empty state: never show another student's demo information in the guardian portal.
const EMPTY_DASHBOARD = {
  read_only: true,
  student: null,
  overall_stats: {
    overall_mastery: 0,
    grade_label: "—",
    tests_completed: 0,
    viva_sessions: 0,
    total_topics: 0,
    mastered_topics: 0,
    proficient_topics: 0,
    developing_topics: 0,
    struggling_topics: 0,
  },
  subject_progress: [],
  topic_heatmap: [],
  struggles: [],
  recent_tests: [],
  history_timeline: [],
  ai_insights: null,
};

const STATUS_FILTERS = ["ALL", "Mastered", "Proficient", "Developing", "Needs Attention"];

// ---------- helpers ----------
const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, Number(n) || 0));

// Accepts 0-1 fractions or 0-100 percentages and returns 0-100.
const toPercent = (v) => {
  const n = Number(v) || 0;
  return clamp(n > 0 && n <= 1 ? n * 100 : n);
};

const statusFromScore = (score) => {
  if (score >= 85) return "Mastered";
  if (score >= 70) return "Proficient";
  if (score >= 50) return "Developing";
  return "Needs Attention";
};

const colorFromScore = (score) =>
  score >= 85 ? "#10B981" : score >= 70 ? "#3B82F6" : score >= 50 ? "#F59E0B" : "#EF4444";

const getStatusBadgeClass = (status) => {
  switch (status) {
    case "Mastered":
      return "st-mastered";
    case "Proficient":
      return "st-proficient";
    case "Developing":
      return "st-developing";
    default:
      return "st-attention";
  }
};

const onKeyActivate = (handler) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handler();
  }
};

export default function ParentsOverview() {
  const { user } = useContext(AuthContext) || {};

  const [dashData, setDashData] = useState(EMPTY_DASHBOARD);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [dashLoading, setDashLoading] = useState(false);
  const [error, setError] = useState("");

  const [guardianStudents, setGuardianStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(
    user?.student_id ? String(user.student_id) : ""
  );

  const [filterSubject, setFilterSubject] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [activeTopicModal, setActiveTopicModal] = useState(null);

  // This view now uses the currently logged-in student's account.
  const studentId = String(user?.student_id || user?.student?.student_id || user?.id || user?._id || "");

  // Use the student already authenticated in AuthContext. No guardian login/token is needed.
  useEffect(() => {
    const profile = user?.student || user || null;
    const id = String(profile?.student_id || profile?.id || profile?._id || "");
    setStudentsLoading(false);
    if (!id) {
      setGuardianStudents([]);
      setSelectedStudentId("");
      setDashData(EMPTY_DASHBOARD);
      setError("Student ID is missing from the logged-in user. Check AuthContext login response.");
      return;
    }
    const normalized = {
      ...profile,
      student_id: id,
      full_name: profile?.full_name || profile?.name || profile?.username || "Student",
      grade: profile?.grade || profile?.class || "—",
      board: profile?.board || "—",
    };
    setGuardianStudents([normalized]);
    setSelectedStudentId(id);
    setError("");
  }, [studentId]);

  // Fetch progress using the logged-in student's ID; never call guardian-only routes.
  useEffect(() => {
    if (!selectedStudentId) {
      setDashData(EMPTY_DASHBOARD);
      setDashLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const loadStudentProgress = async () => {
      setDashLoading(true);
      setError("");
      try {
        const [masteryResponse, strugglesResponse] = await Promise.all([
          fetch(`${API_URL}/api/v1/mastery/${encodeURIComponent(selectedStudentId)}`, { signal: controller.signal }),
          fetch(`${API_URL}/api/v1/struggles/${encodeURIComponent(selectedStudentId)}`, { signal: controller.signal }),
        ]);
        const [masteryRaw, strugglesRaw] = await Promise.all([
          masteryResponse.json().catch(() => ({})),
          strugglesResponse.json().catch(() => ({})),
        ]);
        if (!masteryResponse.ok) throw new Error(masteryRaw?.detail || `Mastery request failed (${masteryResponse.status}).`);
        if (!strugglesResponse.ok) throw new Error(strugglesRaw?.detail || `Struggles request failed (${strugglesResponse.status}).`);

        const profile = guardianStudents.find((item) => String(item.student_id) === String(selectedStudentId)) || user?.student || user || {};
        const masteryRows = Array.isArray(masteryRaw) ? masteryRaw : (masteryRaw.mastery || masteryRaw.data?.mastery || masteryRaw.records || masteryRaw.data || []);
        const struggleRows = Array.isArray(strugglesRaw) ? strugglesRaw : (strugglesRaw.struggles || strugglesRaw.data?.struggles || strugglesRaw.data || []);
        const rows = Array.isArray(masteryRows) ? masteryRows : [];
        const topics = rows.map((item) => {
          const score = toPercent(item.percentage ?? item.mastery_percentage ?? item.mastery_score ?? item.mastery ?? item.score ?? item.p_mastery);
          return { ...item, topic: item.topic || item.topic_name || item.knowledge_component || "Topic", subject: item.subject || item.subject_name || "General", score, percentage: score, status: statusFromScore(score) };
        });
        const average = topics.length ? topics.reduce((sum, item) => sum + item.score, 0) / topics.length : 0;
        const subjectMap = new Map();
        topics.forEach((item) => {
          const group = subjectMap.get(item.subject) || { name: item.subject, total: 0, topics: [] };
          group.total += item.score;
          group.topics.push({ ...item, percentage: item.score, correct_answers: item.correct_answers ?? item.correct_count ?? 0, total_questions: item.total_questions ?? item.question_count ?? 0 });
          subjectMap.set(item.subject, group);
        });
        const subjects = [...subjectMap.values()].map((group) => ({ name: group.name, average_score: Math.round(group.total / group.topics.length), mastered_topics: group.topics.filter((t) => t.score >= 85).length, total_topics: group.topics.length, topics: group.topics }));
        const normalizedStruggles = (Array.isArray(struggleRows) ? struggleRows : []).map((item) => ({ ...item, topic: item.topic || item.topic_name || "Topic", subject: item.subject || item.subject_name || "General", mastery_score: item.mastery_score ?? item.mastery ?? item.score ?? item.percentage ?? 0 }));
        setDashData({
          ...EMPTY_DASHBOARD,
          student: { ...profile, student_id: String(selectedStudentId), full_name: profile?.full_name || profile?.name || profile?.username || "Student", grade: profile?.grade || profile?.class || "—", board: profile?.board || "—" },
          overall_stats: { ...EMPTY_DASHBOARD.overall_stats, overall_mastery: Math.round(average), grade_label: profile?.grade || profile?.class || "—", total_topics: topics.length, mastered_topics: topics.filter((t) => t.score >= 85).length, proficient_topics: topics.filter((t) => t.score >= 70 && t.score < 85).length, developing_topics: topics.filter((t) => t.score >= 50 && t.score < 70).length, struggling_topics: topics.filter((t) => t.score < 50).length },
          subject_progress: subjects,
          topic_heatmap: topics,
          struggles: normalizedStruggles,
        });
        if (!topics.length) setError("Student account loaded, but no mastery records are available yet. Complete a quiz/test to populate progress.");
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Could not load student progress:", err);
        setDashData({ ...EMPTY_DASHBOARD, student: { ...(user?.student || user || {}), student_id: String(selectedStudentId), full_name: user?.full_name || user?.name || "Student", grade: user?.grade || "—", board: user?.board || "—" } });
        setError(err.message || "Unable to load student progress.");
      } finally {
        if (!controller.signal.aborted) setDashLoading(false);
      }
    };
    loadStudentProgress();
    return () => controller.abort();
  }, [selectedStudentId, studentId]);

  // Close modal with Escape.
  useEffect(() => {
    if (!activeTopicModal) return undefined;
    const onKey = (e) => e.key === "Escape" && setActiveTopicModal(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTopicModal]);

  const toggleSubjectExpand = (subjName) =>
    setExpandedSubjects((prev) => ({ ...prev, [subjName]: !prev[subjName] }));

  const {
    student,
    overall_stats,
    subject_progress,
    topic_heatmap,
    struggles,
    history_timeline,
    ai_insights,
  } = dashData;

  // Subject filter options come from the data instead of being hard-coded.
  const subjectOptions = useMemo(() => {
    const set = new Set(topic_heatmap.map((t) => t.subject).filter(Boolean));
    return ["ALL", ...Array.from(set)];
  }, [topic_heatmap]);

  // Reset filters when they no longer exist for the newly selected student.
  useEffect(() => {
    if (!subjectOptions.includes(filterSubject)) setFilterSubject("ALL");
  }, [subjectOptions, filterSubject]);

  const filteredHeatmap = topic_heatmap.filter((tile) => {
    const score = toPercent(tile.score);
    const matchesSubject =
      filterSubject === "ALL" ||
      String(tile.subject || "").toLowerCase() === filterSubject.toLowerCase();
    const matchesStatus = filterStatus === "ALL" || statusFromScore(score) === filterStatus;
    return matchesSubject && matchesStatus;
  });

  const mastery = clamp(overall_stats?.overall_mastery);

  // ---------- Loading / empty states ----------
  if (studentsLoading || dashLoading) {
    return (
      <div
        className="po-root d-flex justify-content-center align-items-center"
        style={{ minHeight: "80vh" }}
      >
        <div className="text-center text-light">
          <div
            className="spinner-border text-info mb-3"
            role="status"
            style={{ width: "3rem", height: "3rem" }}
          />
          <h4 className="fw-semibold">Loading Guardian Portal...</h4>
          <p className="text-muted">Connecting live student mastery telemetry</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div
        className="po-root d-flex align-items-center justify-content-center"
        style={{ minHeight: "80vh" }}
      >
        <style>{STYLES}</style>
        <div className="po-card text-center" style={{ maxWidth: "560px", width: "100%" }}>
          <ShieldCheck size={36} className="text-info mb-3" />
          <h3 className="text-light mb-2">Guardian Dashboard</h3>
          <p className="text-muted mb-0">
            {error || "No linked student or learning activity is available yet."}
          </p>
          <p className="text-muted mt-2 mb-0" style={{ fontSize: "13px" }}>
            Log in with the student account and confirm that its AuthContext includes a student ID.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="po-root">
      <style>{STYLES}</style>

      <div className="po-container">
        {/* ================= GUARDIAN PORTAL HEADER ================= */}
        <div className="guardian-portal-bar">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <span className="portal-badge">
              <ShieldCheck size={16} />
              Guardian Portal
            </span>
            <span className="read-only-tag">
              <Eye size={14} />
              Read-Only Live Monitoring
            </span>
          </div>

          <div className="d-flex align-items-center gap-3 text-muted">
            <Users size={16} className="text-info" />
            {guardianStudents.length > 1 ? (
              <div className="d-flex align-items-center gap-2">
                <label htmlFor="po-student-select" style={{ fontSize: "13px", margin: 0 }}>
                  Select Student:
                </label>
                <select
                  id="po-student-select"
                  className="form-select form-select-sm bg-dark text-light border-secondary shadow-none"
                  style={{ minWidth: "200px", borderRadius: "8px", fontSize: "13px" }}
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                >
                  {guardianStudents.map((st) => (
                    <option key={st.student_id} value={String(st.student_id)}>
                      {st.full_name} ({st.grade} · {st.board})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span>
                Student: <strong>{student.full_name}</strong> ({student.grade} · {student.board})
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-warning py-2" role="alert" style={{ fontSize: "13px" }}>
            {error}
          </div>
        )}

        {/* ================= AI PARENT INSIGHT NOTE ================= */}
        <div className="ai-insight-box">
          <div className="d-flex align-items-center gap-2 mb-2 fw-semibold">
            <BrainCircuit size={20} className="text-info" />
            <span className="text-info fw-bold">AI Parent Executive Summary</span>
            {ai_insights?.updated_at && (
              <span className="badge bg-info text-dark ms-auto">
                Updated {new Date(ai_insights.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="mb-2 text-light" style={{ fontSize: "14.5px", lineHeight: "1.6" }}>
            {ai_insights?.summary ||
              "AI insights will appear here when enough student activity is available."}
          </p>
          <div
            className="d-flex align-items-center gap-3 pt-2 text-muted flex-wrap"
            style={{ fontSize: "13px" }}
          >
            <span>
              🌟 Strongest Area:{" "}
              <strong className="text-emerald-400">
                {ai_insights?.strongest_subject || "Not available yet"}
              </strong>
            </span>
            <span>·</span>
            <span>
              🎯 Priority Focus:{" "}
              <strong className="text-amber-400">
                {ai_insights?.weakest_topic || "Not available yet"}
              </strong>
            </span>
          </div>
        </div>

        {/* ================= OVERALL MASTERY & KEY METRICS ================= */}
        <div className="po-grid-top">
          <div className="po-card po-card-glass text-center">
            <div className="po-card-header">
              <h3 className="po-card-title">
                <Award size={20} /> Overall Mastery
              </h3>
            </div>

            <div className="gauge-container">
              <ResponsiveContainer width={220} height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Mastery", value: mastery },
                      { name: "Remaining", value: 100 - mastery },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={88}
                    startAngle={225}
                    endAngle={-45}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="#10B981" />
                    <Cell fill="#1E293B" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="gauge-center">
                <div className="gauge-number">{mastery.toFixed(1)}%</div>
                <div className="gauge-grade">Grade {overall_stats.grade_label}</div>
              </div>
            </div>

            <p className="text-muted mt-2 mb-0" style={{ fontSize: "12.5px" }}>
              Calculated across {overall_stats.total_topics} evaluated syllabus topics
            </p>
          </div>

          <div className="po-card po-card-glass">
            <div className="po-card-header">
              <h3 className="po-card-title">
                <Activity size={20} /> Academic Snapshot
              </h3>
              <span className="text-muted" style={{ fontSize: "12px" }}>
                Auto-synced with Digital Twin
              </span>
            </div>

            <div className="metric-grid mb-4">
              <div className="metric-tile">
                <div className="metric-val text-emerald-400">{overall_stats.mastered_topics}</div>
                <div className="metric-lbl">Mastered Topics (&gt;85%)</div>
              </div>
              <div className="metric-tile">
                <div className="metric-val text-blue-400">{overall_stats.proficient_topics}</div>
                <div className="metric-lbl">Proficient (70-84%)</div>
              </div>
              <div className="metric-tile">
                <div className="metric-val text-amber-400">{overall_stats.developing_topics}</div>
                <div className="metric-lbl">Developing (50-69%)</div>
              </div>
              <div className="metric-tile">
                <div className="metric-val text-red-400">{overall_stats.struggling_topics}</div>
                <div className="metric-lbl">Needs Attention</div>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-6 col-sm-3">
                <div className="p-3 bg-dark rounded-3 border border-secondary border-opacity-25">
                  <div className="text-muted" style={{ fontSize: "11px" }}>TESTS TAKEN</div>
                  <div className="fs-4 fw-bold text-light font-mono mt-1">
                    {overall_stats.tests_completed}
                  </div>
                </div>
              </div>
              <div className="col-6 col-sm-3">
                <div className="p-3 bg-dark rounded-3 border border-secondary border-opacity-25">
                  <div className="text-muted" style={{ fontSize: "11px" }}>VIVA SESSIONS</div>
                  <div className="fs-4 fw-bold text-info font-mono mt-1">
                    {overall_stats.viva_sessions}
                  </div>
                </div>
              </div>
              <div className="col-6 col-sm-3">
                <div className="p-3 bg-dark rounded-3 border border-secondary border-opacity-25">
                  <div className="text-muted" style={{ fontSize: "11px" }}>TOTAL TOPICS</div>
                  <div className="fs-4 fw-bold text-light font-mono mt-1">
                    {overall_stats.total_topics}
                  </div>
                </div>
              </div>
              <div className="col-6 col-sm-3">
                <div className="p-3 bg-dark rounded-3 border border-secondary border-opacity-25">
                  <div className="text-muted" style={{ fontSize: "11px" }}>READ-ONLY ACCESS</div>
                  <div className="fs-6 fw-bold text-success mt-1">Active 🛡️</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= TOPIC MASTERY HEATMAP GRID ================= */}
        <div className="heatmap-section">
          <div className="po-card">
            <div className="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-3">
              <div>
                <h3 className="po-card-title">
                  <Layers size={20} /> Topic Mastery Heatmap
                </h3>
                <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
                  Visual topic matrix color-coded by student performance level
                </p>
              </div>

              <div className="d-flex flex-column gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="text-muted" style={{ fontSize: "12px" }}>
                    <Filter size={12} className="me-1" /> Subject:
                  </span>
                  {subjectOptions.map((subj) => (
                    <button
                      key={subj}
                      type="button"
                      className={`filter-pill-btn ${filterSubject === subj ? "active" : ""}`}
                      onClick={() => setFilterSubject(subj)}
                    >
                      {subj}
                    </button>
                  ))}
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="text-muted" style={{ fontSize: "12px" }}>
                    <Filter size={12} className="me-1" /> Status:
                  </span>
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`filter-pill-btn ${filterStatus === s ? "active" : ""}`}
                      onClick={() => setFilterStatus(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredHeatmap.length === 0 ? (
              <p className="text-muted mb-0 mt-3" style={{ fontSize: "13px" }}>
                No topics match the selected filters.
              </p>
            ) : (
              <div className="heatmap-grid">
                {filteredHeatmap.map((tile) => {
                  const score = toPercent(tile.score);
                  const color = tile.color || colorFromScore(score);
                  return (
                    <div
                      key={`${tile.subject}-${tile.topic}`}
                      className="heatmap-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveTopicModal(tile)}
                      onKeyDown={onKeyActivate(() => setActiveTopicModal(tile))}
                    >
                      <div className="heatmap-tile-header">
                        <span className="heatmap-subj">{tile.subject}</span>
                        <span className="heatmap-score" style={{ color }}>
                          {score}%
                        </span>
                      </div>
                      <div className="heatmap-topic">{tile.topic}</div>
                      <div className="heatmap-bar-bg">
                        <div
                          className="heatmap-bar-fill"
                          style={{ width: `${score}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ================= SUBJECT BREAKDOWN + TRAJECTORY ================= */}
        <div className="row g-4 mb-4">
          <div className="col-12 col-lg-7">
            <div className="po-card h-100">
              <div className="po-card-header">
                <h3 className="po-card-title">
                  <BookOpen size={20} /> Subject &amp; Topic Breakdown
                </h3>
                <span className="text-muted" style={{ fontSize: "12px" }}>
                  Click to inspect topics
                </span>
              </div>

              {subject_progress.length === 0 && (
                <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
                  No subject progress recorded yet.
                </p>
              )}

              {subject_progress.map((subj) => {
                const isOpen = !!expandedSubjects[subj.name];
                return (
                  <div key={subj.name} className="subject-accordion-item">
                    <div
                      className="subject-accordion-header"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggleSubjectExpand(subj.name)}
                      onKeyDown={onKeyActivate(() => toggleSubjectExpand(subj.name))}
                    >
                      <div className="subject-info">
                        <span className="subject-name-txt">{subj.name}</span>
                        <span
                          className="badge bg-dark text-info border border-info border-opacity-25"
                          style={{ fontSize: "11px" }}
                        >
                          {subj.mastered_topics}/{subj.total_topics} Mastered
                        </span>
                      </div>

                      <div className="d-flex align-items-center gap-3">
                        <span
                          className="fw-bold font-mono"
                          style={{ fontSize: "16px", color: "#38BDF8" }}
                        >
                          {subj.average_score}%
                        </span>
                        {isOpen ? (
                          <ChevronUp size={18} className="text-muted" />
                        ) : (
                          <ChevronDown size={18} className="text-muted" />
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        className="border-top border-secondary border-opacity-25"
                        style={{ overflowX: "auto" }}
                      >
                        <table className="topic-row-table">
                          <thead>
                            <tr>
                              <th>Topic</th>
                              <th>Mastery Score</th>
                              <th>Questions Answered</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subj.topics?.map((topItem) => {
                              const pct = toPercent(topItem.percentage);
                              return (
                                <tr key={topItem.topic}>
                                  <td className="fw-semibold text-light">{topItem.topic}</td>
                                  <td>
                                    <div className="d-flex align-items-center gap-2">
                                      <span className="font-mono fw-bold">{pct}%</span>
                                      <div className="heatmap-bar-bg" style={{ width: "60px" }}>
                                        <div
                                          className="heatmap-bar-fill"
                                          style={{
                                            width: `${pct}%`,
                                            backgroundColor: topItem.color || colorFromScore(pct),
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="text-muted font-mono">
                                    {topItem.correct_answers} / {topItem.total_questions}
                                  </td>
                                  <td>
                                    <span
                                      className={`pill-badge ${getStatusBadgeClass(
                                        topItem.status
                                      )}`}
                                    >
                                      {topItem.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col-12 col-lg-5">
            <div className="po-card h-100 d-flex flex-column gap-4">
              <div>
                <h3 className="po-card-title mb-3">
                  <TrendingUp size={20} /> Mastery Trajectory
                </h3>
                {history_timeline.length === 0 ? (
                  <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
                    Trajectory will appear after a few weeks of activity.
                  </p>
                ) : (
                  <div style={{ height: "180px", width: "100%" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history_timeline}>
                        <defs>
                          <linearGradient id="colorMastery" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="week" stroke="#64748B" fontSize={11} />
                        {/* Full 0-100 range so scores under 50 are never clipped */}
                        <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            borderColor: "#334155",
                            borderRadius: "8px",
                            color: "#F8FAFC",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="mastery"
                          stroke="#10B981"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorMastery)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="pt-2 border-top border-secondary border-opacity-25">
                <h3 className="po-card-title mb-3 text-amber-400">
                  <AlertTriangle size={20} style={{ color: "#FBBF24" }} /> Key Areas for
                  Improvement
                </h3>
                {struggles.length === 0 && (
                  <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
                    No weak areas detected.
                  </p>
                )}
                {struggles.map((st) => (
                  <div
                    key={`${st.subject}-${st.topic}`}
                    className="struggle-row p-3 mb-2 rounded-3 bg-dark d-flex align-items-center justify-content-between"
                  >
                    <div>
                      <div className="fw-semibold text-light" style={{ fontSize: "14px" }}>
                        {st.topic}
                      </div>
                      <div className="text-muted" style={{ fontSize: "12px" }}>
                        Subject: {st.subject}
                      </div>
                    </div>
                    <span className="pill-badge st-attention">
                      {Math.round(toPercent(st.mastery_score))}% Mastery
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= TOPIC DETAIL MODAL ================= */}
      {activeTopicModal && (
        <div
          className="po-modal-backdrop"
          onClick={() => setActiveTopicModal(null)}
          role="presentation"
        >
          <div
            className="po-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeTopicModal.topic} details`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="po-modal-close"
              aria-label="Close"
              onClick={() => setActiveTopicModal(null)}
            >
              <X size={18} />
            </button>
            {(() => {
              const t = activeTopicModal;
              const score = toPercent(t.score);
              const color = t.color || colorFromScore(score);
              return (
                <>
                  <div className="heatmap-subj mb-1">{t.subject}</div>
                  <h4 className="text-light mb-3">{t.topic}</h4>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <span className="gauge-number" style={{ color }}>
                      {score}%
                    </span>
                    <span className={`pill-badge ${getStatusBadgeClass(t.status || statusFromScore(score))}`}>
                      {t.status || statusFromScore(score)}
                    </span>
                  </div>
                  <div className="heatmap-bar-bg mb-3">
                    <div
                      className="heatmap-bar-fill"
                      style={{ width: `${score}%`, backgroundColor: color }}
                    />
                  </div>
                  {(t.correct_answers != null || t.total_questions != null) && (
                    <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
                      Questions answered correctly:{" "}
                      <strong className="text-light">
                        {t.correct_answers ?? "—"} / {t.total_questions ?? "—"}
                      </strong>
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');

.po-root {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background: #0B0F19;
  background-image:
    radial-gradient(circle at 15% 15%, rgba(59, 130, 246, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 85% 85%, rgba(16, 185, 129, 0.06) 0%, transparent 40%);
  color: #E2E8F0;
  min-height: 100vh;
  padding: 24px 20px 60px;
  box-sizing: border-box;
}
.po-container { max-width: 1240px; margin: 0 auto; }

/* Utility classes (the original used Tailwind names that Bootstrap doesn't provide) */
.text-emerald-400 { color: #34D399 !important; }
.text-blue-400 { color: #60A5FA !important; }
.text-amber-400 { color: #FBBF24 !important; }
.text-red-400 { color: #F87171 !important; }
.font-mono { font-family: 'JetBrains Mono', monospace; }

.guardian-portal-bar {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(51, 65, 85, 0.7);
  border-radius: 16px;
  padding: 16px 24px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.portal-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(16, 185, 129, 0.15); color: #34D399;
  border: 1px solid rgba(16, 185, 129, 0.3);
  font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  padding: 6px 14px; border-radius: 20px;
}
.read-only-tag {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(148, 163, 184, 0.1); color: #94A3B8;
  border: 1px solid rgba(148, 163, 184, 0.2);
  font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 8px;
}

.po-grid-top {
  display: grid; grid-template-columns: 340px 1fr; gap: 20px; margin-bottom: 24px;
}
@media (max-width: 992px) { .po-grid-top { grid-template-columns: 1fr; } }

.po-card {
  background: #111827; border: 1px solid #1F2937; border-radius: 16px; padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); position: relative; overflow: hidden;
}
.po-card-glass {
  background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(8px);
  border: 1px solid rgba(31, 41, 55, 0.9);
}
.po-card-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;
}
.po-card-title {
  font-size: 18px; font-weight: 700; color: #F8FAFC;
  display: flex; align-items: center; gap: 10px; margin: 0;
}
.po-card-title svg { color: #38BDF8; }

.metric-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 14px;
}
.metric-tile {
  background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 14px 16px;
}
.metric-val {
  font-size: 26px; font-weight: 800; color: #F8FAFC;
  font-family: 'JetBrains Mono', monospace; line-height: 1.1;
}
.metric-lbl { font-size: 12px; color: #94A3B8; font-weight: 500; margin-top: 4px; }

.gauge-container {
  position: relative; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 10px 0;
}
.gauge-center {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); text-align: center;
}
.gauge-number {
  font-size: 38px; font-weight: 800; color: #F8FAFC;
  font-family: 'JetBrains Mono', monospace; line-height: 1;
}
.gauge-grade {
  display: inline-block; margin-top: 6px; background: #10B981; color: #064E3B;
  font-weight: 800; font-size: 13px; padding: 3px 12px; border-radius: 12px;
}

.heatmap-section { margin-bottom: 24px; }
.heatmap-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px; margin-top: 16px;
}
.heatmap-tile {
  background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 14px;
  cursor: pointer; transition: all 0.2s ease; position: relative;
}
.heatmap-tile:hover, .heatmap-tile:focus-visible {
  transform: translateY(-2px); border-color: #64748B;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); outline: none;
}
.heatmap-tile-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 6px; margin-bottom: 8px;
}
.heatmap-subj {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  color: #94A3B8; font-weight: 600;
}
.heatmap-score { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; }
.heatmap-topic {
  font-size: 13px; font-weight: 600; color: #E2E8F0; line-height: 1.3; margin-bottom: 8px;
}
.heatmap-bar-bg { height: 6px; width: 100%; background: #0F172A; border-radius: 4px; overflow: hidden; }
.heatmap-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }

.subject-accordion-item {
  background: #1E293B; border: 1px solid #334155; border-radius: 14px;
  margin-bottom: 12px; overflow: hidden; transition: border-color 0.2s ease;
}
.subject-accordion-item:hover { border-color: #475569; }
.subject-accordion-header {
  padding: 16px 20px; display: flex; align-items: center;
  justify-content: space-between; cursor: pointer; user-select: none;
}
.subject-accordion-header:focus-visible { outline: 2px solid #38BDF8; outline-offset: -2px; }
.subject-info { display: flex; align-items: center; gap: 14px; }
.subject-name-txt { font-size: 16px; font-weight: 700; color: #F8FAFC; }

.topic-row-table { width: 100%; border-collapse: collapse; }
.topic-row-table th {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8;
  padding: 12px 16px; border-bottom: 1px solid #334155; text-align: left; background: #111827;
}
.topic-row-table td {
  padding: 12px 16px; border-bottom: 1px solid #1E293B; font-size: 13.5px; color: #E2E8F0;
}
.topic-row-table tr:last-child td { border-bottom: none; }

.ai-insight-box {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%);
  border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 16px;
  padding: 20px 24px; margin-bottom: 24px; position: relative;
}
.ai-insight-box::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
  background: #38BDF8; border-radius: 4px 0 0 4px;
}

.filter-pill-btn {
  background: #1E293B; border: 1px solid #334155; color: #94A3B8;
  font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 20px;
  cursor: pointer; transition: all 0.15s ease;
}
.filter-pill-btn:hover { color: #F8FAFC; border-color: #64748B; }
.filter-pill-btn.active { background: #3B82F6; border-color: #3B82F6; color: #FFFFFF; }

.pill-badge {
  display: inline-block; font-size: 11px; font-weight: 700;
  padding: 3px 10px; border-radius: 12px; text-transform: uppercase;
}
.st-mastered   { background: rgba(16,185,129,.2); color: #34D399; border: 1px solid rgba(16,185,129,.3); }
.st-proficient { background: rgba(59,130,246,.2); color: #60A5FA; border: 1px solid rgba(59,130,246,.3); }
.st-developing { background: rgba(245,158,11,.2); color: #FBBF24; border: 1px solid rgba(245,158,11,.3); }
.st-attention  { background: rgba(239,68,68,.2);  color: #F87171; border: 1px solid rgba(239,68,68,.3); }

.struggle-row { border: 1px solid rgba(245, 158, 11, 0.25); }

.po-modal-backdrop {
  position: fixed; inset: 0; background: rgba(2, 6, 23, 0.7); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 1050;
}
.po-modal {
  position: relative; width: 100%; max-width: 420px; background: #111827;
  border: 1px solid #334155; border-radius: 16px; padding: 28px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}
.po-modal-close {
  position: absolute; top: 14px; right: 14px; background: transparent; border: none;
  color: #94A3B8; cursor: pointer; padding: 4px; border-radius: 8px;
}
.po-modal-close:hover { color: #F8FAFC; background: #1E293B; }
`;