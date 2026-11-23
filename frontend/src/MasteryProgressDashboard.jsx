import React, {
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AuthContext } from "./context/AuthContext";

const API_URL = "http://localhost:8000";

const STAGES = [
  "Sprouting",
  "Rooting",
  "Budding",
  "Flourishing",
];

const RING_COLORS = [
  "#6E8F6A",
  "#7FA37D",
  "#C9A24B",
  "#E0AE43",
];

const TRACK_COLOR = "rgba(239, 233, 218, 0.14)";

function stageIndexOf(mastery) {
  const value = Number(mastery) || 0;

  if (value >= 100) return 3;

  return Math.min(3, Math.floor(value / 25));
}

function stageNameOf(mastery) {
  const value = Number(mastery) || 0;

  if (value >= 100) {
    return "Flourishing";
  }

  return STAGES[stageIndexOf(value)];
}

/* ------------------------------------------------------------- */
/* Growth Ring                                                   */
/* ------------------------------------------------------------- */

function GrowthRing({
  mastery,
  size = 132,
  active = false,
}) {
  const c = size / 2;

  const safeMastery = Math.max(
    0,
    Math.min(100, Number(mastery) || 0)
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`ring-svg${
        active ? " ring-svg--active" : ""
      }`}
      aria-hidden="true"
    >
      {RING_COLORS.map((color, i) => {
        const r = [20, 32, 44, 56][i];

        const circumference =
          2 * Math.PI * r;

        const stageStart = i * 25;
        const stageEnd = stageStart + 25;

        let dash = 0;
        let full = false;

        if (safeMastery >= stageEnd) {
          full = true;
        } else if (safeMastery > stageStart) {
          dash =
            ((safeMastery - stageStart) / 25) *
            circumference;
        }

        return (
          <g
            key={i}
            transform={`rotate(-90 ${c} ${c})`}
          >
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={TRACK_COLOR}
              strokeWidth={4}
            />

            {(full || dash > 0) && (
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={
                  full
                    ? `${circumference} ${circumference}`
                    : `${dash} ${circumference}`
                }
                className="ring-arc"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------- */
/* Sparkline                                                     */
/* ------------------------------------------------------------- */

function Sparkline({
  values = [],
  width = 120,
  height = 34,
  color = "#D9A441",
}) {
  if (!values.length) {
    return (
      <div
        style={{
          color: "#9FB0A0",
          fontSize: 12,
        }}
      >
        No history
      </div>
    );
  }

  const numericValues = values.map(
    (value) => Number(value) || 0
  );

  const max = Math.max(...numericValues, 1);
  const min = Math.min(...numericValues, 0);
  const range = Math.max(max - min, 1);

  const step =
    numericValues.length === 1
      ? width
      : width / (numericValues.length - 1);

  const points = numericValues
    .map((value, i) => {
      const x =
        numericValues.length === 1
          ? width / 2
          : i * step;

      const y =
        height -
        ((value - min) / range) *
          (height - 6) -
        3;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastX =
    numericValues.length === 1
      ? width / 2
      : (numericValues.length - 1) * step;

  const lastY =
    height -
    ((numericValues[numericValues.length - 1] -
      min) /
      range) *
      (height - 6) -
    3;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="spark-svg"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle
        cx={lastX}
        cy={lastY}
        r="3"
        fill={color}
      />
    </svg>
  );
}

/* ------------------------------------------------------------- */
/* Skill Card                                                    */
/* ------------------------------------------------------------- */

function SkillCard({
  skill,
  selected,
  onSelect,
}) {
  const mastery = Number(skill.mastery) || 0;

  return (
    <button
      type="button"
      className={`skill-card${
        selected
          ? " skill-card--selected"
          : ""
      }`}
      onClick={() => onSelect(skill)}
      aria-pressed={selected}
    >
      <GrowthRing
        mastery={mastery}
        active={selected}
      />

      <div className="skill-card__ring-label">
        <span className="skill-card__pct">
          {mastery.toFixed(1)}
        </span>

        <span className="skill-card__pct-sign">
          %
        </span>
      </div>

      <div className="skill-card__meta">
        <h3 className="skill-card__name">
          {skill.name}
        </h3>

        <span
          className={`skill-card__stage skill-card__stage--${stageIndexOf(
            mastery
          )}`}
        >
          {stageNameOf(mastery)}
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------- */
/* Main Dashboard                                                */
/* ------------------------------------------------------------- */

export default function MasteryProgressDashboard() {
  const { user } = useContext(AuthContext);

  const [masteryRecords, setMasteryRecords] =
    useState([]);

  const [selectedSkill, setSelectedSkill] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const studentId = user?.student_id;

  /* ----------------------------------------------------------- */
  /* Fetch real backend mastery                                  */
  /* ----------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function fetchMastery() {
      if (!studentId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_URL}/api/v1/mastery/${studentId}`
        );

        if (!response.ok) {
          throw new Error(
            `Mastery request failed: ${response.status}`
          );
        }

        const data = await response.json();

        console.log(
          "MASTERY DASHBOARD RESPONSE:",
          data
        );

        /*
          Backend may return:

          [
            {...},
            {...}
          ]

          OR:

          {
            mastery: [...]
          }

          OR:

          {
            data: [...]
          }
        */

        let records = [];

        if (Array.isArray(data)) {
          records = data;
        } else if (
          Array.isArray(data.mastery)
        ) {
          records = data.mastery;
        } else if (
          Array.isArray(data.data)
        ) {
          records = data.data;
        } else if (
          Array.isArray(data.results)
        ) {
          records = data.results;
        }

        if (!cancelled) {
          setMasteryRecords(records);
        }
      } catch (err) {
        console.error(
          "FAILED TO FETCH MASTERY:",
          err
        );

        if (!cancelled) {
          setError(
            "Unable to load mastery data from backend."
          );
          setMasteryRecords([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMastery();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  /* ----------------------------------------------------------- */
  /* Convert backend records into dashboard format               */
  /* ----------------------------------------------------------- */

  const skills = useMemo(() => {
    return masteryRecords.map((record) => {
      const mastery =
        Number(record.mastery_score) || 0;

      return {
        id:
          record.mastery_id ||
          `${record.subject}-${record.topic}`,

        subject:
          record.subject || "Unknown",

        name:
          record.topic || "Unknown Topic",

        mastery: mastery * 100,

        correctAnswers:
          Number(record.correct_answers) || 0,

        totalQuestions:
          Number(record.total_questions) || 0,

        lastPracticed:
          record.updated_at ||
          record.created_at ||
          null,

        history:
          Array.isArray(record.history)
            ? record.history
            : [],

        nextMilestone:
          "Continue practicing this topic",
      };
    });
  }, [masteryRecords]);

  /* ----------------------------------------------------------- */
  /* Group by subject                                            */
  /* ----------------------------------------------------------- */

  const bySubject = useMemo(() => {
    const map = new Map();

    skills.forEach((skill) => {
      if (!map.has(skill.subject)) {
        map.set(skill.subject, []);
      }

      map.get(skill.subject).push(skill);
    });

    return Array.from(map.entries());
  }, [skills]);

  /* ----------------------------------------------------------- */
  /* Overall mastery                                             */
  /* ----------------------------------------------------------- */

  const overall = useMemo(() => {
    if (!skills.length) {
      return 0;
    }

    const total = skills.reduce(
      (sum, skill) =>
        sum + Number(skill.mastery || 0),
      0
    );

    return Math.round(
      total / skills.length
    );
  }, [skills]);

  /* ----------------------------------------------------------- */
  /* Stage counts                                                */
  /* ----------------------------------------------------------- */

  const stageCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];

    skills.forEach((skill) => {
      counts[
        stageIndexOf(skill.mastery)
      ]++;
    });

    return counts;
  }, [skills]);

  /* ----------------------------------------------------------- */
  /* Format date                                                 */
  /* ----------------------------------------------------------- */

  function formatLastPracticed(date) {
    if (!date) {
      return "Not practiced yet";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return String(date);
    }

    return parsed.toLocaleString();
  }

  /* ----------------------------------------------------------- */
  /* Loading                                                     */
  /* ----------------------------------------------------------- */

  if (loading) {
    return (
      <div className="mpd-root">
        <div className="loading-state">
          Loading mastery data...
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------- */
  /* Render                                                       */
  /* ----------------------------------------------------------- */

  return (
    <div className="mpd-root">
      <style>{`
        .mpd-root {
          --bg: #16241D;
          --panel: #1E3025;
          --panel-raised: #24392C;
          --line: #34473A;
          --bone: #EFE9DA;
          --muted: #9FB0A0;
          --gold: #E0AE43;
          --sage: #7FA37D;
          --rust: #C97B5A;

          font-family: Inter, system-ui, sans-serif;

          background:
            radial-gradient(
              120% 140% at 15% -10%,
              #1C3226 0%,
              var(--bg) 55%
            );

          color: var(--bone);

          min-height: 100vh;

          padding:
            40px
            clamp(16px, 5vw, 56px)
            64px;

          box-sizing: border-box;
        }

        .mpd-root * {
          box-sizing: border-box;
        }

        .mpd-root button {
          font-family: inherit;
          cursor: pointer;
        }

        .mpd-root :focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 3px;
        }

        .mpd-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;

          margin-bottom: 28px;

          border-bottom:
            1px solid var(--line);

          padding-bottom: 24px;
        }

        .mpd-eyebrow {
          font-family: monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;

          color: var(--gold);

          margin: 0 0 8px;
        }

        .mpd-title {
          font-family: Georgia, serif;
          font-weight: 500;

          font-size:
            clamp(26px, 3.4vw, 38px);

          margin: 0;
        }

        .mpd-title span {
          font-style: italic;
          color: var(--gold);
        }

        .mpd-sub {
          color: var(--muted);
          font-size: 14px;
          margin-top: 6px;
        }

        .student-info {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 999px;

          padding:
            9px 16px;

          font-size: 13px;
          color: var(--bone);
        }

        .mpd-hero {
          display: grid;

          grid-template-columns:
            auto 1fr;

          gap: 40px;
          align-items: center;

          background:
            linear-gradient(
              135deg,
              var(--panel) 0%,
              var(--panel-raised) 100%
            );

          border:
            1px solid var(--line);

          border-radius: 20px;

          padding:
            28px
            clamp(20px, 4vw, 40px);

          margin-bottom: 36px;
        }

        .mpd-hero-num {
          font-family: Georgia, serif;
          font-style: italic;
          font-weight: 500;

          font-size:
            clamp(56px, 9vw, 88px);

          line-height: 1;

          color: var(--gold);

          display: flex;
          align-items: flex-start;
        }

        .mpd-hero-num small {
          font-family: monospace;
          font-style: normal;
          font-size: 22px;

          margin-top: 8px;

          color: var(--muted);
        }

        .mpd-hero-label {
          font-family: monospace;
          font-size: 11px;

          letter-spacing: 0.14em;

          text-transform: uppercase;

          color: var(--muted);

          margin-top: 6px;
        }

        .stage-distribution {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .stage-row {
          display: grid;

          grid-template-columns:
            96px
            1fr
            28px;

          align-items: center;

          gap: 12px;
        }

        .stage-row-label {
          font-size: 12.5px;
          color: var(--muted);
        }

        .stage-row-track {
          height: 7px;

          background:
            rgba(239,233,218,0.08);

          border-radius: 4px;

          overflow: hidden;
        }

        .stage-row-fill {
          display: block;
          height: 100%;

          border-radius: 4px;

          transition:
            width 0.4s ease;
        }

        .stage-row-count {
          font-family: monospace;
          font-size: 12px;

          color: var(--muted);

          text-align: right;
        }

        .detail-panel {
          background: var(--panel);

          border:
            1px solid var(--line);

          border-left:
            3px solid var(--gold);

          border-radius: 14px;

          padding:
            22px 26px;

          margin-bottom: 36px;

          display: flex;
          flex-wrap: wrap;

          gap: 28px;

          justify-content:
            space-between;

          align-items: center;
        }

        .detail-panel__title {
          font-family: Georgia, serif;
          font-size: 20px;

          margin: 0 0 4px;
        }

        .detail-panel__row {
          display: flex;
          gap: 28px;
          flex-wrap: wrap;
        }

        .detail-panel__stat {
          min-width: 130px;
        }

        .detail-panel__stat-label {
          font-family: monospace;
          font-size: 10.5px;

          letter-spacing: 0.1em;

          text-transform: uppercase;

          color: var(--muted);

          margin-bottom: 4px;
        }

        .detail-panel__stat-value {
          font-size: 14.5px;
          color: var(--bone);
        }

        .detail-panel__close {
          background: none;

          border:
            1px solid var(--line);

          color: var(--muted);

          border-radius: 999px;

          width: 30px;
          height: 30px;

          font-size: 15px;
        }

        .subject-section {
          margin-bottom: 34px;
        }

        .subject-heading {
          display: flex;

          align-items: baseline;

          gap: 12px;

          margin-bottom: 16px;
        }

        .subject-heading h2 {
          font-family: Georgia, serif;

          font-weight: 500;

          font-size: 19px;

          margin: 0;
        }

        .subject-heading::after {
          content: "";

          flex: 1;

          height: 1px;

          background: var(--line);
        }

        .skill-grid {
          display: grid;

          grid-template-columns:
            repeat(
              auto-fill,
              minmax(168px, 1fr)
            );

          gap: 14px;
        }

        .skill-card {
          background: var(--panel);

          border:
            1px solid var(--line);

          border-radius: 16px;

          padding:
            18px
            14px
            16px;

          display: flex;

          flex-direction: column;

          align-items: center;

          text-align: center;

          gap: 10px;

          position: relative;

          transition:
            border-color 0.15s ease,
            transform 0.15s ease,
            background 0.15s ease;
        }

        .skill-card:hover {
          border-color: var(--sage);

          transform:
            translateY(-2px);
        }

        .skill-card--selected {
          border-color: var(--gold);

          background:
            var(--panel-raised);
        }

        .skill-card__ring-label {
          position: absolute;

          top: 42px;

          left: 0;
          right: 0;

          display: flex;

          justify-content: center;

          align-items: baseline;

          pointer-events: none;
        }

        .skill-card__pct {
          font-family: monospace;

          font-weight: 500;

          font-size: 22px;

          color: var(--bone);
        }

        .skill-card__pct-sign {
          font-family: monospace;

          font-size: 12px;

          color: var(--muted);

          margin-left: 1px;
        }

        .skill-card__name {
          font-size: 13.5px;

          font-weight: 600;

          margin: 0;

          line-height: 1.3;
        }

        .skill-card__stage {
          font-family: monospace;

          font-size: 10.5px;

          letter-spacing: 0.08em;

          text-transform: uppercase;

          padding:
            3px 9px;

          border-radius: 999px;

          background:
            rgba(239,233,218,0.08);

          color: var(--muted);
        }

        .skill-card__stage--2 {
          color: var(--gold);
        }

        .skill-card__stage--3 {
          color: var(--gold);

          background:
            rgba(224,174,67,0.14);
        }

        .ring-svg--active {
          filter:
            drop-shadow(
              0 0 6px
              rgba(224,174,67,0.35)
            );
        }

        .ring-arc {
          transition:
            stroke-dasharray
            0.5s ease;
        }

        .loading-state,
        .empty-state,
        .error-state {
          padding: 60px 20px;

          text-align: center;

          color: var(--muted);
        }

        .error-state {
          color: #ef8f8f;
        }

        @media (max-width: 640px) {
          .mpd-hero {
            grid-template-columns: 1fr;
          }

          .detail-panel {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .skill-card,
          .ring-arc,
          .stage-row-fill {
            transition: none !important;
          }
        }
      `}</style>

      {/* HEADER */}

      <header className="mpd-header">
        <div>
          <p className="mpd-eyebrow">
            Mastery Garden
          </p>

          <h1 className="mpd-title">
            <span>
              {user?.full_name || "Student"}
            </span>
            's learning growth
          </h1>

          <p className="mpd-sub">
            Real-time mastery calculated from
            your submitted tests.
          </p>
        </div>

        <div className="student-info">
          {user?.email || "Student"}
        </div>
      </header>

      {/* ERROR */}

      {error && (
        <div className="error-state">
          {error}
        </div>
      )}

      {/* EMPTY */}

      {!error && skills.length === 0 && (
        <div className="empty-state">
          No mastery records found yet.
          <br />
          Submit a test to start tracking
          your learning mastery.
        </div>
      )}

      {skills.length > 0 && (
        <>
          {/* HERO */}

          <section className="mpd-hero">
            <div>
              <div className="mpd-hero-num">
                {overall}
                <small>%</small>
              </div>

              <div className="mpd-hero-label">
                Overall mastery
              </div>
            </div>

            <div className="stage-distribution">
              {STAGES.map((stage, i) => (
                <div
                  className="stage-row"
                  key={stage}
                >
                  <span className="stage-row-label">
                    {stage}
                  </span>

                  <span className="stage-row-track">
                    <span
                      className="stage-row-fill"
                      style={{
                        width: `${
                          (stageCounts[i] /
                            skills.length) *
                          100
                        }%`,

                        background:
                          RING_COLORS[i],
                      }}
                    />
                  </span>

                  <span className="stage-row-count">
                    {stageCounts[i]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* DETAIL */}

          {selectedSkill && (
            <section className="detail-panel">
              <div>
                <p className="detail-panel__title">
                  {selectedSkill.name}
                </p>

                <span className="mpd-sub">
                  {selectedSkill.subject}
                </span>
              </div>

              <div className="detail-panel__row">
                <div className="detail-panel__stat">
                  <div className="detail-panel__stat-label">
                    Current mastery
                  </div>

                  <div className="detail-panel__stat-value">
                    {selectedSkill.mastery.toFixed(
                      2
                    )}
                    %
                  </div>
                </div>

                <div className="detail-panel__stat">
                  <div className="detail-panel__stat-label">
                    Correct
                  </div>

                  <div className="detail-panel__stat-value">
                    {
                      selectedSkill.correctAnswers
                    }
                    /
                    {
                      selectedSkill.totalQuestions
                    }
                  </div>
                </div>

                <div className="detail-panel__stat">
                  <div className="detail-panel__stat-label">
                    Current stage
                  </div>

                  <div className="detail-panel__stat-value">
                    {stageNameOf(
                      selectedSkill.mastery
                    )}
                  </div>
                </div>

                <div className="detail-panel__stat">
                  <div className="detail-panel__stat-label">
                    Last practiced
                  </div>

                  <div className="detail-panel__stat-value">
                    {formatLastPracticed(
                      selectedSkill.lastPracticed
                    )}
                  </div>
                </div>

                <div className="detail-panel__stat">
                  <div className="detail-panel__stat-label">
                    Trend
                  </div>

                  <Sparkline
                    values={
                      selectedSkill.history
                    }
                    color={
                      RING_COLORS[
                        stageIndexOf(
                          selectedSkill.mastery
                        )
                      ]
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                className="detail-panel__close"
                onClick={() =>
                  setSelectedSkill(null)
                }
                aria-label="Close detail panel"
              >
                ×
              </button>
            </section>
          )}

          {/* SUBJECTS */}

          {bySubject.map(
            ([subject, subjectSkills]) => (
              <div
                className="subject-section"
                key={subject}
              >
                <div className="subject-heading">
                  <h2>{subject}</h2>
                </div>

                <div className="skill-grid">
                  {subjectSkills.map(
                    (skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        selected={
                          selectedSkill?.id ===
                          skill.id
                        }
                        onSelect={(value) =>
                          setSelectedSkill(
                            selectedSkill?.id ===
                              value.id
                              ? null
                              : value
                          )
                        }
                      />
                    )
                  )}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}