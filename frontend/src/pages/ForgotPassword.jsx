import React from "react";
import { Link } from "react-router-dom";

function ForgotPassword() {
  return (
    <div className="container py-5 text-center">
      <div className="card shadow p-5 mx-auto" style={{ maxWidth: "500px", borderRadius: "12px" }}>
        <h2 className="mb-4">Reset Password</h2>
        
        <p className="text-muted mb-4">
          The automated password reset feature is currently under development. 
        </p>
        <p className="mb-4">
          To reset a password right now, please ask your administrator to run the 
          <code> reset_student_password.py </code> script in the project terminal.
        </p>

        <Link to="/login" className="btn btn-primary w-100">
          Back to Login
        </Link>
      </div>
    </div>
  );
}

export default ForgotPassword;
