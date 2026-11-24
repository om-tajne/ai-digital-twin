import { useMemo, useState, useEffect, useContext, useRef } from 'react'
import {
  Button,
  Dropdown,
  Form,
  InputGroup,
  Modal,
  Spinner,
} from 'react-bootstrap'
import { AuthContext } from '../context/AuthContext'
import FileCard from '../components/FileCard.jsx'
import { FASTAPI_API_URL } from '../config'

const API_BASE_URL = FASTAPI_API_URL

const formatDate = (dateString) => {
  if (!dateString) return 'Recently'

  const date = new Date(dateString)

  if (Number.isNaN(date.getTime())) return 'Recently'

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const normalizeQuery = (value = '') => {
  return value.trim().toLowerCase()
}

export default function Library() {
  const { user } = useContext(AuthContext)

  const [documents, setDocuments] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('All')
  const [sortMode, setSortMode] = useState('recent')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadSubject, setUploadSubject] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')

  const [itemToDelete, setItemToDelete] = useState(null)

  const fileInputRef = useRef(null)

  // ---------------------------------------------------------
  // FETCH DOCUMENTS
  // ---------------------------------------------------------

  const fetchDocuments = async () => {
    if (!user?.student_id) {
      setDocuments([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setLoadError('')

      const response = await fetch(
        `${API_BASE_URL}/documents/${user.student_id}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }

      const data = await response.json()

      const fetchedDocuments = Array.isArray(data.documents)
        ? data.documents.map((doc) => ({
            id: doc.document_id,
            name: doc.filename || 'Untitled PDF',
            subject: doc.subject || 'Uncategorized',
            uploadedAt:
              doc.created_at || new Date().toISOString(),
            size: doc.size || null,
            type: 'file',
          }))
        : []

      setDocuments(fetchedDocuments)
    } catch (error) {
      console.error('Failed to fetch documents:', error)
      setLoadError(
        'Could not load your library. Make sure the backend is running, then retry.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [user?.student_id])

  // ---------------------------------------------------------
  // SUBJECTS
  // ---------------------------------------------------------

  const subjects = useMemo(() => {
    const subjectMap = new Map()

    documents.forEach((document) => {
      const subject =
        document.subject?.trim() || 'Uncategorized'

      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, {
          name: subject,
          count: 0,
          documents: [],
        })
      }

      const subjectData = subjectMap.get(subject)

      subjectData.count += 1
      subjectData.documents.push(document)
    })

    return Array.from(subjectMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [documents])

  // ---------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------

  const query = normalizeQuery(searchQuery)

  const filteredDocuments = useMemo(() => {
    let result = [...documents]

    // Subject filter
    if (selectedSubject !== 'All') {
      result = result.filter(
        (document) =>
          document.subject === selectedSubject
      )
    }

    // Search filter
    if (query) {
      result = result.filter((document) => {
        const fileName =
          document.name?.toLowerCase() || ''

        const subject =
          document.subject?.toLowerCase() || ''

        return (
          fileName.includes(query) ||
          subject.includes(query)
        )
      })
    }

    // Sorting
    result.sort((left, right) => {
      switch (sortMode) {
        case 'name-asc':
          return left.name.localeCompare(right.name)

        case 'name-desc':
          return right.name.localeCompare(left.name)

        case 'subject':
          return left.subject.localeCompare(
            right.subject
          )

        case 'recent':
        default:
          return (
            new Date(right.uploadedAt).getTime() -
            new Date(left.uploadedAt).getTime()
          )
      }
    })

    return result
  }, [
    documents,
    selectedSubject,
    query,
    sortMode,
  ])

  // ---------------------------------------------------------
  // RECENT DOCUMENTS
  // ---------------------------------------------------------

  const recentDocuments = useMemo(() => {
    return [...documents]
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() -
          new Date(a.uploadedAt).getTime()
      )
      .slice(0, 6)
  }, [documents])

  // ---------------------------------------------------------
  // UPLOAD
  // ---------------------------------------------------------

  const resetUploadModal = () => {
    setShowUploadModal(false)
    setUploadFile(null)
    setUploadSubject('')
    setUploadError('')
    setUploadSuccess('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSelectFile = (event) => {
    const selectedFile = event.target.files?.[0]

    setUploadError('')
    setUploadSuccess('')

    if (!selectedFile) {
      setUploadFile(null)
      return
    }

    const isPDF =
      selectedFile.type === 'application/pdf' ||
      selectedFile.name
        .toLowerCase()
        .endsWith('.pdf')

    if (!isPDF) {
      setUploadFile(null)
      setUploadError(
        'Only PDF files are supported.'
      )
      return
    }

    setUploadFile(selectedFile)
  }

  const handleUpload = async () => {
    setUploadError('')
    setUploadSuccess('')

    if (!uploadSubject.trim()) {
      setUploadError(
        'Please enter the subject name.'
      )
      return
    }

    if (!uploadFile) {
      setUploadError(
        'Please select a PDF file.'
      )
      return
    }

    if (!user?.student_id) {
      setUploadError(
        'Student ID not found. Please login again.'
      )
      return
    }

    try {
      setIsUploading(true)

      const formData = new FormData()

      formData.append(
        'file',
        uploadFile
      )

      formData.append(
        'subject',
        uploadSubject.trim()
      )

      formData.append(
        'student_id',
        user.student_id
      )

      const response = await fetch(
        `${API_BASE_URL}/upload-pdf`,
        {
          method: 'POST',
          body: formData,
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail ||
            'PDF upload failed.'
        )
      }

      setUploadSuccess(
        `${uploadFile.name} uploaded successfully.`
      )

      // Refresh library
      await fetchDocuments()

      setUploadFile(null)
      setUploadSubject('')

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Keep success message visible briefly
      setTimeout(() => {
        setShowUploadModal(false)
        setUploadSuccess('')
      }, 1200)
    } catch (error) {
      console.error(
        'Upload error:',
        error
      )

      setUploadError(
        error.message ||
          'Something went wrong while uploading.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  // ---------------------------------------------------------
  // DELETE - FRONTEND READY
  // ---------------------------------------------------------

  const handleDelete = (document) => {
    setItemToDelete(document)
  }

  const handleConfirmDelete = async () => {
  if (!itemToDelete) return

  try {
    const response = await fetch(
      `${API_BASE_URL}/documents/${itemToDelete.id}`,
      {
        method: 'DELETE',
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.detail || 'Failed to delete document.'
      )
    }

    // Remove from UI only after successful backend deletion
    setDocuments((previous) =>
      previous.filter(
        (document) =>
          document.id !== itemToDelete.id
      )
    )

    // If deleted document was the selected subject,
    // check whether any documents remain for that subject
    if (
      selectedSubject === itemToDelete.subject
    ) {
      const remainingInSubject =
        documents.filter(
          (document) =>
            document.id !== itemToDelete.id &&
            document.subject ===
              itemToDelete.subject
        )

      if (remainingInSubject.length === 0) {
        setSelectedSubject('All')
      }
    }

    setItemToDelete(null)

  } catch (error) {
    console.error(
      'Delete error:',
      error
    )

    alert(
      error.message ||
        'Something went wrong while deleting the document.'
    )
  }
}

  // ---------------------------------------------------------
  // SUBJECT SELECTION
  // ---------------------------------------------------------

  const handleSubjectClick = (subject) => {
    setSelectedSubject(subject)
    setSearchQuery('')

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  // ---------------------------------------------------------
  // OPEN FILE
  // ---------------------------------------------------------

  const handleOpenFile = (file) => {
    console.log('Open file:', file)

    // Future:
    // backend PDF view/download endpoint can be connected here.
  }

  // ---------------------------------------------------------
  // EMPTY STATES
  // ---------------------------------------------------------

  const hasDocuments = documents.length > 0

  const noSearchResults =
    hasDocuments &&
    filteredDocuments.length === 0

  return (
    <>
      <div className="library-page min-vh-100 text-light">

        {/* =====================================================
            HEADER
        ====================================================== */}

        <header className="library-header">
          <div className="library-header-inner">

            <div className="library-brand">
              <div className="library-brand-icon">
                <i className="bi bi-book-half" />
              </div>

              <div>
                <div className="library-title">
                  My Library
                </div>

                <div className="library-subtitle">
                  Your study materials in one place
                </div>
              </div>
            </div>

            <div className="library-search">
              <InputGroup>
                <InputGroup.Text>
                  <i className="bi bi-search" />
                </InputGroup.Text>

                <Form.Control
                  type="search"
                  placeholder="Search notes, PDFs or subjects..."
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value
                    )
                  }
                />

                {searchQuery && (
                  <Button
                    variant="link"
                    className="library-search-clear"
                    onClick={() =>
                      setSearchQuery('')
                    }
                  >
                    <i className="bi bi-x-lg" />
                  </Button>
                )}
              </InputGroup>
            </div>

            <Button
              className="library-upload-header-btn"
              onClick={() => {
                setUploadError('')
                setUploadSuccess('')
                setShowUploadModal(true)
              }}
            >
              <i className="bi bi-cloud-arrow-up me-2" />
              Upload PDF
            </Button>
          </div>
        </header>

        {/* =====================================================
            MAIN
        ====================================================== */}

        <main className="library-main">

          {/* ===================================================
              STATS
          ==================================================== */}

          <section className="library-stats">

            <div className="library-stat-card">
              <div className="library-stat-icon subject-icon">
                <i className="bi bi-journal-bookmark-fill" />
              </div>

              <div>
                <div className="library-stat-value">
                  {subjects.length}
                </div>

                <div className="library-stat-label">
                  Subjects
                </div>
              </div>
            </div>

            <div className="library-stat-card">
              <div className="library-stat-icon document-icon">
                <i className="bi bi-file-earmark-pdf-fill" />
              </div>

              <div>
                <div className="library-stat-value">
                  {documents.length}
                </div>

                <div className="library-stat-label">
                  Documents
                </div>
              </div>
            </div>

            <div className="library-stat-card">
              <div className="library-stat-icon recent-icon">
                <i className="bi bi-clock-history" />
              </div>

              <div>
                <div className="library-stat-value">
                  {recentDocuments.length}
                </div>

                <div className="library-stat-label">
                  Recent
                </div>
              </div>
            </div>

          </section>

          {/* ===================================================
              SUBJECTS
          ==================================================== */}

          <section className="library-section">

            <div className="library-section-header">

              <div>
                <h2>
                  Subjects
                </h2>

                <p>
                  Browse your study material by subject
                </p>
              </div>

              {selectedSubject !== 'All' && (
                <Button
                  variant="link"
                  className="library-clear-filter"
                  onClick={() =>
                    setSelectedSubject('All')
                  }
                >
                  View All
                  <i className="bi bi-arrow-right ms-2" />
                </Button>
              )}

            </div>

            {loadError && !loading ? (
              <div
                className="p-3 mb-3 rounded-3 d-flex align-items-center justify-content-between gap-3"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 14,
                }}
              >
                <span>
                  <i className="bi bi-exclamation-triangle-fill me-2" />
                  {loadError}
                </span>
                <Button size="sm" variant="outline-danger" onClick={fetchDocuments}>
                  Retry
                </Button>
              </div>
            ) : null}

            {loading ? (
              <div className="library-loading">
                <Spinner animation="border" />
                <span>
                  Loading your subjects...
                </span>
              </div>
            ) : subjects.length === 0 ? (
              <div className="library-empty">
                <div className="library-empty-icon">
                  <i className="bi bi-journal-x" />
                </div>

                <h4>
                  No subjects yet
                </h4>

                <p>
                  Upload your first PDF to create a subject.
                </p>

                <Button
                  className="library-primary-btn"
                  onClick={() =>
                    setShowUploadModal(true)
                  }
                >
                  <i className="bi bi-plus-lg me-2" />
                  Upload Study Material
                </Button>
              </div>
            ) : (
              <div className="subject-grid">

                {/* ALL SUBJECTS CARD */}

                <button
                  type="button"
                  className={`subject-card ${
                    selectedSubject === 'All'
                      ? 'subject-card-active'
                      : ''
                  }`}
                  onClick={() =>
                    handleSubjectClick('All')
                  }
                >
                  <div className="subject-card-top">
                    <div className="subject-folder all-folder">
                      <i className="bi bi-collection-fill" />
                    </div>

                    {selectedSubject === 'All' && (
                      <span className="subject-selected">
                        Selected
                      </span>
                    )}
                  </div>

                  <div className="subject-card-name">
                    All Documents
                  </div>

                  <div className="subject-card-meta">
                    {documents.length}{' '}
                    {documents.length === 1
                      ? 'Document'
                      : 'Documents'}
                  </div>

                  <div className="subject-card-footer">
                    <span>
                      View library
                    </span>

                    <i className="bi bi-arrow-up-right" />
                  </div>
                </button>

                {subjects.map((subject, index) => (
                  <button
                    type="button"
                    className={`subject-card ${
                      selectedSubject === subject.name
                        ? 'subject-card-active'
                        : ''
                    }`}
                    key={subject.name}
                    onClick={() =>
                      handleSubjectClick(
                        subject.name
                      )
                    }
                  >
                    <div className="subject-card-top">

                      <div
                        className={`subject-folder folder-${index % 5}`}
                      >
                        <i className="bi bi-folder-fill" />
                      </div>

                      {selectedSubject ===
                        subject.name && (
                        <span className="subject-selected">
                          Selected
                        </span>
                      )}
                    </div>

                    <div
                      className="subject-card-name"
                      title={subject.name}
                    >
                      {subject.name}
                    </div>

                    <div className="subject-card-meta">
                      {subject.count}{' '}
                      {subject.count === 1
                        ? 'Document'
                        : 'Documents'}
                    </div>

                    <div className="subject-card-footer">
                      <span>
                        Open subject
                      </span>

                      <i className="bi bi-arrow-up-right" />
                    </div>
                  </button>
                ))}

              </div>
            )}
          </section>

          {/* ===================================================
              DOCUMENTS
          ==================================================== */}

          <section className="library-section documents-section">

            <div className="library-section-header">

              <div>
                <div className="documents-heading-row">
                  <h2>
                    {selectedSubject === 'All'
                      ? 'All Documents'
                      : selectedSubject}
                  </h2>

                  <span className="documents-count">
                    {filteredDocuments.length}
                  </span>
                </div>

                <p>
                  {selectedSubject === 'All'
                    ? 'All your uploaded study material'
                    : `Documents uploaded for ${selectedSubject}`}
                </p>
              </div>

              <Dropdown align="end">
                <Dropdown.Toggle
                  variant="dark"
                  className="library-sort-btn"
                >
                  <i className="bi bi-sliders2 me-2" />
                  Sort
                </Dropdown.Toggle>

                <Dropdown.Menu
                  variant="dark"
                  className="library-dropdown"
                >
                  <Dropdown.Item
                    active={
                      sortMode === 'recent'
                    }
                    onClick={() =>
                      setSortMode('recent')
                    }
                  >
                    <i className="bi bi-clock me-2" />
                    Recently added
                  </Dropdown.Item>

                  <Dropdown.Item
                    active={
                      sortMode === 'name-asc'
                    }
                    onClick={() =>
                      setSortMode('name-asc')
                    }
                  >
                    <i className="bi bi-sort-alpha-down me-2" />
                    Name A to Z
                  </Dropdown.Item>

                  <Dropdown.Item
                    active={
                      sortMode === 'name-desc'
                    }
                    onClick={() =>
                      setSortMode('name-desc')
                    }
                  >
                    <i className="bi bi-sort-alpha-up me-2" />
                    Name Z to A
                  </Dropdown.Item>

                  <Dropdown.Item
                    active={
                      sortMode === 'subject'
                    }
                    onClick={() =>
                      setSortMode('subject')
                    }
                  >
                    <i className="bi bi-bookmark me-2" />
                    By subject
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>

            </div>

            {loading ? (
              <div className="library-loading">
                <Spinner animation="border" />
                <span>
                  Loading documents...
                </span>
              </div>
            ) : noSearchResults ? (
              <div className="library-empty small-empty">
                <div className="library-empty-icon">
                  <i className="bi bi-search" />
                </div>

                <h4>
                  No documents found
                </h4>

                <p>
                  Try a different file name or subject.
                </p>

                <Button
                  variant="link"
                  className="library-clear-filter"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedSubject('All')
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="library-empty small-empty">
                <div className="library-empty-icon">
                  <i className="bi bi-file-earmark-x" />
                </div>

                <h4>
                  No documents here
                </h4>

                <p>
                  Upload a PDF to start building your library.
                </p>

                <Button
                  className="library-primary-btn"
                  onClick={() =>
                    setShowUploadModal(true)
                  }
                >
                  <i className="bi bi-cloud-arrow-up me-2" />
                  Upload PDF
                </Button>
              </div>
            ) : (
              <div className="document-grid">

                {filteredDocuments.map((file) => (
                  <div
                    className="document-wrapper"
                    key={file.id}
                  >
                    <FileCard
                      file={file}
                      onClick={() =>
                        handleOpenFile(file)
                      }
                      onDelete={() =>
                        handleDelete(file)
                      }
                    />

                    
                  </div>
                ))}

              </div>
            )}
          </section>

        </main>

        {/* =====================================================
            FLOATING UPLOAD BUTTON
        ====================================================== */}

        <button
          type="button"
          className="library-floating-upload"
          onClick={() => {
            setUploadError('')
            setUploadSuccess('')
            setShowUploadModal(true)
          }}
          aria-label="Upload PDF"
        >
          <i className="bi bi-plus-lg" />
        </button>

        {/* =====================================================
            UPLOAD MODAL
        ====================================================== */}

        <Modal
          show={showUploadModal}
          onHide={() => {
            if (!isUploading) {
              resetUploadModal()
            }
          }}
          centered
          contentClassName="library-upload-modal"
        >
          <Modal.Header
            closeButton
            closeVariant="white"
            className="border-0"
          >
            <div>
              <Modal.Title>
                Upload Study Material
              </Modal.Title>

              <div className="upload-modal-subtitle">
                Add a PDF to your study library
              </div>
            </div>
          </Modal.Header>

          <Modal.Body>

            {uploadError && (
              <div className="upload-alert upload-alert-error">
                <i className="bi bi-exclamation-circle-fill" />
                <span>
                  {uploadError}
                </span>
              </div>
            )}

            {uploadSuccess && (
              <div className="upload-alert upload-alert-success">
                <i className="bi bi-check-circle-fill" />
                <span>
                  {uploadSuccess}
                </span>
              </div>
            )}

            <Form.Group className="mb-4">
              <Form.Label>
                Subject Name
              </Form.Label>

              <Form.Control
                type="text"
                placeholder="e.g. Operating Systems"
                value={uploadSubject}
                onChange={(event) => {
                  setUploadSubject(
                    event.target.value
                  )
                  setUploadError('')
                }}
                disabled={isUploading}
              />

              <Form.Text>
                Enter the subject related to this PDF.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <Form.Label>
                PDF Document
              </Form.Label>

              <div
                className={`upload-drop-zone ${
                  uploadFile
                    ? 'upload-drop-zone-selected'
                    : ''
                }`}
                onClick={() =>
                  !isUploading &&
                  fileInputRef.current?.click()
                }
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  hidden
                  onChange={
                    handleSelectFile
                  }
                  disabled={isUploading}
                />

                {uploadFile ? (
                  <>
                    <div className="upload-selected-icon">
                      <i className="bi bi-file-earmark-pdf-fill" />
                    </div>

                    <div className="upload-selected-name">
                      {uploadFile.name}
                    </div>

                    <div className="upload-selected-size">
                      {(
                        uploadFile.size /
                        1024 /
                        1024
                      ).toFixed(2)}{' '}
                      MB
                    </div>

                    <button
                      type="button"
                      className="upload-change-btn"
                      onClick={(event) => {
                        event.stopPropagation()

                        if (
                          fileInputRef.current
                        ) {
                          fileInputRef.current.click()
                        }
                      }}
                    >
                      Change PDF
                    </button>
                  </>
                ) : (
                  <>
                    <div className="upload-cloud-icon">
                      <i className="bi bi-cloud-arrow-up" />
                    </div>

                    <div className="upload-drop-title">
                      Choose a PDF
                    </div>

                    <div className="upload-drop-text">
                      Click here to browse your files
                    </div>

                    <div className="upload-drop-format">
                      PDF files only
                    </div>
                  </>
                )}
              </div>
            </Form.Group>

          </Modal.Body>

          <Modal.Footer className="border-0">

            <Button
              variant="dark"
              className="upload-cancel-btn"
              onClick={resetUploadModal}
              disabled={isUploading}
            >
              Cancel
            </Button>

            <Button
              className="upload-submit-btn"
              onClick={handleUpload}
              disabled={
                isUploading ||
                !uploadFile ||
                !uploadSubject.trim()
              }
            >
              {isUploading ? (
                <>
                  <Spinner
                    size="sm"
                    className="me-2"
                  />
                  Uploading...
                </>
              ) : (
                <>
                  <i className="bi bi-cloud-arrow-up me-2" />
                  Upload PDF
                </>
              )}
            </Button>

          </Modal.Footer>
        </Modal>

        {/* =====================================================
            DELETE MODAL
        ====================================================== */}

        <Modal
          show={itemToDelete !== null}
          onHide={() =>
            setItemToDelete(null)
          }
          centered
          contentClassName="library-delete-modal"
        >
          <Modal.Header
            closeButton
            closeVariant="white"
            className="border-0"
          >
            <Modal.Title>
              Delete Document
            </Modal.Title>
          </Modal.Header>

          <Modal.Body>

            <div className="delete-warning-icon">
              <i className="bi bi-trash3-fill" />
            </div>

            <h5>
              Delete this document?
            </h5>

            <p>
              You are about to delete
              <strong>
                {' '}
                {itemToDelete?.name}
              </strong>
              .
            </p>

            <div className="delete-document-info">
              <i className="bi bi-file-earmark-pdf-fill" />

              <div>
                <div>
                  {itemToDelete?.name}
                </div>

                <small>
                  {itemToDelete?.subject}
                </small>
              </div>
            </div>

            <div className="delete-note">
              <i className="bi bi-info-circle me-2" />
              This action cannot be undone.
            </div>

          </Modal.Body>

          <Modal.Footer className="border-0">

            <Button
              variant="dark"
              className="upload-cancel-btn"
              onClick={() =>
                setItemToDelete(null)
              }
            >
              Cancel
            </Button>

            <Button
              className="delete-confirm-btn"
              onClick={
                handleConfirmDelete
              }
            >
              <i className="bi bi-trash3 me-2" />
              Delete
            </Button>

          </Modal.Footer>
        </Modal>

      </div>

      {/* =======================================================
          PAGE STYLES
      ======================================================== */}

      <style>{`

        .library-page {
          background:
            radial-gradient(
              circle at 10% 0%,
              rgba(56, 189, 248, 0.08),
              transparent 28%
            ),
            radial-gradient(
              circle at 90% 10%,
              rgba(99, 102, 241, 0.07),
              transparent 30%
            ),
            #0b1120;

          min-height: 100vh;
        }

        /* HEADER */

        .library-header {
          position: sticky;
          top: 0;
          z-index: 1000;

          background: rgba(11, 17, 32, 0.88);
          backdrop-filter: blur(18px);

          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        }

        .library-header-inner {
          min-height: 76px;
          max-width: 1500px;
          margin: auto;

          padding: 0 28px;

          display: grid;
          grid-template-columns: 1fr minmax(300px, 620px) 1fr;
          align-items: center;
          gap: 28px;
        }

        .library-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .library-brand-icon {
          width: 42px;
          height: 42px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 13px;

          background: linear-gradient(
            135deg,
            #38bdf8,
            #6366f1
          );

          color: white;
          font-size: 20px;

          box-shadow:
            0 8px 30px rgba(56, 189, 248, 0.18);
        }

        .library-title {
          font-size: 21px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .library-subtitle {
          color: #7f8ca3;
          font-size: 12px;
          margin-top: 2px;
        }

        .library-search .input-group {
          height: 44px;

          background: rgba(15, 23, 42, 0.8);

          border: 1px solid #263247;
          border-radius: 13px;

          overflow: hidden;
        }

        .library-search .input-group-text {
          background: transparent;
          border: 0;
          color: #64748b;
          padding-left: 15px;
        }

        .library-search .form-control {
          background: transparent;
          border: 0;
          color: #e5e7eb;
          box-shadow: none;
          font-size: 14px;
        }

        .library-search .form-control::placeholder {
          color: #64748b;
        }

        .library-search-clear {
          color: #64748b !important;
          text-decoration: none;
        }

        .library-upload-header-btn {
          justify-self: end;

          border: 0 !important;
          border-radius: 11px !important;

          padding: 10px 17px !important;

          background: linear-gradient(
            135deg,
            #38bdf8,
            #6366f1
          ) !important;

          color: white !important;
          font-weight: 600 !important;

          box-shadow:
            0 8px 25px rgba(56, 189, 248, 0.15);
        }

        /* MAIN */

        .library-main {
          width: min(1500px, calc(100% - 56px));
          margin: auto;
          padding: 34px 0 100px;
        }

        /* STATS */

        .library-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 42px;
        }

        .library-stat-card {
          display: flex;
          align-items: center;
          gap: 15px;

          padding: 20px;

          background: rgba(18, 25, 41, 0.78);

          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 18px;

          box-shadow:
            0 12px 35px rgba(0, 0, 0, 0.15);
        }

        .library-stat-icon {
          width: 46px;
          height: 46px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 14px;

          font-size: 19px;
        }

        .subject-icon {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
        }

        .document-icon {
          background: rgba(168, 85, 247, 0.12);
          color: #c084fc;
        }

        .recent-icon {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
        }

        .library-stat-value {
          font-size: 24px;
          font-weight: 700;
        }

        .library-stat-label {
          color: #7f8ca3;
          font-size: 13px;
          margin-top: 1px;
        }

        /* SECTION */

        .library-section {
          margin-bottom: 46px;
        }

        .library-section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;

          margin-bottom: 20px;
        }

        .library-section-header h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .library-section-header p {
          margin: 6px 0 0;
          color: #718096;
          font-size: 13px;
        }

        .library-clear-filter {
          color: #38bdf8 !important;
          text-decoration: none !important;
          font-size: 13px;
        }

        /* SUBJECTS */

        .subject-grid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fill,
              minmax(210px, 1fr)
            );

          gap: 15px;
        }

        .subject-card {
          position: relative;

          min-height: 190px;

          padding: 19px;

          text-align: left;

          color: #e5e7eb;

          background:
            linear-gradient(
              145deg,
              rgba(20, 30, 48, 0.98),
              rgba(13, 20, 34, 0.98)
            );

          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 19px;

          cursor: pointer;

          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .subject-card:hover {
          transform: translateY(-4px);

          border-color: rgba(
            56,
            189,
            248,
            0.42
          );

          box-shadow:
            0 18px 40px rgba(0, 0, 0, 0.22);
        }

        .subject-card-active {
          border-color: rgba(
            56,
            189,
            248,
            0.65
          );

          box-shadow:
            0 0 0 1px rgba(
              56,
              189,
              248,
              0.14
            ),
            0 18px 40px rgba(
              56,
              189,
              248,
              0.08
            );
        }

        .subject-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;

          margin-bottom: 23px;
        }

        .subject-folder {
          width: 50px;
          height: 50px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 15px;

          font-size: 23px;
        }

        .all-folder {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
        }

        .folder-0 {
          background: rgba(99, 102, 241, 0.13);
          color: #818cf8;
        }

        .folder-1 {
          background: rgba(168, 85, 247, 0.13);
          color: #c084fc;
        }

        .folder-2 {
          background: rgba(20, 184, 166, 0.13);
          color: #2dd4bf;
        }

        .folder-3 {
          background: rgba(245, 158, 11, 0.13);
          color: #fbbf24;
        }

        .folder-4 {
          background: rgba(236, 72, 153, 0.13);
          color: #f472b6;
        }

        .subject-selected {
          font-size: 10px;
          font-weight: 600;

          color: #38bdf8;

          background: rgba(
            56,
            189,
            248,
            0.09
          );

          border: 1px solid rgba(
            56,
            189,
            248,
            0.2
          );

          padding: 5px 8px;
          border-radius: 20px;
        }

        .subject-card-name {
          font-size: 16px;
          font-weight: 650;

          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .subject-card-meta {
          color: #718096;
          font-size: 12px;
          margin-top: 5px;
        }

        .subject-card-footer {
          position: absolute;

          left: 19px;
          right: 19px;
          bottom: 17px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          color: #64748b;
          font-size: 11px;
        }

        .subject-card-footer i {
          color: #38bdf8;
        }

        /* DOCUMENTS */

        .documents-section {
          margin-top: 12px;
        }

        .documents-heading-row {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .documents-count {
          min-width: 25px;
          height: 22px;

          display: inline-flex;
          align-items: center;
          justify-content: center;

          padding: 0 7px;

          border-radius: 20px;

          background: rgba(
            56,
            189,
            248,
            0.1
          );

          color: #38bdf8;

          font-size: 11px;
          font-weight: 600;
        }

        .library-sort-btn {
          border: 1px solid #293548 !important;
          background: #121a2a !important;
          color: #a9b5c7 !important;

          border-radius: 10px !important;

          font-size: 12px !important;
        }

        .library-dropdown {
          background: #121a2a !important;
          border: 1px solid #293548 !important;
          border-radius: 12px !important;
        }

        .library-dropdown .dropdown-item {
          color: #cbd5e1;
          font-size: 13px;
          padding: 9px 13px;
        }

        .library-dropdown .dropdown-item:hover {
          background: #1e293b;
        }

        .library-dropdown .dropdown-item.active {
          background: rgba(
            56,
            189,
            248,
            0.1
          );
          color: #38bdf8;
        }

        .document-grid {
          display: grid;

          grid-template-columns:
            repeat(
              auto-fill,
              minmax(230px, 1fr)
            );

          gap: 17px;
        }

        .document-wrapper {
          min-width: 0;
        }

        .document-wrapper .card {
          height: 190px !important;

          background:
            linear-gradient(
              145deg,
              #121a2a,
              #0f1726
            ) !important;

          border: 1px solid
            rgba(
              148,
              163,
              184,
              0.11
            ) !important;

          border-radius: 18px !important;

          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .document-wrapper .card:hover {
          transform: translateY(-3px);

          border-color: rgba(
            56,
            189,
            248,
            0.3
          ) !important;

          box-shadow:
            0 16px 35px
            rgba(0, 0, 0, 0.2);
        }

        .document-extra-info {
          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 8px;

          padding: 9px 4px 0;

          font-size: 11px;
        }

        .document-subject {
          color: #7dd3fc;

          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;

          max-width: 70%;
        }

        .document-date {
          color: #64748b;
          white-space: nowrap;
        }

        /* EMPTY */

        .library-empty {
          min-height: 280px;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          text-align: center;

          background: rgba(
            15,
            23,
            42,
            0.5
          );

          border: 1px dashed #293548;
          border-radius: 20px;

          padding: 35px;
        }

        .small-empty {
          min-height: 260px;
        }

        .library-empty-icon {
          width: 62px;
          height: 62px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 18px;

          background: rgba(
            56,
            189,
            248,
            0.08
          );

          color: #38bdf8;

          font-size: 25px;

          margin-bottom: 15px;
        }

        .library-empty h4 {
          font-size: 17px;
          margin-bottom: 6px;
        }

        .library-empty p {
          color: #718096;
          font-size: 13px;
          margin-bottom: 18px;
        }

        .library-primary-btn {
          border: 0 !important;
          border-radius: 10px !important;

          background: linear-gradient(
            135deg,
            #38bdf8,
            #6366f1
          ) !important;

          font-size: 13px !important;
          font-weight: 600 !important;
        }

        /* LOADING */

        .library-loading {
          min-height: 180px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;

          color: #718096;
          font-size: 13px;
        }

        .library-loading .spinner-border {
          width: 22px;
          height: 22px;

          color: #38bdf8;
        }

        /* FLOATING BUTTON */

        .library-floating-upload {
          position: fixed;

          right: 30px;
          bottom: 30px;

          width: 58px;
          height: 58px;

          border: 0;
          border-radius: 18px;

          background: linear-gradient(
            135deg,
            #38bdf8,
            #6366f1
          );

          color: white;

          font-size: 20px;

          display: flex;
          align-items: center;
          justify-content: center;

          box-shadow:
            0 14px 35px
            rgba(0, 0, 0, 0.35);

          z-index: 1050;

          transition:
            transform 0.2s ease;
        }

        .library-floating-upload:hover {
          transform: translateY(-4px);
        }

        /* UPLOAD MODAL */

        .library-upload-modal,
        .library-delete-modal {
          background: #101827 !important;

          color: #e5e7eb;

          border: 1px solid #263247 !important;
          border-radius: 20px !important;
        }

        .library-upload-modal .modal-title,
        .library-delete-modal .modal-title {
          font-size: 19px;
          font-weight: 700;
        }

        .upload-modal-subtitle {
          color: #718096;
          font-size: 12px;
          margin-top: 4px;
        }

        .library-upload-modal .form-label {
          color: #dbe4f0;
          font-size: 13px;
          font-weight: 600;
        }

        .library-upload-modal .form-control {
          height: 45px;

          background: #0c1422 !important;

          border: 1px solid #293548 !important;

          color: #e5e7eb !important;

          border-radius: 11px;
          box-shadow: none !important;
        }

        .library-upload-modal .form-control::placeholder {
          color: #536174;
        }

        .library-upload-modal .form-text {
          color: #64748b;
          font-size: 11px;
        }

        .upload-drop-zone {
          min-height: 190px;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          text-align: center;

          padding: 25px;

          background: #0c1422;

          border: 1px dashed #334155;
          border-radius: 15px;

          cursor: pointer;

          transition:
            border-color 0.2s ease,
            background 0.2s ease;
        }

        .upload-drop-zone:hover,
        .upload-drop-zone-selected {
          border-color: #38bdf8;
          background: rgba(
            56,
            189,
            248,
            0.04
          );
        }

        .upload-cloud-icon {
          width: 53px;
          height: 53px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 15px;

          background: rgba(
            56,
            189,
            248,
            0.1
          );

          color: #38bdf8;

          font-size: 25px;

          margin-bottom: 12px;
        }

        .upload-drop-title {
          font-size: 14px;
          font-weight: 650;
        }

        .upload-drop-text {
          color: #718096;
          font-size: 12px;
          margin-top: 4px;
        }

        .upload-drop-format {
          color: #475569;
          font-size: 10px;
          margin-top: 8px;
        }

        .upload-selected-icon {
          color: #f87171;
          font-size: 40px;
          margin-bottom: 7px;
        }

        .upload-selected-name {
          max-width: 90%;

          font-size: 13px;
          font-weight: 600;

          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .upload-selected-size {
          color: #64748b;
          font-size: 11px;
          margin-top: 3px;
        }

        .upload-change-btn {
          margin-top: 10px;

          background: transparent;
          border: 0;

          color: #38bdf8;

          font-size: 11px;
          font-weight: 600;

          cursor: pointer;
        }

        .upload-alert {
          display: flex;
          align-items: center;
          gap: 9px;

          padding: 11px 13px;

          border-radius: 10px;

          font-size: 12px;

          margin-bottom: 17px;
        }

        .upload-alert-error {
          color: #fca5a5;
          background: rgba(
            239,
            68,
            68,
            0.08
          );

          border: 1px solid rgba(
            239,
            68,
            68,
            0.16
          );
        }

        .upload-alert-success {
          color: #86efac;
          background: rgba(
            34,
            197,
            94,
            0.08
          );

          border: 1px solid rgba(
            34,
            197,
            94,
            0.16
          );
        }

        .upload-cancel-btn {
          border: 1px solid #293548 !important;

          background: #111a2a !important;

          color: #94a3b8 !important;

          border-radius: 10px !important;

          font-size: 12px !important;
        }

        .upload-submit-btn {
          border: 0 !important;

          background: linear-gradient(
            135deg,
            #38bdf8,
            #6366f1
          ) !important;

          border-radius: 10px !important;

          font-size: 12px !important;
          font-weight: 600 !important;
        }

        /* DELETE */

        .delete-warning-icon {
          width: 55px;
          height: 55px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 16px;

          background: rgba(
            239,
            68,
            68,
            0.1
          );

          color: #f87171;

          font-size: 22px;

          margin-bottom: 15px;
        }

        .library-delete-modal h5 {
          font-size: 17px;
          margin-bottom: 6px;
        }

        .library-delete-modal p {
          color: #718096;
          font-size: 12px;
        }

        .delete-document-info {
          display: flex;
          align-items: center;
          gap: 12px;

          padding: 12px;

          background: #0c1422;

          border: 1px solid #293548;

          border-radius: 11px;

          margin: 15px 0;
        }

        .delete-document-info > i {
          color: #f87171;
          font-size: 24px;
        }

        .delete-document-info div {
          min-width: 0;
          font-size: 12px;

          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .delete-document-info small {
          color: #64748b;
          font-size: 10px;
        }

        .delete-note {
          color: #64748b;
          font-size: 11px;
        }

        .delete-confirm-btn {
          border: 0 !important;

          background: #ef4444 !important;

          border-radius: 10px !important;

          font-size: 12px !important;
          font-weight: 600 !important;
        }

        /* RESPONSIVE */

        @media (max-width: 900px) {

          .library-header-inner {
            grid-template-columns: 1fr auto;
            gap: 15px;
            padding: 12px 20px;
          }

          .library-search {
            grid-column: 1 / -1;
            grid-row: 2;
          }

          .library-upload-header-btn {
            grid-column: 2;
            grid-row: 1;
          }

          .library-stats {
            grid-template-columns: 1fr;
          }

          .library-main {
            width: min(
              calc(100% - 32px),
              1500px
            );
            padding-top: 25px;
          }

        }

        @media (max-width: 600px) {

          .library-header-inner {
            padding: 11px 15px;
          }

          .library-subtitle {
            display: none;
          }

          .library-title {
            font-size: 18px;
          }

          .library-brand-icon {
            width: 38px;
            height: 38px;
          }

          .library-upload-header-btn {
            padding: 9px 11px !important;
            font-size: 0 !important;
          }

          .library-upload-header-btn i {
            margin: 0 !important;
            font-size: 16px;
          }

          .library-section-header {
            align-items: flex-start;
          }

          .subject-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .document-grid {
            grid-template-columns: 1fr;
          }

          .library-floating-upload {
            right: 20px;
            bottom: 20px;
          }

        }

      `}</style>
    </>
  )
}
