import { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { FASTAPI_URL } from "../config";


const PDFUpload = () => {
  const { user } = useContext(AuthContext);

  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [duplicateDoc, setDuplicateDoc] = useState(null);

  // ==========================================================
  // FETCH EXISTING DOCUMENTS (TO DETECT DUPLICATES BY FILENAME)
  // ==========================================================

  const fetchExistingDocuments = async (studentId) => {
    if (!studentId) return;

    try {
      const response = await fetch(`${FASTAPI_URL}/api/v1/documents/${studentId}`);
      if (response.ok) {
        const data = await response.json();
        const docs = Array.isArray(data.documents) ? data.documents : [];
        setExistingDocuments(docs);
      }
    } catch (err) {
      console.warn("Could not fetch existing documents:", err);
    }
  };

  useEffect(() => {
    const studentId =
      user?.student_id ||
      user?.id ||
      JSON.parse(localStorage.getItem("user") || "{}").student_id;

    if (studentId) {
      fetchExistingDocuments(studentId);
    }
  }, [user]);

  // ==========================================================
  // CLEAR SELECTED FILE
  // ==========================================================

  const clearFile = () => {
    setFile(null);
    setDuplicateDoc(null);
    setError("");
    const input = document.getElementById("pdfInput");
    if (input) input.value = "";
  };

  // ==========================================================
  // HANDLE FILE SELECTION & DUPLICATE DETECTION
  // ==========================================================

  const handleFile = (selectedFile) => {
    setMessage("");
    setError("");
    setDuplicateDoc(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (
      selectedFile.type !== "application/pdf" &&
      !selectedFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Only PDF files are supported.");
      setFile(null);
      return;
    }

    setFile(selectedFile);

    // Check if filename already exists in this student's library
    const match = existingDocuments.find(
      (doc) =>
        (doc.filename || "").trim().toLowerCase() ===
        selectedFile.name.trim().toLowerCase()
    );

    if (match) {
      setDuplicateDoc(match);
    }
  };

  // ==========================================================
  // HANDLE DROP
  // ==========================================================

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  // ==========================================================
  // HANDLE UPLOAD
  // ==========================================================

  const handleUpload = async () => {
    setError("");
    setMessage("");

    if (!subject.trim()) {
      setError("Please enter the subject name.");
      return;
    }

    if (!file) {
      setError("Please select a PDF first.");
      return;
    }

    if (duplicateDoc) {
      setError(
        `This file "${file.name}" has already been uploaded for subject "${duplicateDoc.subject || 'General'}".`
      );
      return;
    }

    setUploading(true);

    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      const studentId =
        user?.student_id ||
        user?.id ||
        storedUser.student_id ||
        storedUser.id;

      if (!studentId) {
        throw new Error("Student ID not found. Please log in again.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("subject", subject.trim());
      formData.append("student_id", studentId);

      const response = await fetch(`${FASTAPI_URL}/api/v1/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setDuplicateDoc({ filename: file.name, subject: subject.trim() });
        }
        throw new Error(data.detail || "PDF upload failed.");
      }

      // Success
      const chunkMsg = data.chunks_created
        ? ` (${data.chunks_created} AI knowledge chunks indexed)`
        : "";
      setMessage(
        `PDF "${data.filename}" processed and saved successfully!${chunkMsg}`
      );

      // Refresh existing documents
      fetchExistingDocuments(studentId);

      // Reset form
      clearFile();
      setSubject("");
    } catch (err) {
      setError(err.message || "Something went wrong while uploading.");
    } finally {
      setUploading(false);
    }
  };

  // ==========================================================
  // UI RENDER
  // ==========================================================

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h2 className="text-center mb-2">Upload Study Notes</h2>
              <p className="text-center text-muted mb-4">
                Enter the subject name and upload your study material.
              </p>

              {/* SUBJECT INPUT */}
              <div className="mb-4">
                <label htmlFor="subjectInput" className="form-label fw-semibold">
                  Subject Name
                </label>
                <input
                  id="subjectInput"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Operating Systems"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setError("");
                    setMessage("");
                  }}
                  disabled={uploading}
                />
                <small className="text-muted">
                  Enter the subject related to these notes.
                </small>
              </div>

              {/* PDF DROP AREA */}
              <div
                className="border rounded p-5 text-center"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                  cursor: uploading ? "not-allowed" : "pointer",
                  backgroundColor: dragging ? "#F1F5F9" : "#FAFAFA",
                  borderColor: dragging ? "#2563EB" : "#CBD5E1",
                  borderStyle: "dashed",
                  borderWidth: "2px",
                  transition: "all 0.2s ease-in-out",
                }}
                onClick={() => {
                  if (!uploading) {
                    document.getElementById("pdfInput").click();
                  }
                }}
              >
                <input
                  id="pdfInput"
                  type="file"
                  accept=".pdf,application/pdf"
                  hidden
                  onChange={(e) => handleFile(e.target.files[0])}
                  disabled={uploading}
                />
                <div className="mb-2" style={{ fontSize: "2rem" }}>
                  📄
                </div>
                <h5 className="fw-semibold text-dark">
                  {dragging ? "Drop your PDF here" : "Drag & Drop your PDF here"}
                </h5>
                <p className="text-muted small mb-0">or click to browse</p>
              </div>

              {/* CASE 1: REGULAR SELECTED FILE (NOT DUPLICATE) */}
              {file && !duplicateDoc && (
                <div
                  className="mt-3 p-3 rounded"
                  style={{
                    backgroundColor: "#E0F2FE",
                    border: "1px solid #BAE6FD",
                    color: "#0369A1",
                  }}
                >
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <strong>Selected file:</strong> {file.name}
                      <div className="small mt-1">
                        Size: {(file.size / 1024).toFixed(2)} KB
                      </div>
                      <div className="small">
                        Subject: <strong>{subject || "Not entered"}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-close btn-sm"
                      aria-label="Remove file"
                      onClick={clearFile}
                      disabled={uploading}
                    ></button>
                  </div>
                </div>
              )}

              {/* CASE 2: DUPLICATE FILE DETECTED */}
              {file && duplicateDoc && (
                <div
                  className="mt-3 p-3 rounded"
                  style={{
                    backgroundColor: "#FFFBEB",
                    border: "1px solid #FCD34D",
                    borderLeft: "4px solid #F59E0B",
                    color: "#92400E",
                  }}
                >
                  <div className="d-flex align-items-start gap-2">
                    <span className="fs-5" style={{ color: "#D97706", lineHeight: 1 }}>
                      ⚠️
                    </span>
                    <div className="flex-grow-1">
                      <div className="fw-bold" style={{ color: "#92400E" }}>
                        PDF Already Uploaded
                      </div>
                      <div className="small mt-1" style={{ color: "#78350F" }}>
                        <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB) is already in your Library
                        {duplicateDoc.subject ? (
                          <> under subject <strong>"{duplicateDoc.subject}"</strong></>
                        ) : ""}.
                      </div>
                      <div className="mt-2 d-flex gap-2">
                        <Link
                          to="/library"
                          className="btn btn-sm fw-semibold"
                          style={{
                            backgroundColor: "#D97706",
                            color: "#FFFFFF",
                            border: "none",
                          }}
                        >
                          Open in Library
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm fw-semibold"
                          style={{
                            backgroundColor: "transparent",
                            border: "1px solid #D97706",
                            color: "#D97706",
                          }}
                          onClick={clearFile}
                        >
                          Choose Another File
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PROCESSING STATUS BANNER */}
              {uploading && (
                <div
                  className="mt-3 p-3 rounded d-flex align-items-center"
                  style={{
                    backgroundColor: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    color: "#1E40AF",
                  }}
                >
                  <div
                    className="spinner-border spinner-border-sm text-primary me-3 flex-shrink-0"
                    role="status"
                    aria-hidden="true"
                  ></div>
                  <div>
                    <div className="fw-semibold">Processing PDF...</div>
                    <small className="text-muted">
                      Extracting text, chunking content, and indexing AI knowledge embeddings.
                    </small>
                  </div>
                </div>
              )}

              {/* GENERAL ERROR BANNER */}
              {error && !duplicateDoc && (
                <div className="alert alert-danger mt-3 mb-0">
                  {error}
                </div>
              )}

              {/* SUCCESS BANNER */}
              {message && (
                <div
                  className="mt-3 p-3 rounded d-flex flex-column gap-2"
                  style={{
                    backgroundColor: "#F0FDF4",
                    border: "1px solid #BBF7D0",
                    color: "#166534",
                  }}
                >
                  <div className="d-flex align-items-center">
                    <span className="fs-5 me-2">✅</span>
                    <div>{message}</div>
                  </div>
                  <div className="d-flex gap-2 mt-1">
                    <Link to="/library" className="btn btn-sm btn-success fw-semibold">
                      View in Library
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      onClick={() => {
                        setMessage("");
                        clearFile();
                        setSubject("");
                      }}
                    >
                      Upload Another
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION BUTTON */}
              {duplicateDoc ? (
                <Link
                  to="/library"
                  className="btn btn-primary w-100 mt-3 py-2 fw-semibold d-inline-flex justify-content-center align-items-center gap-2"
                >
                  View "{file?.name}" in Library
                </Link>
              ) : (
                <button
                  className="btn btn-primary w-100 mt-3 py-2 fw-semibold"
                  onClick={handleUpload}
                  disabled={!file || !subject.trim() || uploading}
                >
                  {uploading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Processing PDF...
                    </>
                  ) : (
                    "Upload PDF"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFUpload;
