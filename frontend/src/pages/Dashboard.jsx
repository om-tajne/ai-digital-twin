import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import TopStruggles from "../components/TopStruggles";
import MasteryProgressDashboard from "../MasteryProgressDashboard";

export default function Dashboard() {
  const { user } = useContext(AuthContext);

  if (!user) {
    return (
      <div className="container py-5 text-light text-center">
        <h4>Please log in to view your dashboard.</h4>
        <Link to="/login" className="btn btn-primary mt-3">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Payment / Pro Plan Card */}
      <div
        className="card border-0 shadow-lg mb-4"
        style={{
          backgroundColor: "#0F172A",
          color: "white",
          borderRadius: "16px",
          border: "1px solid #1E293B",
        }}
      >
        <div className="card-body p-4">
          <div className="row align-items-center">
            <div className="col-md-8">
              <h3 className="fw-bold mb-2">
                🚀 AI Digital Twin Pro
              </h3>

              <p className="text-light mb-2">
                Unlock premium features, voice examiners, and a personalized AI study companion.
              </p>

              <small className="text-secondary">
                Pro Plan • ₹499
              </small>
            </div>

            <div className="col-md-4 text-md-end mt-3 mt-md-0">
              <Link
                to="/payment"
                className="btn btn-primary px-4 py-2"
                style={{ borderRadius: "10px", fontWeight: 600 }}
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* AI Struggle Predictor Widget */}
      <TopStruggles studentId={user.student_id} />

      {/* Dynamic Mastery Cards / Garden */}
      <div className="mt-4">
        <MasteryProgressDashboard />
      </div>
    </div>
  );
}
