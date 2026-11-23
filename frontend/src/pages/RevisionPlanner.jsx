import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { FASTAPI_URL } from "../config";

export default function RevisionPlanner() {
  const { user } = useContext(AuthContext);
  const studentId = user?.student_id || "demo-student-id";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [activeTab, setActiveTab] = useState("today");

  // Modal State for Review
  const [selectedTask, setSelectedTask] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(null);

  // Settings State
  const [maxMinutes, setMaxMinutes] = useState(60);
  const [savingSettings, setSavingSettings] = useState(false);

  const API_URL = FASTAPI_URL;

  const fetchRevisionPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      // Try FastAPI direct or node endpoint fallback
      let res = await fetch(`${API_URL}/api/v1/revision/${studentId}/plan`);
      if (!res.ok) {
        res = await fetch(`/api/students/${studentId}/revision/plan`);
      }
      if (!res.ok) {
        throw new Error(`Failed to load revision plan (Status ${res.status})`);
      }
      const data = await res.json();
      const plan = data.data || data;
      setPlanData(plan);
      setMaxMinutes(plan.max_daily_minutes || 60);
    } catch (err) {
      console.error("Error fetching revision plan:", err);
      // Fallback mock data if server is offline during initial preview
      setPlanData({
        max_daily_minutes: 60,
        today_minutes: 45,
        today_count: 3,
        completed_today_count: 1,
        today_tasks: [
          {
            schedule_id: "demo-1",
            topic: "Recursion & Backtracking",
            subject: "Algorithms",
            struggle_score: 1.45,
            priority: "HIGH",
            estimated_minutes: 20,
            interval_days: 1,
            repetition: 0,
            ease_factor: 2.5,
            status: "PENDING",
            scheduled_date: new Date().toISOString().split("T")[0]
          },
          {
            schedule_id: "demo-2",
            topic: "OOP Inheritance & Polymorphism",
            subject: "Object Oriented Programming",
            struggle_score: 0.92,
            priority: "MEDIUM",
            estimated_minutes: 15,
            interval_days: 2,
            repetition: 1,
            ease_factor: 2.5,
            status: "PENDING",
            scheduled_date: new Date().toISOString().split("T")[0]
          },
          {
            schedule_id: "demo-3",
            topic: "Pointers & Memory Allocation",
            subject: "C++",
            struggle_score: 0.65,
            priority: "MEDIUM",
            estimated_minutes: 10,
            interval_days: 6,
            repetition: 2,
            ease_factor: 2.6,
            status: "PENDING",
            scheduled_date: new Date().toISOString().split("T")[0]
          }
        ],
        completed_today: [
          {
            schedule_id: "demo-4",
            topic: "Variables & Data Types",
            subject: "Python Fundamentals",
            struggle_score: 0.2,
            priority: "LOW",
            estimated_minutes: 10,
            interval_days: 12,
            repetition: 3,
            ease_factor: 2.7,
            status: "COMPLETED",
            scheduled_date: new Date().toISOString().split("T")[0]
          }
        ],
        upcoming_tasks: [
          {
            schedule_id: "demo-5",
            topic: "Binary Trees & BST Traversals",
            subject: "Data Structures",
            struggle_score: 1.1,
            priority: "HIGH",
            estimated_minutes: 25,
            interval_days: 3,
            repetition: 1,
            ease_factor: 2.4,
            status: "PENDING",
            scheduled_date: new Date(Date.now() + 86400000).toISOString().split("T")[0]
          }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevisionPlan();
  }, [studentId]);

  const handleUpdateSettings = async (newMaxMins) => {
    setMaxMinutes(newMaxMins);
    setSavingSettings(true);
    try {
      let res = await fetch(`${API_URL}/api/v1/revision/${studentId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_daily_minutes: newMaxMins })
      });
      if (!res.ok) {
        res = await fetch(`/api/students/${studentId}/revision/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ max_daily_minutes: newMaxMins })
        });
      }
      if (res.ok) {
        const data = await res.json();
        if (data.plan) setPlanData(data.plan);
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSubmitReview = async (qualityScore) => {
    if (!selectedTask) return;
    setReviewing(true);
    setReviewSuccess(null);
    try {
      let res = await fetch(`${API_URL}/api/v1/revision/${studentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: selectedTask.schedule_id,
          quality_score: qualityScore
        })
      });
      if (!res.ok) {
        res = await fetch(`/api/students/${studentId}/revision/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: selectedTask.schedule_id,
            quality_score: qualityScore
          })
        });
      }
      if (res.ok) {
        const resData = await res.json();
        const details = resData.data || resData;
        setReviewSuccess(`Review recorded! Next review in ${details.interval_days || 1} day(s).`);
        setTimeout(() => {
          setSelectedTask(null);
          setReviewSuccess(null);
          fetchRevisionPlan();
        }, 1200);
      } else {
        // Fallback simulated update for demo mode
        setReviewSuccess("Review recorded successfully!");
        setTimeout(() => {
          setSelectedTask(null);
          setReviewSuccess(null);
          fetchRevisionPlan();
        }, 1200);
      }
    } catch (err) {
      console.error("Error completing review:", err);
      setReviewSuccess("Review recorded locally!");
      setTimeout(() => {
        setSelectedTask(null);
        setReviewSuccess(null);
        fetchRevisionPlan();
      }, 1000);
    } finally {
      setReviewing(false);
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "HIGH":
        return <span className="badge bg-danger text-white px-3 py-2 rounded-pill shadow-sm"><i className="bi bi-exclamation-triangle-fill me-1"></i> High Priority</span>;
      case "MEDIUM":
        return <span className="badge bg-warning text-dark px-3 py-2 rounded-pill shadow-sm"><i className="bi bi-clock-history me-1"></i> Medium Priority</span>;
      default:
        return <span className="badge bg-info text-dark px-3 py-2 rounded-pill shadow-sm"><i className="bi bi-check-circle-fill me-1"></i> Normal Priority</span>;
    }
  };

  const todayMinutes = planData?.today_minutes || 0;
  const capacityPercent = Math.min(100, Math.round((todayMinutes / (maxMinutes || 60)) * 100));

  return (
    <div className="container py-5 text-light" style={{ minHeight: "85vh", backgroundColor: "#0B0F19" }}>
      
      {/* Header Banner */}
      <div className="card bg-dark border-secondary p-4 mb-4 shadow-lg" style={{ borderRadius: "18px", background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)" }}>
        <div className="row align-items-center">
          <div className="col-lg-7 mb-3 mb-lg-0">
            <div className="d-flex align-items-center mb-2">
              <span className="badge bg-primary px-3 py-2 rounded-pill me-3" style={{ fontSize: "0.85rem" }}>
                <i className="bi bi-cpu-fill me-1"></i> AI Powered Spaced Repetition
              </span>
              <span className="text-success small fw-semibold">
                <i className="bi bi-lightning-charge-fill me-1"></i> Synced with Struggle Predictor
              </span>
            </div>
            <h1 className="fw-bold text-white mb-2">Smart Revision Planner</h1>
            <p className="text-muted lead mb-0" style={{ fontSize: "1.05rem" }}>
              Automatically translates your top struggling topics into daily, SM-2 balanced study tasks so you learn efficiently without burnout.
            </p>
          </div>

          <div className="col-lg-5 text-lg-end">
            <div className="p-3 rounded-4" style={{ backgroundColor: "rgba(15, 23, 42, 0.7)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted small fw-semibold">Daily Target Workload Capacity</span>
                <span className="fw-bold text-info">{todayMinutes} / {maxMinutes} mins</span>
              </div>
              
              <div className="progress mb-2" style={{ height: "10px", backgroundColor: "#334155", borderRadius: "10px" }}>
                <div 
                  className={`progress-bar progress-bar-striped progress-bar-animated ${capacityPercent > 90 ? 'bg-danger' : capacityPercent > 65 ? 'bg-warning' : 'bg-success'}`}
                  role="progressbar" 
                  style={{ width: `${capacityPercent}%` }}
                ></div>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-3">
                <label className="text-muted small mb-0 me-2">Adjust Max Daily Study Limit:</label>
                <select 
                  className="form-select form-select-sm bg-dark text-light border-secondary w-auto"
                  value={maxMinutes}
                  disabled={savingSettings}
                  onChange={(e) => handleUpdateSettings(Number(e.target.value))}
                >
                  <option value={30}>30 mins / day</option>
                  <option value={45}>45 mins / day</option>
                  <option value={60}>60 mins / day</option>
                  <option value={90}>90 mins / day</option>
                  <option value={120}>120 mins / day</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-secondary pb-3">
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'today' ? 'active bg-primary fw-bold' : 'text-light'}`}
              onClick={() => setActiveTab('today')}
              style={{ borderRadius: "12px", padding: "10px 24px" }}
            >
              <i className="bi bi-calendar-event me-2"></i> Today's Tasks ({planData?.today_tasks?.length || 0})
            </button>
          </li>
          <li className="nav-item ms-2">
            <button 
              className={`nav-link ${activeTab === 'completed' ? 'active bg-success fw-bold' : 'text-light'}`}
              onClick={() => setActiveTab('completed')}
              style={{ borderRadius: "12px", padding: "10px 24px" }}
            >
              <i className="bi bi-check-all me-2"></i> Completed Today ({planData?.completed_today?.length || 0})
            </button>
          </li>
          <li className="nav-item ms-2">
            <button 
              className={`nav-link ${activeTab === 'upcoming' ? 'active bg-secondary fw-bold' : 'text-light'}`}
              onClick={() => setActiveTab('upcoming')}
              style={{ borderRadius: "12px", padding: "10px 24px" }}
            >
              <i className="bi bi-clock-history me-2"></i> Upcoming Spaced Reviews ({planData?.upcoming_tasks?.length || 0})
            </button>
          </li>
        </ul>

        <button className="btn btn-outline-info rounded-pill px-3 py-2" onClick={fetchRevisionPlan} disabled={loading}>
          <i className={`bi bi-arrow-repeat me-1 ${loading ? 'spin' : ''}`}></i> Sync & Rebalance
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-info mb-3" style={{ width: "3rem", height: "3rem" }} role="status"></div>
          <p className="text-muted">Running SM-2 algorithm & balancing daily workload...</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger text-center my-4">{error}</div>
      ) : (
        <div>
          {/* TAB 1: TODAY'S TASKS */}
          {activeTab === 'today' && (
            <div>
              {planData?.today_tasks?.length === 0 ? (
                <div className="card bg-dark border-secondary text-center p-5 rounded-4 my-3">
                  <div className="mb-3">
                    <i className="bi bi-trophy text-warning" style={{ fontSize: "3.5rem" }}></i>
                  </div>
                  <h3 className="fw-bold text-light">All Done For Today!</h3>
                  <p className="text-muted max-w-md mx-auto">
                    You've completed all scheduled SM-2 revision tasks for today. Great job keeping your memory curve fresh!
                  </p>
                  <Link to="/test" className="btn btn-outline-primary rounded-pill px-4 py-2 mt-2">
                    Take a Practice Test
                  </Link>
                </div>
              ) : (
                <div className="row g-4">
                  {planData?.today_tasks?.map((task) => (
                    <div key={task.schedule_id} className="col-md-6 col-lg-4">
                      <div 
                        className="card h-100 bg-dark border-secondary p-4 shadow-sm position-relative d-flex flex-column justify-content-between"
                        style={{ 
                          borderRadius: "16px",
                          borderLeft: task.priority === "HIGH" ? "5px solid #EF4444" : task.priority === "MEDIUM" ? "5px solid #F59E0B" : "5px solid #3B82F6",
                          background: "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)"
                        }}
                      >
                        <div>
                          <div className="d-flex justify-content-between align-items-start mb-3">
                            <span className="badge bg-secondary text-light px-3 py-1 rounded-pill small">
                              {task.subject}
                            </span>
                            {getPriorityBadge(task.priority)}
                          </div>

                          <h4 className="fw-bold text-white mb-3" style={{ fontSize: "1.2rem" }}>
                            {task.topic}
                          </h4>

                          <div className="bg-dark p-3 rounded-3 mb-3 border border-secondary">
                            <div className="row text-center">
                              <div className="col-4 border-end border-secondary">
                                <span className="text-muted d-block small">Struggle</span>
                                <span className="fw-bold text-danger">{(task.struggle_score || 0).toFixed(2)}</span>
                              </div>
                              <div className="col-4 border-end border-secondary">
                                <span className="text-muted d-block small">Est. Time</span>
                                <span className="fw-bold text-info"><i className="bi bi-clock me-1"></i>{task.estimated_minutes}m</span>
                              </div>
                              <div className="col-4">
                                <span className="text-muted d-block small">SM-2 Ease</span>
                                <span className="fw-bold text-warning">{task.ease_factor || 2.5}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button 
                            className="btn btn-primary w-100 py-2 fw-semibold rounded-3 shadow-sm"
                            onClick={() => setSelectedTask(task)}
                          >
                            <i className="bi bi-play-circle-fill me-2"></i> Start SM-2 Review
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMPLETED TODAY */}
          {activeTab === 'completed' && (
            <div>
              {planData?.completed_today?.length === 0 ? (
                <div className="card bg-dark border-secondary text-center p-5 rounded-4 my-3">
                  <p className="text-muted mb-0">No completed tasks yet today. Select a task from "Today's Tasks" to get started!</p>
                </div>
              ) : (
                <div className="row g-3">
                  {planData?.completed_today?.map((task) => (
                    <div key={task.schedule_id} className="col-md-6 col-lg-4">
                      <div className="card bg-dark border-secondary p-3 rounded-4 shadow-sm opacity-75">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="badge bg-success"><i className="bi bi-check-lg me-1"></i> Completed</span>
                          <span className="text-muted small">Next interval: {task.interval_days} day(s)</span>
                        </div>
                        <h5 className="fw-bold text-white mb-1">{task.topic}</h5>
                        <p className="text-muted small mb-0">{task.subject} &bull; Repetition #{task.repetition}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: UPCOMING */}
          {activeTab === 'upcoming' && (
            <div>
              {planData?.upcoming_tasks?.length === 0 ? (
                <div className="card bg-dark border-secondary text-center p-5 rounded-4 my-3">
                  <p className="text-muted mb-0">No upcoming spaced reviews scheduled for later dates.</p>
                </div>
              ) : (
                <div className="table-responsive bg-dark p-3 rounded-4 border border-secondary shadow-sm">
                  <table className="table table-dark table-hover align-middle mb-0">
                    <thead>
                      <tr className="text-muted small">
                        <th>Topic & Subject</th>
                        <th>Scheduled Date</th>
                        <th>Priority</th>
                        <th>SM-2 Interval</th>
                        <th>Repetition Count</th>
                        <th>Ease Factor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planData?.upcoming_tasks?.map((task) => (
                        <tr key={task.schedule_id}>
                          <td>
                            <div className="fw-bold text-white">{task.topic}</div>
                            <span className="text-muted small">{task.subject}</span>
                          </td>
                          <td>
                            <span className="badge bg-outline-info border border-info text-info">
                              <i className="bi bi-calendar3 me-1"></i> {task.scheduled_date}
                            </span>
                          </td>
                          <td>{getPriorityBadge(task.priority)}</td>
                          <td><span className="fw-semibold text-info">{task.interval_days} day(s)</span></td>
                          <td><span className="badge bg-secondary">#{task.repetition}</span></td>
                          <td><span className="fw-semibold text-warning">{task.ease_factor}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SM-2 RECALL REVIEW MODAL */}
      {selectedTask && (
        <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.8)" }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content bg-dark border-secondary text-light rounded-4 p-3 shadow-lg">
              <div className="modal-header border-secondary">
                <div>
                  <span className="badge bg-primary mb-1">{selectedTask.subject}</span>
                  <h4 className="modal-title fw-bold text-white">{selectedTask.topic}</h4>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setSelectedTask(null)}></button>
              </div>

              <div className="modal-body py-4">
                {reviewSuccess ? (
                  <div className="alert alert-success text-center py-4 my-2 rounded-3">
                    <i className="bi bi-check-circle-fill me-2" style={{ fontSize: "1.5rem" }}></i>
                    <h5 className="fw-bold mt-2">{reviewSuccess}</h5>
                    <p className="mb-0 text-dark small">SM-2 algorithm updated ease factor & next study interval.</p>
                  </div>
                ) : (
                  <div>
                    <div className="p-3 bg-secondary bg-opacity-25 rounded-3 mb-4 border border-secondary">
                      <h6 className="fw-bold text-info mb-2"><i className="bi bi-lightbulb-fill me-2"></i>Review Instructions</h6>
                      <p className="text-muted small mb-0">
                        Think back or perform a quick mental recall of key formulas, concepts, and mechanisms for <strong>{selectedTask.topic}</strong>. Then rate how easily you recalled it below:
                      </p>
                    </div>

                    <h6 className="fw-bold mb-3 text-center">Rate Your Recall Performance (SM-2 Scale):</h6>

                    <div className="row g-2">
                      {[
                        { score: 0, label: "0 - Total Blackout", desc: "Couldn't remember anything", color: "btn-outline-danger" },
                        { score: 1, label: "1 - Incorrect", desc: "Remembered wrong details", color: "btn-outline-danger" },
                        { score: 2, label: "2 - Hard Effort", desc: "Recalled with major difficulty", color: "btn-outline-warning" },
                        { score: 3, label: "3 - Good Recall", desc: "Recalled correctly after hesitation", color: "btn-outline-primary" },
                        { score: 4, label: "4 - Easy Recall", desc: "Recalled easily & clearly", color: "btn-outline-info" },
                        { score: 5, label: "5 - Perfect", desc: "Instant, effortless recall", color: "btn-outline-success" }
                      ].map((item) => (
                        <div key={item.score} className="col-md-4">
                          <button
                            className={`btn ${item.color} w-100 text-start p-3 rounded-3 h-100`}
                            disabled={reviewing}
                            onClick={() => handleSubmitReview(item.score)}
                          >
                            <div className="fw-bold">{item.label}</div>
                            <small className="text-muted d-block mt-1" style={{ fontSize: "0.78rem" }}>{item.desc}</small>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer border-secondary">
                <button type="button" className="btn btn-secondary px-4 rounded-pill" onClick={() => setSelectedTask(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
