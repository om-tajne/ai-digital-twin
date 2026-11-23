import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { FASTAPI_URL } from "../config";

const API_URL = FASTAPI_URL;

export default function TopStruggles({ studentId: propStudentId }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [struggles, setStruggles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFormulaInfo, setShowFormulaInfo] = useState(false);

  const studentId = propStudentId || user?.student_id || user?.id;

  const fetchTopStruggles = async (isManualRefresh = false) => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/v1/struggles/${studentId}`);

      if (!response.ok) {
        throw new Error(`Struggle API failed: ${response.status}`);
      }

      const data = await response.json();

      const records = Array.isArray(data)
        ? data
        : Array.isArray(data?.top_struggles)
        ? data.top_struggles
        : Array.isArray(data?.struggles)
        ? data.struggles
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.results)
        ? data.results
        : [];

      setStruggles(records.slice(0, 5));
    } catch (err) {
      console.error("Failed to load struggles:", err);
      setError("Unable to load top struggles.");
      setStruggles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopStruggles();
  }, [studentId]);

  const handlePracticeTopic = (item) => {
    const topic = item?.topic || "";
    const subject = item?.subject || "";
    navigate(`/test?topic=${encodeURIComponent(topic)}&subject=${encodeURIComponent(subject)}`);
  };

  const getUrgencyConfig = (score) => {
    const val = Number(score) || 0;
    if (val >= 1.5) {
      return {
        label: "Critical Priority",
        color: "#f87171",
        bg: "rgba(239, 68, 68, 0.15)",
        border: "rgba(239, 68, 68, 0.35)",
        progressColor: "#ef4444",
      };
    }
    if (val >= 1.0) {
      return {
        label: "High Priority",
        color: "#fbbf24",
        bg: "rgba(245, 158, 11, 0.15)",
        border: "rgba(245, 158, 11, 0.35)",
        progressColor: "#f59e0b",
      };
    }
    return {
      label: "Moderate Priority",
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.15)",
      border: "rgba(56, 189, 248, 0.35)",
      progressColor: "#38bdf8",
    };
  };

  return (
    <div className="top-struggles-card">
      <div className="top-struggles-header">
        <div className="header-titles">
          <div className="header-badge">
            <span className="pulsing-dot" />
            <span>AI Struggle Predictor</span>
          </div>
          <h3 className="section-title">Top Struggles & Weak Spots</h3>
          <p className="section-desc">
            Algorithmic priority calculated via: <code>(1 - Mastery) × Syllabus Weight × Time Decay</code>
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="action-btn-secondary"
            onClick={() => setShowFormulaInfo(!showFormulaInfo)}
            title="How this score is calculated"
          >
            <i className="bi bi-info-circle me-1" />
            {showFormulaInfo ? "Hide Formula" : "Formula Info"}
          </button>

          <button
            type="button"
            className="action-btn-primary"
            onClick={() => fetchTopStruggles(true)}
            disabled={loading}
            title="Refresh struggle calculations"
          >
            <i className={`bi bi-arrow-clockwise me-1 ${loading ? "spinning" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {showFormulaInfo && (
        <div className="formula-info-panel">
          <div className="formula-header">
            <i className="bi bi-cpu text-info me-2" />
            <strong>SM2 / BKT Struggle Prediction Algorithm:</strong>
          </div>
          <div className="formula-equation">
            <code>Struggle Score = (1 - Mastery) × Syllabus Weight × Time Decay</code>
          </div>
          <div className="formula-breakdown-grid">
            <div className="formula-factor">
              <span className="factor-name">(1 - Mastery)</span>
              <span className="factor-desc">Knowledge deficit based on recent quiz and test performance.</span>
            </div>
            <div className="formula-factor">
              <span className="factor-name">Syllabus Weight</span>
              <span className="factor-desc">Curriculum importance multiplier from the syllabus table (1.0× - 2.0×).</span>
            </div>
            <div className="formula-factor">
              <span className="factor-name">Time Decay</span>
              <span className="factor-desc">Memory decay penalty that accumulates as days pass without practice (up to 2.0×).</span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="struggles-loading">
          <div className="spinner-border text-info" role="status" style={{ width: 32, height: 32 }}>
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-secondary">Computing spaced-repetition decay and struggle scores...</p>
        </div>
      ) : error ? (
        <div className="struggles-error">
          <i className="bi bi-exclamation-triangle-fill text-danger me-2" />
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger ms-3" onClick={() => fetchTopStruggles(true)}>
            Try Again
          </button>
        </div>
      ) : struggles.length === 0 ? (
        <div className="struggles-empty">
          <i className="bi bi-check2-circle text-success" style={{ fontSize: 32 }} />
          <h5 className="mt-2 text-light">No critical struggles detected!</h5>
          <p className="text-secondary mb-0">
            You are staying on top of your revisions. Complete more practice quizzes to calibrate your mastery profile.
          </p>
        </div>
      ) : (
        <div className="struggle-list">
          {struggles.map((item, index) => {
            const mastery = Number(item.mastery_percentage) || 0;
            const score = Number(item.struggle_score) || 0;
            const timeDecay = Number(item.time_decay) || 1.0;
            const weight = Number(item.syllabus_weight) || 1.0;
            const urgency = getUrgencyConfig(score);

            return (
              <div className="struggle-item" key={item.topic || index}>
                <div className="rank-col">
                  <div className="struggle-rank" style={{ borderColor: urgency.border, color: urgency.color }}>
                    #{index + 1}
                  </div>
                </div>

                <div className="info-col">
                  <div className="title-row">
                    <span className="struggle-topic">{item.topic || "Unknown Topic"}</span>
                    <span className="subject-pill">{item.subject || "General"}</span>
                    <span
                      className="urgency-badge"
                      style={{
                        backgroundColor: urgency.bg,
                        color: urgency.color,
                        border: `1px solid ${urgency.border}`,
                      }}
                    >
                      {urgency.label}
                    </span>
                  </div>

                  <div className="progress-row">
                    <div className="progress-info">
                      <span className="progress-label">
                        Mastery: <strong>{mastery.toFixed(1)}%</strong>
                      </span>
                      <span className="deficit-label">
                        Deficit: {(100 - mastery).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mastery-track">
                      <div
                        className="mastery-fill"
                        style={{
                          width: `${Math.max(5, Math.min(100, mastery))}%`,
                          backgroundColor: urgency.progressColor,
                        }}
                      />
                    </div>
                  </div>

                  <div className="metrics-row">
                    <span className="metric-pill">
                      Weight: <strong>{weight.toFixed(1)}×</strong>
                    </span>
                    <span className="metric-pill">
                      Time Decay: <strong>{timeDecay.toFixed(2)}×</strong>
                    </span>
                    <span className="metric-pill">
                      Struggle Index: <strong>{score.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>

                <div className="action-col">
                  <button
                    type="button"
                    className="practice-btn"
                    onClick={() => handlePracticeTopic(item)}
                    title={`Start practice quiz on ${item.topic}`}
                  >
                    <i className="bi bi-lightning-charge-fill me-1" />
                    Practice Now
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .top-struggles-card {
          background: #0F172A;
          border: 1px solid #1E293B;
          border-radius: 20px;
          padding: 24px;
          color: #f8fafc;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          margin-bottom: 24px;
        }

        .top-struggles-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }

        .header-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #38bdf8;
          margin-bottom: 8px;
        }

        .pulsing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 8px #38bdf8;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .section-title {
          font-size: 22px;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 4px;
        }

        .section-desc {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
        }

        .section-desc code {
          background: rgba(30, 41, 59, 0.8);
          color: #38bdf8;
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 12px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .action-btn-secondary {
          background: #1E293B;
          border: 1px solid #334155;
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 500;
          padding: 8px 14px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-btn-secondary:hover {
          background: #334155;
          color: #ffffff;
        }

        .action-btn-primary {
          background: #0284c7;
          border: 1px solid #0369a1;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
        }

        .action-btn-primary:hover:not(:disabled) {
          background: #0369a1;
        }

        .action-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .formula-info-panel {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid #1E293B;
          border-left: 4px solid #38bdf8;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          font-size: 13px;
        }

        .formula-header {
          display: flex;
          align-items: center;
          color: #e2e8f0;
          margin-bottom: 8px;
        }

        .formula-equation {
          background: #090d16;
          border: 1px solid #1E293B;
          border-radius: 8px;
          padding: 8px 12px;
          margin-bottom: 12px;
        }

        .formula-equation code {
          color: #38bdf8;
          font-size: 13px;
        }

        .formula-breakdown-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .formula-factor {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 8px;
          padding: 10px;
        }

        .factor-name {
          display: block;
          font-weight: 600;
          color: #f1f5f9;
          font-size: 12px;
          margin-bottom: 2px;
        }

        .factor-desc {
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.4;
        }

        .struggle-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .struggle-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-radius: 14px;
          background: #131E32;
          border: 1px solid #1E293B;
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .struggle-item:hover {
          transform: translateY(-2px);
          border-color: #38bdf8;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
        }

        .rank-col {
          flex-shrink: 0;
        }

        .struggle-rank {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid;
          font-weight: 700;
          font-size: 14px;
        }

        .info-col {
          flex: 1;
          min-width: 0;
        }

        .title-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }

        .struggle-topic {
          font-size: 16px;
          font-weight: 600;
          color: #f8fafc;
        }

        .subject-pill {
          background: #1E293B;
          border: 1px solid #334155;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .urgency-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 10px;
          border-radius: 20px;
        }

        .progress-row {
          margin-bottom: 8px;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .progress-label {
          color: #cbd5e1;
        }

        .deficit-label {
          color: #94a3b8;
        }

        .mastery-track {
          width: 100%;
          height: 6px;
          background: #0B1120;
          border-radius: 999px;
          overflow: hidden;
        }

        .mastery-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 0.4s ease;
        }

        .metrics-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .metric-pill {
          font-size: 12px;
          color: #94a3b8;
        }

        .metric-pill strong {
          color: #f1f5f9;
        }

        .action-col {
          flex-shrink: 0;
        }

        .practice-btn {
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border: 1px solid #38bdf8;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);
        }

        .practice-btn:hover {
          background: linear-gradient(135deg, #0369a1, #075985);
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.4);
        }

        .struggles-loading,
        .struggles-empty,
        .struggles-error {
          padding: 40px 20px;
          text-align: center;
        }

        .struggles-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #fca5a5;
          font-size: 14px;
        }

        @media (max-width: 768px) {
          .struggle-item {
            flex-direction: column;
            align-items: flex-start;
          }
          .action-col {
            width: 100%;
          }
          .practice-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
