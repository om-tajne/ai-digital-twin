import { useEffect, useMemo, useState } from "react";
import { FASTAPI_API_URL } from "../config";

const API_BASE_URL = FASTAPI_API_URL;

const COLORS = {
  background: "#0F172A",
  primary: "#2563EB",
  secondary: "#1E3A8A",
  card: "#172554",
  cardLight: "#1E293B",
  border: "#334155",
  text: "#F8FAFC",
  muted: "#CBD5E1",
};

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

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateString) {
  if (!dateString) return "No date";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getPriorityColor(priority) {
  const value = String(priority || "").toLowerCase();

  if (value === "high") return "#2563EB";
  if (value === "medium") return "#3B82F6";
  if (value === "low") return "#60A5FA";

  return "#64748B";
}

function normalizeTask(task) {
  return {
    id: task.schedule_id,

    topic: task.topic || "Study Task",

    subject: task.subject || "General",

    taskType: task.task_type || "Revision",

    priority: task.priority || "LOW",

    scheduledDate: task.scheduled_date || getToday(),

    duration: Number(task.estimated_minutes || 15),

    completed:
      String(task.status || "").toUpperCase() === "COMPLETED",

    struggleScore: Number(task.struggle_score || 0),

    repetition: Number(task.repetition || 0),

    easeFactor: Number(task.ease_factor || 2.5),

    intervalDays: Number(task.interval_days || 1),

    lastReviewedAt: task.last_reviewed_at || null,

    status: task.status || "PENDING",
  };
}

export default function StudyPlanner() {
  const [selectedDate, setSelectedDate] = useState(getToday());

  const [tasks, setTasks] = useState([]);

  const [loading, setLoading] = useState(true);

  const [completingTask, setCompletingTask] = useState(null);

  const [error, setError] = useState("");

  const [maxDailyMinutes, setMaxDailyMinutes] = useState(60);

  const studentId = getStudentId();

  // ============================================================
  // FETCH DYNAMIC REVISION PLAN
  // ============================================================

  const fetchTasks = async () => {
    if (!studentId) {
      setError("Student ID not found. Please login again.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_BASE_URL}/revision/${studentId}/plan`
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "Revision plan API error:",
          response.status,
          errorText
        );

        throw new Error(
          `Failed to fetch revision plan: ${response.status}`
        );
      }

      const data = await response.json();

      console.log("Dynamic Revision Plan:", data);

      // Dynamic daily limit from backend
      if (data.max_daily_minutes !== undefined) {
        setMaxDailyMinutes(
          Number(data.max_daily_minutes)
        );
      }

      // Dynamic tasks from backend
      const allTasks = Array.isArray(data.all_tasks)
        ? data.all_tasks
        : [];

      setTasks(
        allTasks.map(normalizeTask)
      );
    } catch (err) {
      console.error(
        "Revision planner fetch error:",
        err
      );

      setError(
        "Unable to load your study plan. Please make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    fetchTasks();
  }, [studentId]);

  // ============================================================
  // SELECTED DATE TASKS
  // ============================================================

  const selectedTasks = useMemo(() => {
    return tasks.filter(
      (task) =>
        task.scheduledDate?.slice(0, 10) === selectedDate
    );
  }, [tasks, selectedDate]);

  // ============================================================
  // UPCOMING TASKS
  // ============================================================

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter(
        (task) =>
          task.scheduledDate?.slice(0, 10) > selectedDate &&
          !task.completed
      )
      .sort((a, b) =>
        String(a.scheduledDate).localeCompare(
          String(b.scheduledDate)
        )
      )
      .slice(0, 6);
  }, [tasks, selectedDate]);

  // ============================================================
  // DYNAMIC STATISTICS
  // ============================================================

  const completedCount = selectedTasks.filter(
    (task) => task.completed
  ).length;

  const pendingCount =
    selectedTasks.length - completedCount;

  const totalDuration = selectedTasks.reduce(
    (total, task) =>
      total + Number(task.duration || 0),
    0
  );

  const completionPercentage =
    selectedTasks.length > 0
      ? Math.round(
          (completedCount / selectedTasks.length) * 100
        )
      : 0;

  // ============================================================
  // COMPLETE REVISION TASK
  // ============================================================

  const completeTask = async (scheduleId) => {
    if (!scheduleId) {
      setError("Revision schedule ID is missing.");
      return;
    }

    if (!studentId) {
      setError("Student ID not found. Please login again.");
      return;
    }

    try {
      setCompletingTask(scheduleId);
      setError("");

      const response = await fetch(
        `${API_BASE_URL}/revision/${studentId}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            schedule_id: scheduleId,

            // Current backend expects quality_score.
            // 5 means successful/perfect revision.
            quality_score: 5,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "Review API error:",
          response.status,
          errorText
        );

        throw new Error(
          `Failed to complete task: ${response.status}`
        );
      }

      /*
       * IMPORTANT:
       * Do not manually mark only the local task as completed.
       *
       * Backend changes:
       * - repetition
       * - ease factor
       * - interval
       * - next review date
       * - status
       *
       * Therefore fetch the complete plan again.
       */

      await fetchTasks();

    } catch (err) {
      console.error(
        "Complete revision error:",
        err
      );

      setError(
        "Unable to complete this revision task. Please try again."
      );
    } finally {
      setCompletingTask(null);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.background,
        color: COLORS.text,
        padding: "30px 15px",
      }}
    >
      <div className="container">

        {/* ================================================== */}
        {/* PAGE HEADER */}
        {/* ================================================== */}

        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">

          <div>
            <h1 className="fw-bold mb-2">
              📚 Study Planner
            </h1>

            <p
              className="mb-0"
              style={{ color: COLORS.muted }}
            >
              Your revision plan is generated dynamically
              from your learning progress and struggles.
            </p>
          </div>

          <div className="mt-3 mt-md-0">

            <label
              className="form-label mb-1"
              style={{ color: COLORS.muted }}
            >
              Select Date
            </label>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) =>
                setSelectedDate(e.target.value)
              }
              className="form-control"
            />

          </div>
        </div>

        {/* ================================================== */}
        {/* ERROR */}
        {/* ================================================== */}

        {error && (
          <div
            className="alert mb-4"
            style={{
              backgroundColor: "#172554",
              color: "#BFDBFE",
              border: "1px solid #2563EB",
            }}
          >
            {error}
          </div>
        )}

        {/* ================================================== */}
        {/* STATISTICS */}
        {/* ================================================== */}

        <div className="row g-3 mb-4">

          {/* TOTAL TASKS */}
          <div className="col-md-3">
            <div
              className="p-4 rounded-4 h-100"
              style={{
                backgroundColor: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="mb-2"
                style={{
                  color: COLORS.muted,
                }}
              >
                📋 Tasks
              </div>

              <h2 className="fw-bold mb-0">
                {selectedTasks.length}
              </h2>
            </div>
          </div>

          {/* COMPLETED */}
          <div className="col-md-3">
            <div
              className="p-4 rounded-4 h-100"
              style={{
                backgroundColor: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="mb-2"
                style={{
                  color: COLORS.muted,
                }}
              >
                ✅ Completed
              </div>

              <h2 className="fw-bold mb-0">
                {completedCount}
              </h2>
            </div>
          </div>

          {/* PENDING */}
          <div className="col-md-3">
            <div
              className="p-4 rounded-4 h-100"
              style={{
                backgroundColor: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="mb-2"
                style={{
                  color: COLORS.muted,
                }}
              >
                ⏳ Pending
              </div>

              <h2 className="fw-bold mb-0">
                {pendingCount}
              </h2>
            </div>
          </div>

          {/* STUDY TIME */}
          <div className="col-md-3">
            <div
              className="p-4 rounded-4 h-100"
              style={{
                backgroundColor: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                className="mb-2"
                style={{
                  color: COLORS.muted,
                }}
              >
                ⏱ Study Time
              </div>

              <h2 className="fw-bold mb-0">
                {totalDuration} min
              </h2>

              <small
                style={{
                  color: COLORS.muted,
                }}
              >
                Daily limit: {maxDailyMinutes} min
              </small>
            </div>
          </div>

        </div>

        {/* ================================================== */}
        {/* PROGRESS */}
        {/* ================================================== */}

        {!loading && selectedTasks.length > 0 && (
          <div
            className="p-4 rounded-4 mb-4"
            style={{
              backgroundColor: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div className="d-flex justify-content-between mb-2">

              <span
                style={{
                  color: COLORS.muted,
                }}
              >
                Daily Progress
              </span>

              <strong>
                {completionPercentage}%
              </strong>

            </div>

            <div
              className="progress"
              style={{
                height: "10px",
                backgroundColor: "#1E293B",
              }}
            >
              <div
                className="progress-bar"
                role="progressbar"
                style={{
                  width: `${completionPercentage}%`,
                  backgroundColor: COLORS.primary,
                }}
              />
            </div>
          </div>
        )}

        {/* ================================================== */}
        {/* TODAY'S / SELECTED DATE SCHEDULE */}
        {/* ================================================== */}

        <div
          className="rounded-4 mb-4 overflow-hidden"
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >

          <div
            className="p-4"
            style={{
              backgroundColor: COLORS.secondary,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            <h4 className="fw-bold mb-1">
              📅 Schedule for {formatDate(selectedDate)}
            </h4>

            <small
              style={{
                color: "#BFDBFE",
              }}
            >
              Dynamically generated from your revision plan
            </small>
          </div>

          <div className="p-4">

            {loading ? (

              <div className="text-center py-5">

                <div
                  className="spinner-border"
                  style={{
                    color: COLORS.primary,
                  }}
                  role="status"
                />

                <p
                  className="mt-3 mb-0"
                  style={{
                    color: COLORS.muted,
                  }}
                >
                  Loading your study plan...
                </p>

              </div>

            ) : selectedTasks.length === 0 ? (

              <div className="text-center py-5">

                <div
                  style={{
                    fontSize: "50px",
                    marginBottom: "15px",
                  }}
                >
                  📖
                </div>

                <h5>
                  No tasks scheduled
                </h5>

                <p
                  style={{
                    color: COLORS.muted,
                  }}
                >
                  There are no revision tasks for this date.
                </p>

              </div>

            ) : (

              <div className="d-flex flex-column gap-3">

                {selectedTasks.map((task) => (

                  <div
                    key={task.id}
                    className="p-3 rounded-4"
                    style={{
                      backgroundColor:
                        COLORS.cardLight,

                      border: task.completed
                        ? "1px solid #2563EB"
                        : `1px solid ${COLORS.border}`,
                    }}
                  >

                    <div className="row align-items-center">

                      {/* TASK INFORMATION */}
                      <div className="col-md-8">

                        <div className="d-flex gap-3 align-items-start">

                          <div
                            style={{
                              fontSize: "30px",
                              minWidth: "40px",
                            }}
                          >
                            🔄
                          </div>

                          <div>

                            <h5
                              className="fw-bold mb-2"
                              style={{
                                textDecoration:
                                  task.completed
                                    ? "line-through"
                                    : "none",

                                color: task.completed
                                  ? "#94A3B8"
                                  : COLORS.text,
                              }}
                            >
                              {task.topic}
                            </h5>

                            {task.subject && (
                              <div
                                className="mb-2"
                                style={{
                                  color: COLORS.muted,
                                }}
                              >
                                📘 {task.subject}
                              </div>
                            )}

                            <div className="d-flex flex-wrap gap-2">

                              <span
                                className="badge rounded-pill"
                                style={{
                                  backgroundColor:
                                    COLORS.primary,
                                }}
                              >
                                🔄 {task.taskType}
                              </span>

                              <span
                                className="badge rounded-pill"
                                style={{
                                  backgroundColor:
                                    getPriorityColor(
                                      task.priority
                                    ),
                                }}
                              >
                                {task.priority} Priority
                              </span>

                              <span
                                className="badge rounded-pill"
                                style={{
                                  backgroundColor:
                                    COLORS.secondary,
                                  color: "#BFDBFE",
                                }}
                              >
                                ⏱ {task.duration} min
                              </span>

                            </div>

                            {/* SM-2 INFORMATION */}
                            <div
                              className="mt-2 small"
                              style={{
                                color: COLORS.muted,
                              }}
                            >
                              Revisions:{" "}
                              {task.repetition}
                              {" • "}
                              Interval:{" "}
                              {task.intervalDays} day
                              {task.intervalDays !== 1
                                ? "s"
                                : ""}
                              {" • "}
                              Ease:{" "}
                              {task.easeFactor}
                            </div>

                            {task.struggleScore > 0 && (
                              <div
                                className="small mt-1"
                                style={{
                                  color: "#93C5FD",
                                }}
                              >
                                📊 Struggle Score:{" "}
                                {task.struggleScore.toFixed(
                                  2
                                )}
                              </div>
                            )}

                          </div>

                        </div>

                      </div>

                      {/* COMPLETE BUTTON */}
                      <div className="col-md-4 text-md-end mt-3 mt-md-0">

                        {task.completed ? (

                          <span
                            className="badge rounded-pill px-3 py-2"
                            style={{
                              backgroundColor:
                                "#1D4ED8",
                              color: "white",
                            }}
                          >
                            ✓ Completed
                          </span>

                        ) : (

                          <button
                            className="btn rounded-pill px-4"
                            onClick={() =>
                              completeTask(task.id)
                            }
                            disabled={
                              completingTask === task.id
                            }
                            style={{
                              backgroundColor:
                                COLORS.primary,
                              color: "white",
                              border: "none",
                            }}
                          >
                            {completingTask === task.id
                              ? "Updating..."
                              : "✓ Complete"}
                          </button>

                        )}

                      </div>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

        {/* ================================================== */}
        {/* UPCOMING REVISION */}
        {/* ================================================== */}

        <div
          className="rounded-4 overflow-hidden"
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >

          <div
            className="p-4"
            style={{
              backgroundColor: COLORS.secondary,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >

            <h4 className="fw-bold mb-1">
              🔄 Upcoming Revision
            </h4>

            <small
              style={{
                color: "#BFDBFE",
              }}
            >
              Next revision tasks calculated by SM-2
            </small>

          </div>

          <div className="p-4">

            {upcomingTasks.length === 0 ? (

              <div className="text-center py-4">

                <div
                  style={{
                    fontSize: "40px",
                  }}
                >
                  📚
                </div>

                <p
                  className="mt-2 mb-0"
                  style={{
                    color: COLORS.muted,
                  }}
                >
                  No upcoming revision tasks.
                </p>

              </div>

            ) : (

              <div className="row g-3">

                {upcomingTasks.map((task) => (

                  <div
                    className="col-md-6"
                    key={task.id}
                  >

                    <div
                      className="p-3 rounded-4 h-100"
                      style={{
                        backgroundColor:
                          COLORS.cardLight,

                        border:
                          `1px solid ${COLORS.border}`,
                      }}
                    >

                      <div className="d-flex justify-content-between">

                        <div>

                          <h5 className="fw-bold">
                            {task.topic}
                          </h5>

                          {task.subject && (
                            <p
                              className="mb-2"
                              style={{
                                color:
                                  COLORS.muted,
                              }}
                            >
                              📘 {task.subject}
                            </p>
                          )}

                          <p
                            className="mb-2"
                            style={{
                              color:
                                COLORS.muted,
                            }}
                          >
                            📅{" "}
                            {formatDate(
                              task.scheduledDate
                            )}
                          </p>

                          <div className="d-flex flex-wrap gap-2">

                            <span
                              className="badge rounded-pill"
                              style={{
                                backgroundColor:
                                  COLORS.primary,
                              }}
                            >
                              🔄 {task.taskType}
                            </span>

                            <span
                              className="badge rounded-pill"
                              style={{
                                backgroundColor:
                                  getPriorityColor(
                                    task.priority
                                  ),
                              }}
                            >
                              {task.priority}
                            </span>

                            <span
                              className="badge rounded-pill"
                              style={{
                                backgroundColor:
                                  COLORS.secondary,
                                color: "#BFDBFE",
                              }}
                            >
                              ⏱ {task.duration} min
                            </span>

                          </div>

                          <div
                            className="small mt-2"
                            style={{
                              color:
                                COLORS.muted,
                            }}
                          >
                            🔁 Repetition:{" "}
                            {task.repetition}
                            {" • "}
                            📅 Every{" "}
                            {task.intervalDays} day
                            {task.intervalDays !== 1
                              ? "s"
                              : ""}
                          </div>

                        </div>

                        <div
                          style={{
                            fontSize: "28px",
                          }}
                        >
                          📚
                        </div>

                      </div>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

        {/* ================================================== */}
        {/* REFRESH */}
        {/* ================================================== */}

        <div className="text-center mt-4">

          <button
            className="btn rounded-pill px-4"
            onClick={fetchTasks}
            disabled={loading}
            style={{
              backgroundColor:
                COLORS.secondary,
              color: "#DBEAFE",
              border:
                "1px solid #2563EB",
            }}
          >
            🔄 Refresh Planner
          </button>

        </div>

      </div>
    </div>
  );
}