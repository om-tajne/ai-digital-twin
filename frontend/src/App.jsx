import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import Header from "./components/Header";
import Footer from "./components/Footer";
import Payment from "./pages/Payment";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ParentsOverview from "./pages/ParentsOverview";
import Library from "./pages/Library";
import TestPage from "./pages/TestPage";
import Dashboard from "./pages/Dashboard";
import PDFUpload from "./pages/PDFUpload";
import StudentProfile from "./pages/StudentProfile";
import VivaRoom from "./pages/VivaRoom";
import StudyPlanner from "./pages/StudyPlanner";
import ForgotPassword from "./pages/ForgotPassword";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

function InfoPage({ title, description }) {
  return (
    <div
      className="container py-5 text-light text-center"
      style={{ minHeight: "60vh" }}
    >
      <div
        className="card bg-dark border-secondary p-5 mx-auto"
        style={{
          maxWidth: "600px",
          borderRadius: "16px",
        }}
      >
        <h2 className="fw-bold mb-3 text-info">{title}</h2>

        <p className="lead text-muted mb-4">{description}</p>

        <Link to="/" className="btn btn-outline-info px-4">
          Return Home
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />

        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/login" element={<Login />} />

          <Route path="/signup" element={<Signup />} />

          <Route path="/forgotpassword" element={<ForgotPassword />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/library" element={<Library />} />

          <Route path="/test" element={<TestPage />} />

          <Route path="/viva" element={<VivaRoom />} />

          <Route
            path="/study-planner"
            element={
              <ProtectedRoute>
                <StudyPlanner />
              </ProtectedRoute>
            }
          />

          <Route
            path="/parents-dashboard"
            element={
              <ProtectedRoute>
                <ParentsOverview />
              </ProtectedRoute>
            }
          />

          <Route
            path="/upload-pdf"
            element={
              <ProtectedRoute>
                <PDFUpload />
              </ProtectedRoute>
            }
          />

          <Route
            path="/student-profile"
            element={
              <ProtectedRoute>
                <StudentProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/payment"
            element={
              <ProtectedRoute>
                <Payment />
              </ProtectedRoute>
            }
          />
        </Routes>

        <Footer />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;