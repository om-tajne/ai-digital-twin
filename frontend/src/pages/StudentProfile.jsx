
import { useContext, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Card,
  Col,
  ProgressBar,
  Row,
  Spinner,
} from "react-bootstrap";
import { AuthContext } from "../context/AuthContext";
import { FASTAPI_URL } from "../config";

const API_URL = FASTAPI_URL;

export default function StudentProfile() {
  const { user } = useContext(AuthContext);

  const [mastery, setMastery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const studentId = user?.student_id || user?.id;

  const fetchMastery = async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/api/v1/mastery/${studentId}`
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch mastery data: ${response.status}`
        );
      }

      const data = await response.json();

      const masteryData = Array.isArray(data)
        ? data
        : Array.isArray(data.mastery)
        ? data.mastery
        : Array.isArray(data.data)
        ? data.data
        : [];

      setMastery(masteryData);
    } catch (err) {
      console.error("Failed to fetch mastery:", err);
      setError("Unable to load mastery data.");
      setMastery([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMastery();
  }, [studentId]);

  useEffect(() => {
    const handleFocus = () => {
      fetchMastery();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [studentId]);

  const subjectSummary = useMemo(() => {
    const grouped = {};

    mastery.forEach((item) => {
      const subject = item.subject || "General";

      if (!grouped[subject]) {
        grouped[subject] = [];
      }

      grouped[subject].push(item);
    });

    return grouped;
  }, [mastery]);

  const getPercentage = (item) => {
    if (item.mastery_percentage !== undefined) {
      return Number(item.mastery_percentage);
    }

    if (item.percentage !== undefined) {
      return Number(item.percentage);
    }

    if (item.mastery_score !== undefined) {
      return Number(item.mastery_score) * 100;
    }

    if (item.score !== undefined) {
      return Number(item.score) * 100;
    }

    if (
      item.correct_answers !== undefined &&
      item.total_questions
    ) {
      return (
        (Number(item.correct_answers) /
          Number(item.total_questions)) *
        100
      );
    }

    return 0;
  };

  const getProgressVariant = (percentage) => {
    if (percentage >= 80) return "success";
    if (percentage >= 50) return "warning";
    return "danger";
  };

  if (loading) {
    return (
      <div
        className="min-vh-100 d-flex justify-content-center align-items-center"
        style={{
          background: "#0F172A",
          color: "#ffffff",
        }}
      >
        <div className="text-center">
          <Spinner animation="border" />

          <div
            className="mt-3"
            style={{
              color: "#b8c4d9",
            }}
          >
            Loading mastery profile...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-vh-100"
      style={{
        background: "#0F172A",
        color: "#ffffff",
        padding: "32px",
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: "1200px",
        }}
      >
        {/* ================= HEADER ================= */}

        <div
          className="mb-4 p-4"
          style={{
            background:
              "linear-gradient(145deg, #16213e, #0f3460)",
            border: "1px solid #1e3a5f",
            borderRadius: "20px",
            boxShadow:
              "0 4px 15px rgba(0, 0, 0, 0.25)",
          }}
        >
          <div
            className="text-uppercase small mb-2"
            style={{
              letterSpacing: "0.15em",
              color: "#b8c4d9",
            }}
          >
            Student Profile
          </div>

          <h1
            className="fw-semibold mb-2"
            style={{
              color: "#ffffff",
            }}
          >
            {user?.full_name ||
              user?.name ||
              "Student"}
          </h1>

          <div
            style={{
              color: "#b8c4d9",
            }}
          >
            Topic-wise learning mastery
          </div>
        </div>

        {/* ================= ERROR ================= */}

        {error && (
          <Alert variant="danger">
            {error}

            <div className="mt-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={fetchMastery}
              >
                Retry
              </button>
            </div>
          </Alert>
        )}

        {/* ================= EMPTY STATE ================= */}

        {!error && mastery.length === 0 && (
          <Card
            className="border-0 p-4 text-center"
            style={{
              background:
                "linear-gradient(145deg, #16213e, #0f3460)",
              border: "1px solid #1e3a5f",
              color: "#b8c4d9",
              borderRadius: "18px",
            }}
          >
            <div
              style={{
                fontSize: "18px",
                color: "#ffffff",
              }}
            >
              No mastery data available yet.
            </div>

            <div
              className="mt-2"
              style={{
                color: "#b8c4d9",
              }}
            >
              Complete a test to generate your
              mastery scores.
            </div>
          </Card>
        )}

        {/* ================= SUBJECT SECTIONS ================= */}

        {Object.entries(subjectSummary).map(
          ([subject, topics]) => (
            <div
              key={subject}
              className="mb-5"
            >
              {/* Subject heading */}

              <div className="d-flex align-items-center justify-content-between mb-3">
                <h3
                  className="mb-0"
                  style={{
                    color: "#ffffff",
                  }}
                >
                  {subject}
                </h3>

                <Badge
                  className="rounded-pill px-3 py-2"
                  style={{
                    background: "#16213e",
                    border: "1px solid #1e3a5f",
                    color: "#ffffff",
                  }}
                >
                  {topics.length} topic
                  {topics.length !== 1
                    ? "s"
                    : ""}
                </Badge>
              </div>

              {/* Topics */}

              <Row className="g-3">
                {topics.map((item) => {
                  const percentage = Math.min(
                    100,
                    Math.max(
                      0,
                      getPercentage(item)
                    )
                  );

                  return (
                    <Col
                      key={`${item.subject}-${item.topic}`}
                      md={6}
                      xl={4}
                    >
                      <Card
                        className="h-100 border-0 p-4 mastery-topic-card"
                        style={{
                          background:
                            "linear-gradient(145deg, #16213e, #0f3460)",
                          border:
                            "1px solid #1e3a5f",
                          borderRadius: "18px",
                          transition:
                            "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
                        }}
                      >
                        {/* Topic + Percentage */}

                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <div>
                            <div
                              className="small text-uppercase mb-1"
                              style={{
                                color: "#b8c4d9",
                                letterSpacing:
                                  "0.1em",
                              }}
                            >
                              Topic
                            </div>

                            <h5
                              className="mb-0"
                              style={{
                                color: "#ffffff",
                              }}
                            >
                              {item.topic ||
                                "General"}
                            </h5>
                          </div>

                          <div
                            className="fw-semibold"
                            style={{
                              color:
                                percentage >= 80
                                  ? "#4ade80"
                                  : percentage >= 50
                                  ? "#facc15"
                                  : "#f87171",
                              fontSize: "22px",
                            }}
                          >
                            {percentage.toFixed(2)}
                            %
                          </div>
                        </div>

                        {/* Progress */}

                        <ProgressBar
                          now={percentage}
                          variant={getProgressVariant(
                            percentage
                          )}
                          style={{
                            height: "10px",
                            background:
                              "#0F172A",
                            borderRadius: "10px",
                          }}
                        />

                        {/* Correct / Total */}

                        <div
                          className="mt-3 d-flex justify-content-between"
                          style={{
                            color: "#b8c4d9",
                            fontSize: "13px",
                          }}
                        >
                          <span>
                            Correct:{" "}
                            {item.correct_answers}
                          </span>

                          <span>
                            Total:{" "}
                            {item.total_questions}
                          </span>
                        </div>

                        {/* BKT score */}

                        {item.mastery_score !==
                          undefined && (
                          <div
                            className="mt-2"
                            style={{
                              color: "#8fa6c2",
                              fontSize: "12px",
                            }}
                          >
                            BKT Score:{" "}
                            {Number(
                              item.mastery_score
                            ).toFixed(4)}
                          </div>
                        )}
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </div>
          )
        )}
      </div>

      {/* ================= CARD HOVER ================= */}

      <style>
        {`
          .mastery-topic-card:hover {
            transform: translateY(-6px);
            box-shadow:
              0 10px 30px rgba(15, 52, 96, 0.6);
            border-color: #3a6ea5 !important;
          }
        `}
      </style>
    </div>
  );
}

