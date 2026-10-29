import { useEffect, useMemo, useState, useContext } from 'react'
import { AuthContext } from '../context/AuthContext'
import {
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  ProgressBar,
  Row,
  Stack,
} from 'react-bootstrap'
import VivaRoom from './VivaRoom.jsx'

const API_URL = 'http://localhost:8000'

const pageStyles = `
.test-page-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.13), transparent 34%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.05), transparent 24%),
    #0F172A;
  color: #e2e8f0;
}

.test-page-shell .page-frame {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
}

.test-page-shell .hero-shell,
.test-page-shell .panel-surface {
  background: #1E293B;
  border: 1px solid #262626;
  border-radius: 24px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38);
}

.test-page-shell .mode-card {
  min-height: 152px;
  border-radius: 22px;
  border: 1px solid #262626;
  background: linear-gradient(180deg, rgba(18, 18, 18, 0.96), rgba(10, 10, 10, 0.96));
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.test-page-shell .mode-card:hover {
  transform: translateY(-1px);
  border-color: #3d4b57;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
}

.test-page-shell .mode-card.active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.18), 0 18px 40px rgba(0, 0, 0, 0.3);
  background: linear-gradient(180deg, rgba(18, 18, 18, 0.98), rgba(10, 10, 10, 0.98));
}

.test-page-shell .mode-card .mode-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #262626;
  background: rgba(255, 255, 255, 0.02);
  color: #38bdf8;
  font-size: 20px;
}

.test-page-shell .subject-chip {
  border-radius: 999px !important;
  border: 1px solid #262626 !important;
  background: #121212 !important;
  color: #c7d0db !important;
  padding: 10px 14px !important;
}

.test-page-shell .subject-chip.active {
  border-color: #38bdf8 !important;
  background: rgba(56, 189, 248, 0.13) !important;
  color: #7dd3fc !important;
}

.test-page-shell .question-option {
  border-radius: 16px !important;
  min-height: 58px;
  padding: 14px 16px !important;
  border: 1px solid #262626 !important;
  background: #334155 !important;
  color: #e2e8f0 !important;
  text-align: left !important;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease, transform 150ms ease;
}

.test-page-shell .question-option:hover {
  transform: translateY(-1px);
  border-color: #3b5165 !important;
}

.test-page-shell .question-option.active {
  border-color: #38bdf8 !important;
  background: rgba(56, 189, 248, 0.12) !important;
  color: #f8fbff !important;
}

.test-page-shell .mic-wrap {
  width: 220px;
  height: 220px;
  margin: 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  position: relative;
}

.test-page-shell .mic-wrap::before,
.test-page-shell .mic-wrap::after {
  content: '';
  position: absolute;
  inset: 16px;
  border-radius: 50%;
  border: 1px solid rgba(56, 189, 248, 0.16);
  pointer-events: none;
}

.test-page-shell .mic-wrap::after {
  inset: 0;
  border-color: rgba(56, 189, 248, 0.1);
}

.test-page-shell .mic-button {
  width: 118px;
  height: 118px;
  border-radius: 50% !important;
  border: 1px solid #262626 !important;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.36);
  position: relative;
}

.test-page-shell .mic-button.idle {
  background: linear-gradient(180deg, #334155, #1E293B) !important;
  color: #8a94a6 !important;
}

.test-page-shell .mic-button.listening {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.28), rgba(56, 189, 248, 0.14)) !important;
  color: #d9f3ff !important;
  animation: pulseRing 1.8s ease-in-out infinite;
}

.test-page-shell .mic-button.speaking {
  background: linear-gradient(180deg, rgba(18, 18, 18, 0.97), rgba(14, 14, 14, 0.97)) !important;
  color: #38bdf8 !important;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.24), 0 18px 32px rgba(0, 0, 0, 0.34);
}

@keyframes pulseRing {
  0% {
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.35), 0 18px 32px rgba(0, 0, 0, 0.34);
  }
  70% {
    box-shadow: 0 0 0 18px rgba(56, 189, 248, 0), 0 18px 32px rgba(0, 0, 0, 0.34);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0), 0 18px 32px rgba(0, 0, 0, 0.34);
  }
}

.test-page-shell .review-row {
  border: 1px solid #262626;
  background: #0f0f0f;
  border-radius: 18px;
  overflow: hidden;
}

.test-page-shell .review-toggle {
  cursor: pointer;
  user-select: none;
}

.test-page-shell .soft-divider {
  border-color: #262626 !important;
  opacity: 1;
}

.test-page-shell .summary-badge,
.test-page-shell .badge {
  border: 1px solid #262626 !important;
  background-color: #121212 !important;
  color: #e2e8f0 !important;
  font-weight: 400 !important;
}

.test-page-shell .badge.bg-success {
  border: 1px solid #166534 !important;
  background-color: #052e16 !important;
  color: #4ade80 !important;
}

.test-page-shell .badge.bg-danger {
  border: 1px solid #991b1b !important;
  background-color: #450a0a !important;
  color: #f87171 !important;
}

.test-page-shell .custom-scroll {
  scrollbar-width: thin;
  scrollbar-color: #262626 transparent;
}

.test-page-shell .custom-scroll::-webkit-scrollbar {
  width: 6px;
}

.test-page-shell .custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.test-page-shell .custom-scroll::-webkit-scrollbar-thumb {
  background: #262626;
  border-radius: 3px;
}

.test-page-shell .custom-scroll::-webkit-scrollbar-thumb:hover {
  background: #38bdf8;
}
`

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getElapsedSeconds(startedAt, completedAt) {
  if (!startedAt) return 0

  return Math.max(
    0,
    Math.round((completedAt - startedAt) / 1000)
  )
}

function normalizeGeneratedQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) {
    return []
  }

  return rawQuestions.map((question, index) => {
    const rawOptions = Array.isArray(question?.options)
      ? question.options
      : Array.isArray(question?.choices)
      ? question.choices
      : Array.isArray(question?.answers)
      ? question.answers
      : []

    const options = rawOptions.map((option, optionIndex) => {
      if (typeof option === 'string') {
        return {
          id: String.fromCharCode(97 + optionIndex),
          text: option,
        }
      }

      return {
        id:
          option?.id ||
          option?.key ||
          option?.value ||
          String.fromCharCode(97 + optionIndex),

        text:
          option?.text ||
          option?.value ||
          option?.label ||
          '',
      }
    })

    const correctAnswer =
      question?.correctOptionId ||
      question?.correct_option_id ||
      question?.correct_answer ||
      question?.answer ||
      null

    const correctOption = options.find(
      (option) =>
        String(option.id) === String(correctAnswer) ||
        String(option.text).trim().toLowerCase() ===
          String(correctAnswer).trim().toLowerCase()
    )

    return {
      ...question,

      id:
        question?.id ||
        question?.question_id ||
        `generated-${index}`,

      question:
        question?.question ||
        question?.question_text ||
        question?.text ||
        'Question unavailable',

      options,

      correctOptionId: correctOption?.id || null,

      subjectName:
        question?.subjectName ||
        question?.subject ||
        'General',

      category:
        question?.category ||
        question?.topic ||
        'General',

      sourceLabel:
        question?.sourceLabel ||
        question?.source ||
        question?.source_citation ||
        'Generated',

      sampleStudentResponse:
        question?.sampleStudentResponse ||
        question?.sample_student_response ||
        '',
    }
  })
}

function createQuizResults(
  questions,
  answers,
  startedAt,
  completedAt
) {
  const safeQuestions = Array.isArray(questions)
    ? questions
    : []

  const breakdown = safeQuestions.map((question) => {
    const selectedOptionId = answers?.[question.id] || null

    const options = Array.isArray(question?.options)
      ? question.options
      : []

    const selectedOption =
      options.find(
        (option) => option.id === selectedOptionId
      ) || null

    const correctOption =
      options.find(
        (option) =>
          option.id === question.correctOptionId
      ) || null

    return {
      id: question.id,

      subjectName:
        question.subjectName || 'General',

      category:
        question.category || 'General',

      sourceLabel:
        question.sourceLabel || 'Generated',

      question:
        question.question || 'Question unavailable',

      selectedOptionText: selectedOption
        ? selectedOption.text
        : 'No answer selected',

      correctOptionText: correctOption
        ? correctOption.text
        : 'Unavailable',

      isCorrect:
        selectedOptionId ===
        question.correctOptionId,
    }
  })

  const correctCount = breakdown.filter(
    (item) => item.isCorrect
  ).length

  const incorrectCount =
    breakdown.length - correctCount

  return {
    accuracy: breakdown.length
      ? Math.round(
          (correctCount / breakdown.length) * 100
        )
      : 0,

    correctCount,
    incorrectCount,
    reviewedCount: breakdown.length,

    timeElapsedSeconds:
      getElapsedSeconds(
        startedAt,
        completedAt
      ),

    breakdown,
  }
}

function createVivaResults(
  transcript,
  startedAt,
  completedAt,
  questionCount
) {
  const safeTranscript = Array.isArray(transcript)
    ? transcript
    : []

  const pairedCount = safeTranscript.length

  const performanceLabel =
    pairedCount >= 5
      ? 'Strong Conceptual Grasp'
      : pairedCount >= 3
      ? 'Solid Conceptual Base'
      : 'Needs More Articulation'

  const strengths =
    pairedCount >= 5
      ? [
          'Uses subject terminology with confidence',
          'Keeps answers structured and complete',
          'Connects concepts across prompts',
        ]
      : pairedCount >= 3
      ? [
          'Shows core recall under prompt changes',
          'Responds clearly with minimal hesitation',
          'Maintains topic alignment during follow-ups',
        ]
      : [
          'Shows baseline familiarity with the topic',
          'Responds to prompts with simple recall',
        ]

  const areasToImprove =
    pairedCount >= 5
      ? [
          'Add one more concrete example per answer',
          'Slow slightly on transitions between points',
        ]
      : [
          'Expand answers with supporting detail',
          'Use stronger signposting before concluding',
          'Practice a fuller explanation rhythm',
        ]

  return {
    performanceLabel,
    strengths,
    areasToImprove,
    reviewedCount: pairedCount,
    sourceQuestionCount: questionCount,

    timeElapsedSeconds:
      getElapsedSeconds(
        startedAt,
        completedAt
      ),

    transcript: safeTranscript,
  }
}

function ResultsMetricCard({
  title,
  value,
  subtitle,
  accent = false,
}) {
  return (
    <Card
      className="panel-surface h-100"
      body
      style={{ padding: 18 }}
    >
      <div
        className="text-uppercase small mb-2"
        style={{
          letterSpacing: '0.14em',
          color: '#8a94a6',
        }}
      >
        {title}
      </div>

      <div
        className="fw-semibold"
        style={{
          fontSize: accent ? 34 : 26,
          lineHeight: 1.05,
          color: accent
            ? '#7dd3fc'
            : '#f8fafc',
        }}
      >
        {value}
      </div>

      {subtitle ? (
        <div
          className="mt-2"
          style={{
            fontSize: 13,
            color: '#8a94a6',
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </Card>
  )
}

function ExpandableRow({
  item,
  expanded,
  onToggle,
  header,
  details,
  badge,
}) {
  return (
    <div className="review-row">
      <button
        type="button"
        className="review-toggle w-100 border-0 bg-transparent text-start text-light p-3 p-md-4"
        onClick={onToggle}
        style={{ outline: 'none' }}
      >
        <div className="d-flex align-items-start justify-content-between gap-3">
          <div className="flex-grow-1">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              {header}
            </div>

            <div
              className="text-light"
              style={{ color: '#dbe3ea' }}
            >
              {item.questionPreview}
            </div>
          </div>

          <i
            className={`bi ${
              expanded
                ? 'bi-chevron-up'
                : 'bi-chevron-down'
            }`}
            aria-hidden="true"
            style={{
              color: '#8a94a6',
              fontSize: 18,
            }}
          />
        </div>
      </button>

      <Collapse in={expanded}>
        <div>
          <div className="px-3 px-md-4 pb-4 pt-0">
            <hr className="soft-divider my-0 mb-3" />

            {details}

            {badge ? (
              <div className="mt-3">
                {badge}
              </div>
            ) : null}
          </div>
        </div>
      </Collapse>
    </div>
  )
}

function ResultsShell({
  title,
  eyebrow,
  summaryCards,
  footerNote,
  children,
  onReset,
}) {
  const safeSummaryCards = Array.isArray(summaryCards)
    ? summaryCards
    : []

  const summaryClassName =
    safeSummaryCards.length >= 5
      ? 'row-cols-xl-5'
      : 'row-cols-xl-4'

  return (
    <div className="d-flex flex-column gap-4">
      <div className="hero-shell p-4 p-xl-5 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 gap-lg-4">
        <div>
          <div
            className="text-uppercase small mb-2"
            style={{
              letterSpacing: '0.16em',
              color: '#8a94a6',
            }}
          >
            {eyebrow}
          </div>

          <h2
            className="m-0 fw-semibold"
            style={{
              fontSize: 34,
              color: '#f8fafc',
            }}
          >
            {title}
          </h2>
        </div>

        <Button
          variant="outline-secondary"
          onClick={onReset}
          style={{ minWidth: 168 }}
        >
          Return to Home
        </Button>
      </div>

      <Row
        className={`g-3 row-cols-1 row-cols-md-2 ${summaryClassName}`}
      >
        {safeSummaryCards.map((card) => (
          <Col key={card.title}>
            <ResultsMetricCard {...card} />
          </Col>
        ))}
      </Row>

      {footerNote ? (
        <Card
          className="panel-surface"
          body
          style={{ padding: 18 }}
        >
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div style={{ color: '#8a94a6' }}>
              {footerNote.left}
            </div>

            <div style={{ color: '#cbd5e1' }}>
              {footerNote.right}
            </div>
          </div>
        </Card>
      ) : null}

      {children}
    </div>
  )
}

export default function TestPage() {
  const { user } = useContext(AuthContext)

  const [sessionState, setSessionState] =
    useState('setup')

  const [mode, setMode] = useState(null)

  const [
    selectedSubjects,
    setSelectedSubjects,
  ] = useState([])

  const [uploadedDocuments, setUploadedDocuments] =
    useState([])

  const [documentsLoading, setDocumentsLoading] =
    useState(true)

  const [documentsError, setDocumentsError] =
    useState('')

  const [generationError, setGenerationError] =
    useState('')

  const [isGenerating, setIsGenerating] =
    useState(false)

  const [questionCount, setQuestionCount] =
    useState(10)

  const [customGuidelines, setCustomGuidelines] =
    useState('')

  const [questions, setQuestions] =
    useState([])

  const [
    currentQuestionIndex,
    setCurrentQuestionIndex,
  ] = useState(0)

  const [answers, setAnswers] =
    useState({})

  const [micState, setMicState] =
    useState('idle')

  const [transcript, setTranscript] =
    useState([])

  const [
    sessionStartedAt,
    setSessionStartedAt,
  ] = useState(null)

  const [
    sessionCompletedAt,
    setSessionCompletedAt,
  ] = useState(null)

  const [quizResults, setQuizResults] =
    useState(null)

  const [masteryResult, setMasteryResult] =
    useState(null)

  const [submitting, setSubmitting] =
    useState(false)

  const [vivaResults, setVivaResults] =
    useState(null)

  const [expandedRows, setExpandedRows] =
    useState({})

  const [displayNow, setDisplayNow] =
    useState(() => Date.now())

  useEffect(() => {
    if (
      sessionState !== 'quiz' &&
      sessionState !== 'viva'
    ) {
      return undefined
    }

    const intervalId =
      window.setInterval(() => {
        setDisplayNow(Date.now())
      }, 1000)

    return () =>
      window.clearInterval(intervalId)
  }, [
    sessionState,
    sessionStartedAt,
  ])

  const subjectMap = useMemo(() => {
    return new Map(
      uploadedDocuments.map((document) => [
        document.document_id,
        document,
      ])
    )
  }, [uploadedDocuments])

  const setupPreviewQuestions = useMemo(
    () => [],
    []
  )

  const activeQuestions =
    sessionState === 'setup'
      ? setupPreviewQuestions
      : Array.isArray(questions)
      ? questions
      : []

  const currentQuestion =
    activeQuestions[currentQuestionIndex] ||
    null

  const elapsedSeconds =
    sessionStartedAt
      ? getElapsedSeconds(
          sessionStartedAt,
          sessionCompletedAt ?? displayNow
        )
      : 0

  const elapsedLabel =
    formatDuration(elapsedSeconds)

  const selectedSubjectNames =
    selectedSubjects.length
      ? selectedSubjects
          .map((documentId) => {
            const document =
              subjectMap.get(documentId)

            return (
              document?.subject ||
              document?.filename?.replace(
                /\.pdf$/i,
                ''
              ) ||
              'Uploaded Notes'
            )
          })
          .filter(Boolean)
      : []

  useEffect(() => {
    const fetchUploadedDocuments =
      async () => {
        const studentId =
          user?.student_id || user?.id

        if (!studentId) {
          setUploadedDocuments([])
          setDocumentsLoading(false)
          return
        }

        setDocumentsLoading(true)
        setDocumentsError('')

        try {
          const response = await fetch(
            `${API_URL}/api/v1/documents/${studentId}`
          )

          const data =
            await response
              .json()
              .catch(() => ({}))

          if (!response.ok) {
            throw new Error(
              data?.detail ||
                `Failed to load uploaded PDFs (${response.status})`
            )
          }

          const documents =
            Array.isArray(data)
              ? data
              : Array.isArray(
                  data?.documents
                )
              ? data.documents
              : []

          const normalizedDocuments =
            documents
              .filter(
                (document) =>
                  document?.document_id
              )
              .map((document) => ({
                ...document,
                subject:
                  document.subject ||
                  document.filename?.replace(
                    /\.pdf$/i,
                    ''
                  ) ||
                  'Uploaded Notes',
              }))

          setUploadedDocuments(
            normalizedDocuments
          )

          setSelectedSubjects(
            (previous) =>
              previous.filter(
                (documentId) =>
                  normalizedDocuments.some(
                    (document) =>
                      document.document_id ===
                      documentId
                  )
              )
          )
        } catch (error) {
          setUploadedDocuments([])

          setDocumentsError(
            error?.message ||
              'Unable to load uploaded notes.'
          )
        } finally {
          setDocumentsLoading(false)
        }
      }

    fetchUploadedDocuments()
  }, [user?.student_id, user?.id])

  const initializeSession = async () => {
    if (isGenerating) return

    setGenerationError('')

    const studentId =
      user?.student_id || user?.id

    const selectedDocumentIds =
      Array.isArray(selectedSubjects)
        ? selectedSubjects
        : []

    if (!studentId) {
      setGenerationError(
        'Please log in before starting a test.'
      )
      return
    }

    if (!mode) {
      setGenerationError(
        'Please select Quiz Mode or Viva Mode.'
      )
      return
    }

    if (!selectedDocumentIds.length) {
      setGenerationError(
        'Please select at least one of your uploaded PDFs.'
      )
      return
    }

    const selectedDocuments =
      selectedDocumentIds
        .map((id) =>
          subjectMap.get(id)
        )
        .filter(Boolean)

    if (!selectedDocuments.length) {
      setGenerationError(
        'The selected PDFs are no longer available. Please refresh and try again.'
      )
      return
    }

    setIsGenerating(true)

    try {
      const selectedSubjectNames =
        selectedDocuments
          .map(
            (document) =>
              document.subject ||
              document.filename?.replace(
                /\.pdf$/i,
                ''
              ) ||
              'Uploaded Notes'
          )
          .filter(Boolean)

      const topic =
        selectedSubjectNames.join(', ')

      const response = await fetch(
        `${API_URL}/api/v1/tests/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            student_id: studentId,
            document_ids:
              selectedDocumentIds,
            topic,
            num_questions:
              questionCount,
          }),
        }
      )

      const data =
        await response
          .json()
          .catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.message ||
            `Test generation failed: ${response.status}`
        )
      }

      let generatedQuestions =
        normalizeGeneratedQuestions(
          data?.questions
        )

      if (mode === 'quiz') {
        generatedQuestions =
          generatedQuestions.filter(
            (question) =>
              Array.isArray(
                question.options
              ) &&
              question.options.length ===
                4
          )
      }

      if (!generatedQuestions.length) {
        throw new Error(
          'No valid questions were generated from the selected PDFs. Make sure all selected PDFs have finished processing.'
        )
      }

      setQuestions(
        generatedQuestions.slice(
          0,
          questionCount
        )
      )

      setAnswers({})
      setCurrentQuestionIndex(0)
      setTranscript([])
      setMicState('idle')
      setQuizResults(null)
      setMasteryResult(null)
      setVivaResults(null)
      setExpandedRows({})
      setSessionStartedAt(Date.now())
      setSessionCompletedAt(null)

      setIsGenerating(false)

      setSessionState(
        mode === 'quiz'
          ? 'quiz'
          : 'viva'
      )
    } catch (error) {
      setQuestions([])

      setGenerationError(
        error?.message ||
          'Unable to generate questions from the selected PDFs.'
      )

      setIsGenerating(false)
    }
  }

  const resetToSetup = () => {
    setSessionState('setup')
    setMode(null)
    setSelectedSubjects([])
    setGenerationError('')
    setIsGenerating(false)
    setQuestionCount(10)
    setCustomGuidelines('')
    setQuestions([])
    setCurrentQuestionIndex(0)
    setAnswers({})
    setMicState('idle')
    setTranscript([])
    setSessionStartedAt(null)
    setSessionCompletedAt(null)
    setQuizResults(null)
    setMasteryResult(null)
    setSubmitting(false)
    setVivaResults(null)
    setExpandedRows({})
  }

  const toggleSubject = (
    documentId
  ) => {
    setGenerationError('')

    setSelectedSubjects(
      (previous) =>
        previous.includes(documentId)
          ? previous.filter(
              (id) =>
                id !== documentId
            )
          : [
              ...previous,
              documentId,
            ]
    )
  }

  const toggleExpandedRow = (
    rowId
  ) => {
    setExpandedRows(
      (prev) => ({
        ...prev,
        [rowId]:
          !prev[rowId],
      })
    )
  }

  const handleAnswerSelect = (
    questionId,
    optionId
  ) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]:
        optionId,
    }))
  }

  const handleSubmitQuiz =
    async () => {
      if (submitting) return

      const completedAt =
        Date.now()

      const result =
        createQuizResults(
          questions,
          answers,
          sessionStartedAt,
          completedAt
        )

      setSubmitting(true)
      setQuizResults(result)
      setSessionCompletedAt(
        completedAt
      )

      if (
        !user ||
        (!user.student_id &&
          !user.id)
      ) {
        setSubmitting(false)
        setSessionState(
          'results'
        )
        return
      }

      const studentId =
        user.student_id ||
        user.id

      try {
        const masteryResults =
          {}

        for (
          const item of result.breakdown
        ) {
          const subject =
            item.subjectName ||
            'General'

          const topic =
            item.category ||
            'General'

          try {
            const response =
              await fetch(
                `${API_URL}/api/v1/mastery/update`,
                {
                  method:
                    'POST',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify(
                    {
                      student_id:
                        studentId,
                      subject,
                      topic,
                      is_correct:
                        Boolean(
                          item.isCorrect
                        ),
                    }
                  ),
                }
              )

            if (!response.ok) {
              const errorText =
                await response.text()

              throw new Error(
                `Mastery update failed: ${response.status} ${errorText}`
              )
            }

            const masteryData =
              await response.json()

            masteryResults[
              `${subject}-${topic}`
            ] = masteryData
          } catch (error) {
            // Continue with the remaining mastery updates.
          }
        }

        const allMasteryResults =
          Object.values(
            masteryResults
          )

        if (
          allMasteryResults.length >
          0
        ) {
          setMasteryResult(
            allMasteryResults
          )
        }
      } catch (error) {
        // Mastery failure should not prevent the user from seeing results.
      } finally {
        setSubmitting(false)
        setSessionState(
          'results'
        )
      }
    }

  const completedExchangesCount =
    useMemo(() => {
      return transcript.filter(
        (entry) =>
          entry.studentText !== null
      ).length
    }, [transcript])

  const handleVivaComplete = (
    completedTranscript
  ) => {
    const completedAt =
      Date.now()

    const safeTranscript =
      Array.isArray(
        completedTranscript
      )
        ? completedTranscript.filter(
            (entry) =>
              entry?.studentText
          )
        : []

    const result =
      createVivaResults(
        safeTranscript,
        sessionStartedAt,
        completedAt,
        questions.length
      )

    setTranscript(
      safeTranscript
    )

    setVivaResults(result)
    setSessionCompletedAt(
      completedAt
    )

    setSessionState(
      'results'
    )
  }

  const modeCards = [
    {
      id: 'quiz',
      title: 'Quiz Mode',
      description:
        'Answer objective questions with a reviewable score breakdown.',
      icon: 'bi-ui-checks-grid',
    },
    {
      id: 'viva',
      title: 'Viva Mode',
      description:
        'Practice spoken reasoning with a transcript-driven review.',
      icon: 'bi-mic-fill',
    },
  ]

  const setupView = (
    <Row className="g-4 align-items-start">
      <Col xxl={8}>
        <Card className="hero-shell p-4 p-xl-5 h-100">
          <div className="mb-4">
            <div
              className="text-uppercase small mb-2"
              style={{
                letterSpacing:
                  '0.16em',
                color: '#8a94a6',
              }}
            >
              Session Setup
            </div>

            <h2
              className="m-0 fw-semibold"
              style={{
                fontSize: 32,
                color: '#f8fafc',
              }}
            >
              Choose your practice flow
            </h2>
          </div>

          <div className="mb-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h3
                className="m-0"
                style={{
                  fontSize: 18,
                  color: '#f8fafc',
                }}
              >
                Select Mode
              </h3>

              <span
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                Pick one to continue
              </span>
            </div>

            <Row className="g-3">
              {modeCards.map(
                (card) => {
                  const isActive =
                    mode ===
                    card.id

                  return (
                    <Col
                      md={6}
                      key={
                        card.id
                      }
                    >
                      <Button
                        type="button"
                        className={`mode-card w-100 text-start p-4 ${
                          isActive
                            ? 'active'
                            : ''
                        }`}
                        onClick={() =>
                          setMode(
                            card.id
                          )
                        }
                        disabled={
                          isGenerating
                        }
                      >
                        <div className="d-flex align-items-start gap-3">
                          <div className="mode-icon">
                            <i
                              className={`bi ${card.icon}`}
                              aria-hidden="true"
                            />
                          </div>

                          <div className="flex-grow-1">
                            <div
                              className="fw-semibold mb-2"
                              style={{
                                fontSize: 22,
                                color:
                                  '#f8fafc',
                              }}
                            >
                              {
                                card.title
                              }
                            </div>

                            <div
                              style={{
                                color:
                                  '#8a94a6',
                                lineHeight:
                                  1.5,
                              }}
                            >
                              {
                                card.description
                              }
                            </div>
                          </div>
                        </div>
                      </Button>
                    </Col>
                  )
                }
              )}
            </Row>
          </div>

          <div className="mb-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h3
                className="m-0"
                style={{
                  fontSize: 18,
                  color:
                    '#f8fafc',
                }}
              >
                Select Uploaded Notes
              </h3>

              <span
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                {selectedSubjects.length
                  ? `${selectedSubjects.length} PDF${
                      selectedSubjects.length ===
                      1
                        ? ''
                        : 's'
                    } selected`
                  : 'Select one or more PDFs'}
              </span>
            </div>

            {documentsLoading ? (
              <div
                className="panel-surface p-4 text-center"
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                Loading your uploaded
                notes...
              </div>
            ) : documentsError ? (
              <div
                className="alert alert-danger"
                role="alert"
              >
                {documentsError}
              </div>
            ) : uploadedDocuments.length ===
              0 ? (
              <div
                className="panel-surface p-4"
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                No processed PDFs
                found. Upload your
                study notes first,
                then return here.
              </div>
            ) : (
              <div className="d-flex flex-wrap gap-2">
                {uploadedDocuments.map(
                  (document) => {
                    const isActive =
                      selectedSubjects.includes(
                        document.document_id
                      )

                    const label =
                      document.subject ||
                      document.filename?.replace(
                        /\.pdf$/i,
                        ''
                      ) ||
                      'Uploaded Notes'

                    return (
                      <Button
                        key={
                          document.document_id
                        }
                        type="button"
                        size="sm"
                        className={`subject-chip ${
                          isActive
                            ? 'active'
                            : ''
                        }`}
                        onClick={() =>
                          toggleSubject(
                            document.document_id
                          )
                        }
                        disabled={
                          isGenerating
                        }
                      >
                        <i
                          className="bi bi-file-earmark-pdf me-2"
                          aria-hidden="true"
                        />
                        {label}
                      </Button>
                    )
                  }
                )}
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h3
                className="m-0"
                style={{
                  fontSize: 18,
                  color:
                    '#f8fafc',
                }}
              >
                Number of Questions
              </h3>

              <span
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                Range 5-15
              </span>
            </div>

            <div className="panel-surface p-3 p-md-4">
              <Form.Range
                min={5}
                max={15}
                value={questionCount}
                onChange={(event) =>
                  setQuestionCount(
                    Number(
                      event.target
                        .value
                    )
                  )
                }
                disabled={
                  isGenerating
                }
              />

              <div
                className="d-flex justify-content-between mt-2"
                style={{
                  color:
                    '#8a94a6',
                  fontSize: 13,
                }}
              >
                <span>5</span>
                <span>15</span>
              </div>
            </div>
          </div>

          <div>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h3
                className="m-0"
                style={{
                  fontSize: 18,
                  color:
                    '#f8fafc',
                }}
              >
                Custom Guidelines
              </h3>

              <span
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                Optional session notes
              </span>
            </div>

            <Form.Control
              as="textarea"
              rows={5}
              value={
                customGuidelines
              }
              onChange={(event) =>
                setCustomGuidelines(
                  event.target.value
                )
              }
              placeholder="Add any reminders, focus areas, or constraints for this session..."
              className="border-0"
              disabled={
                isGenerating
              }
              style={{
                borderRadius: 20,
                background:
                  '#0d0d0d',
                color:
                  '#e2e8f0',
                border:
                  '1px solid #262626',
                boxShadow:
                  'none',
              }}
            />
          </div>
        </Card>
      </Col>

      <Col xxl={4}>
        <Card className="hero-shell p-4 h-100">
          <div className="mb-4">
            <div
              className="text-uppercase small mb-1"
              style={{
                letterSpacing:
                  '0.16em',
                color:
                  '#8a94a6',
              }}
            >
              Session Summary
            </div>

            <h3
              className="m-0 fw-semibold"
              style={{
                fontSize: 24,
                color:
                  '#f8fafc',
              }}
            >
              Live preview
            </h3>
          </div>

          <Stack gap={3}>
            <Card
              className="panel-surface"
              body
              style={{
                padding: 18,
              }}
            >
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.14em',
                  color:
                    '#8a94a6',
                }}
              >
                Mode
              </div>

              <div
                className="fw-semibold"
                style={{
                  fontSize: 22,
                  color:
                    '#f8fafc',
                }}
              >
                {mode
                  ? mode ===
                    'quiz'
                    ? 'Quiz Mode'
                    : 'Viva Mode'
                  : 'Select a mode'}
              </div>
            </Card>

            <Card
              className="panel-surface"
              body
              style={{
                padding: 18,
              }}
            >
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.14em',
                  color:
                    '#8a94a6',
                }}
              >
                Subjects
              </div>

              <div className="d-flex flex-wrap gap-2">
                {selectedSubjectNames.map(
                  (name) => (
                    <span
                      key={name}
                      className="rounded-pill px-3 py-2 fw-normal"
                      style={{
                        backgroundColor:
                          '#121212',
                        border:
                          '1px solid #262626',
                        color:
                          '#e2e8f0',
                        fontSize: 13,
                        lineHeight: 1,
                        display:
                          'inline-block',
                      }}
                    >
                      {name}
                    </span>
                  )
                )}
              </div>

              <div
                className="mt-3"
                style={{
                  color:
                    '#8a94a6',
                  fontSize: 13,
                }}
              >
                {selectedSubjects.length
                  ? 'Questions will be generated only from the selected PDFs.'
                  : 'Select one or more uploaded PDFs to generate questions from their notes.'}
              </div>
            </Card>

            <Card
              className="panel-surface"
              body
              style={{
                padding: 18,
              }}
            >
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.14em',
                  color:
                    '#8a94a6',
                }}
              >
                Question Count
              </div>

              <div
                className="fw-semibold"
                style={{
                  fontSize: 22,
                  color:
                    '#f8fafc',
                }}
              >
                {questionCount}
              </div>

              <div
                className="mt-2"
                style={{
                  color:
                    '#8a94a6',
                  fontSize: 13,
                }}
              >
                Questions are generated
                from all selected
                uploaded PDFs when you
                initialize the session.
              </div>
            </Card>

            <Card
              className="panel-surface"
              body
              style={{
                padding: 18,
              }}
            >
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.14em',
                  color:
                    '#8a94a6',
                }}
              >
                Guidelines
              </div>

              <div
                style={{
                  color:
                    customGuidelines.trim()
                      ? '#e2e8f0'
                      : '#8a94a6',
                  lineHeight: 1.6,
                  whiteSpace:
                    'pre-wrap',
                }}
              >
                {customGuidelines.trim() ||
                  'No custom guidelines added.'}
              </div>
            </Card>

            {generationError ? (
              <div
                className="alert alert-danger mb-0"
                role="alert"
              >
                {generationError}
              </div>
            ) : null}

            {isGenerating ? (
              <div
                className="panel-surface p-4 text-center"
                style={{
                  borderRadius: 20,
                  border:
                    '1px solid rgba(56, 189, 248, 0.25)',
                  background:
                    'linear-gradient(180deg, rgba(56, 189, 248, 0.08), rgba(15, 23, 42, 0.95))',
                }}
              >
                <div
                  className="spinner-border mb-3"
                  role="status"
                  style={{
                    width: 42,
                    height: 42,
                    color:
                      '#38bdf8',
                    borderWidth: 3,
                  }}
                >
                  <span className="visually-hidden">
                    Generating your test...
                  </span>
                </div>

                <h4
                  className="mb-2 fw-semibold"
                  style={{
                    color:
                      '#f8fafc',
                  }}
                >
                  Generating your
                  test...
                </h4>

                <p
                  className="mb-0"
                  style={{
                    color:
                      '#8a94a6',
                    lineHeight: 1.6,
                  }}
                >
                  AI is creating
                  questions from your
                  selected PDFs. Please
                  wait a moment.
                </p>
              </div>
            ) : (
              <Button
                type="button"
                size="lg"
                className="w-100"
                onClick={
                  initializeSession
                }
                disabled={
                  !mode ||
                  documentsLoading ||
                  uploadedDocuments.length ===
                    0 ||
                  selectedSubjects.length ===
                    0
                }
                style={{
                  borderRadius: 18,
                  minHeight: 56,
                }}
              >
                Initialize Session
              </Button>
            )}
          </Stack>
        </Card>
      </Col>
    </Row>
  )

  const quizView =
    currentQuestion ? (
      <div className="d-flex flex-column gap-4">
        <div className="hero-shell p-4 p-xl-5 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 gap-lg-4">
          <div>
            <div
              className="text-uppercase small mb-2"
              style={{
                letterSpacing:
                  '0.16em',
                color:
                  '#8a94a6',
              }}
            >
              Quiz Mode
            </div>

            <h2
              className="m-0 fw-semibold"
              style={{
                fontSize: 34,
                color:
                  '#f8fafc',
              }}
            >
              Question{' '}
              {currentQuestionIndex + 1}{' '}
              of {questions.length}
            </h2>
          </div>

          <div className="d-flex flex-column align-items-lg-end gap-2">
            <Badge className="summary-badge rounded-pill px-3 py-2">
              Timer {elapsedLabel}
            </Badge>

            <div
              style={{
                color:
                  '#8a94a6',
                fontSize: 13,
              }}
            >
              Objective practice with
              answer review
            </div>
          </div>
        </div>

        <Card className="panel-surface p-4 p-xl-5">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <Badge className="summary-badge rounded-pill px-3 py-2">
              Source:{' '}
              {currentQuestion.sourceLabel ||
                'Generated'}
            </Badge>

            <Badge className="summary-badge rounded-pill px-3 py-2">
              {currentQuestion.category ||
                'General'}
            </Badge>
          </div>

          <ProgressBar
            now={
              questions.length
                ? ((currentQuestionIndex +
                    1) /
                    questions.length) *
                  100
                : 0
            }
            style={{
              height: 10,
              backgroundColor:
                '#1E293B',
            }}
            className="mb-4"
          />

          <h3
            className="mb-4"
            style={{
              fontSize: 28,
              lineHeight: 1.3,
              color:
                '#f8fafc',
            }}
          >
            {currentQuestion.question}
          </h3>

          <div className="d-grid gap-3">
            {(Array.isArray(
              currentQuestion.options
            )
              ? currentQuestion.options
              : []
            ).map((option) => {
              const selected =
                answers[
                  currentQuestion.id
                ] === option.id

              return (
                <Button
                  key={
                    option.id
                  }
                  type="button"
                  className={`question-option ${
                    selected
                      ? 'active'
                      : ''
                  }`}
                  variant="secondary"
                  onClick={() =>
                    handleAnswerSelect(
                      currentQuestion.id,
                      option.id
                    )
                  }
                >
                  <div className="d-flex align-items-start gap-3">
                    <div
                      className="d-inline-flex align-items-center justify-content-center"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        border:
                          '1px solid #262626',
                        background:
                          selected
                            ? 'rgba(56, 189, 248, 0.16)'
                            : '#121212',
                        color:
                          selected
                            ? '#7dd3fc'
                            : '#8a94a6',
                        flex: '0 0 auto',
                      }}
                    >
                      {String(
                        option.id
                      ).toUpperCase()}
                    </div>

                    <div className="flex-grow-1">
                      {option.text}
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>

          {(!Array.isArray(
            currentQuestion.options
          ) ||
            currentQuestion.options
              .length === 0) && (
            <div
              className="alert alert-warning mt-3"
              role="alert"
            >
              No answer options were returned
              for this question.
            </div>
          )}

          <div
            className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center justify-content-between gap-3 mt-4 pt-4 border-top"
            style={{
              borderColor:
                '#262626',
            }}
          >
            <Button
              type="button"
              variant="outline-secondary"
              onClick={() =>
                setCurrentQuestionIndex(
                  (prev) =>
                    Math.max(
                      0,
                      prev - 1
                    )
                )
              }
              disabled={
                currentQuestionIndex ===
                0
              }
              style={{
                minWidth: 132,
                minHeight: 48,
              }}
            >
              Previous
            </Button>

            <div
              className="d-flex align-items-center gap-2"
              style={{
                color:
                  '#8a94a6',
              }}
            >
              <i
                className="bi bi-clock"
                aria-hidden="true"
              />

              <span>
                {elapsedLabel}{' '}
                elapsed
              </span>
            </div>

            <div className="d-flex gap-2">
              {currentQuestionIndex <
              questions.length - 1 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    setCurrentQuestionIndex(
                      (prev) =>
                        Math.min(
                          questions.length -
                            1,
                          prev + 1
                        )
                    )
                  }
                  style={{
                    minWidth: 132,
                    minHeight: 48,
                  }}
                >
                  Next
                </Button>
              ) : null}

              {currentQuestionIndex ===
              questions.length - 1 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={
                    handleSubmitQuiz
                  }
                  disabled={
                    submitting
                  }
                  style={{
                    minWidth: 132,
                    minHeight: 48,
                  }}
                >
                  {submitting
                    ? 'Submitting...'
                    : 'Submit'}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    ) : (
      <Card className="panel-surface p-5 text-center">
        <h4
          style={{
            color:
              '#f8fafc',
          }}
        >
          No quiz questions available
        </h4>

        <p
          style={{
            color:
              '#8a94a6',
          }}
        >
          Please return to setup and try again.
        </p>

        <Button
          onClick={
            resetToSetup
          }
        >
          Return to Home
        </Button>
      </Card>
    )

  const resultsView =
    sessionState === 'results' &&
    mode === 'quiz' &&
    quizResults ? (
      <ResultsShell
        title="Quiz Results"
        eyebrow="Practice Complete"
        onReset={resetToSetup}
        summaryCards={[
          {
            title: 'Accuracy',
            value: `${quizResults.accuracy}%`,
            subtitle:
              'Score across all submitted questions',
            accent: true,
          },
          {
            title: 'Mastery',
            value:
              masteryResult
                ? `${masteryResult.mastery_percentage}%`
                : 'N/A',
            subtitle:
              masteryResult
                ? `${masteryResult.subject} • ${masteryResult.topic}`
                : 'BKT-based mastery score',
            accent: true,
          },
          {
            title: 'Correct',
            value:
              quizResults.correctCount,
            subtitle:
              'Questions matched with the key',
          },
          {
            title: 'Incorrect',
            value:
              quizResults.incorrectCount,
            subtitle:
              'Questions needing another pass',
          },
          {
            title: 'Time Elapsed',
            value:
              formatDuration(
                quizResults.timeElapsedSeconds
              ),
            subtitle:
              'Total active quiz time',
          },
          {
            title: 'Items Reviewed',
            value:
              quizResults.reviewedCount,
            subtitle:
              'Question set included in this run',
          },
        ]}
        footerNote={{
          left: 'Expanded rows show the selected answer and the expected answer for each item.',
          right: `${quizResults.reviewedCount} questions reviewed`,
        }}
      >
        <Card className="panel-surface p-4 p-xl-5">
          <div className="d-flex align-items-center justify-content-between gap-3 mb-4">
            <div>
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.16em',
                  color:
                    '#8a94a6',
                }}
              >
                Breakdown
              </div>

              <h3
                className="m-0 fw-semibold"
                style={{
                  fontSize: 28,
                  color:
                    '#f8fafc',
                }}
              >
                Question review
              </h3>
            </div>

            <Badge className="summary-badge rounded-pill px-3 py-2">
              Quiz Mode
            </Badge>
          </div>

          <div className="d-flex flex-column gap-3">
            {Array.isArray(
              quizResults.breakdown
            ) &&
              quizResults.breakdown.map(
                (item) => {
                  const expanded =
                    Boolean(
                      expandedRows[
                        item.id
                      ]
                    )

                  return (
                    <ExpandableRow
                      key={
                        item.id
                      }
                      item={{
                        ...item,
                        questionPreview:
                          item.question,
                      }}
                      expanded={
                        expanded
                      }
                      onToggle={() =>
                        toggleExpandedRow(
                          item.id
                        )
                      }
                      header={
                        <>
                          <Badge className="summary-badge rounded-pill px-3 py-2">
                            {
                              item.subjectName
                            }
                          </Badge>

                          <Badge className="summary-badge rounded-pill px-3 py-2">
                            {
                              item.category
                            }
                          </Badge>

                          <Badge
                            bg={
                              item.isCorrect
                                ? 'success'
                                : 'danger'
                            }
                            className="rounded-pill px-3 py-2"
                          >
                            {item.isCorrect
                              ? 'Correct'
                              : 'Incorrect'}
                          </Badge>
                        </>
                      }
                      details={
                        <div
                          style={{
                            color:
                              '#e2e8f0',
                            lineHeight:
                              1.6,
                          }}
                        >
                          <div className="mb-2">
                            <span
                              style={{
                                color:
                                  '#8a94a6',
                              }}
                            >
                              Source:
                            </span>{' '}
                            {
                              item.sourceLabel
                            }
                          </div>

                          <div className="mb-2">
                            <span
                              style={{
                                color:
                                  '#8a94a6',
                              }}
                            >
                              Selected
                              answer:
                            </span>{' '}
                            {
                              item.selectedOptionText
                            }
                          </div>

                          <div>
                            <span
                              style={{
                                color:
                                  '#8a94a6',
                              }}
                            >
                              Correct
                              answer:
                            </span>{' '}
                            {
                              item.correctOptionText
                            }
                          </div>
                        </div>
                      }
                      badge={null}
                    />
                  )
                }
              )}
          </div>
        </Card>
      </ResultsShell>
    ) : sessionState ===
        'results' &&
      mode === 'viva' &&
      vivaResults ? (
      <ResultsShell
        title="Viva Results"
        eyebrow="Practice Complete"
        onReset={resetToSetup}
        summaryCards={[
          {
            title:
              'Overall Performance',
            value:
              vivaResults.performanceLabel,
            subtitle:
              'Qualitative viva assessment',
            accent: true,
          },
          {
            title:
              'Strengths',
            value:
              vivaResults.strengths.length,
            subtitle:
              'Areas showing solid articulation',
          },
          {
            title:
              'Areas To Improve',
            value:
              vivaResults.areasToImprove.length,
            subtitle:
              'Focus points for the next session',
          },
          {
            title:
              'Time Elapsed',
            value:
              formatDuration(
                vivaResults.timeElapsedSeconds
              ),
            subtitle:
              'Total active viva time',
          },
        ]}
        footerNote={{
          left: 'Transcript entries expand to show the full examiner prompt and student response.',
          right: `${vivaResults.reviewedCount} exchanges reviewed`,
        }}
      >
        <Row className="g-3 mb-4">
          <Col lg={6}>
            <Card
              className="panel-surface h-100"
              body
              style={{
                padding: 18,
              }}
            >
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.14em',
                  color:
                    '#8a94a6',
                }}
              >
                Strengths
              </div>

              <ul
                className="m-0 ps-3"
                style={{
                  color:
                    '#e2e8f0',
                  lineHeight:
                    1.7,
                }}
              >
                {Array.isArray(
                  vivaResults.strengths
                ) &&
                  vivaResults.strengths.map(
                    (item) => (
                      <li
                        key={
                          item
                        }
                      >
                        {item}
                      </li>
                    )
                  )}
              </ul>
            </Card>
          </Col>

          <Col lg={6}>
            <Card
              className="panel-surface h-100"
              body
              style={{
                padding: 18,
              }}
            >
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.14em',
                  color:
                    '#8a94a6',
                }}
              >
                Areas To Improve
              </div>

              <ul
                className="m-0 ps-3"
                style={{
                  color:
                    '#e2e8f0',
                  lineHeight:
                    1.7,
                }}
              >
                {Array.isArray(
                  vivaResults.areasToImprove
                ) &&
                  vivaResults.areasToImprove.map(
                    (item) => (
                      <li
                        key={
                          item
                        }
                      >
                        {item}
                      </li>
                    )
                  )}
              </ul>
            </Card>
          </Col>
        </Row>

        <Card className="panel-surface p-4 p-xl-5">
          <div className="d-flex align-items-center justify-content-between gap-3 mb-4">
            <div>
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.16em',
                  color:
                    '#8a94a6',
                }}
              >
                Transcript Review
              </div>

              <h3
                className="m-0 fw-semibold"
                style={{
                  fontSize: 28,
                  color:
                    '#f8fafc',
                }}
              >
                Examiner and student
                exchanges
              </h3>
            </div>

            <Badge className="summary-badge rounded-pill px-3 py-2">
              Viva Mode
            </Badge>
          </div>

          <div className="d-flex flex-column gap-3">
            {Array.isArray(
              vivaResults.transcript
            ) &&
            vivaResults.transcript.length ? (
              vivaResults.transcript.map(
                (entry) => {
                  const expanded =
                    Boolean(
                      expandedRows[
                        entry.id
                      ]
                    )

                  return (
                    <div
                      key={
                        entry.id
                      }
                      className="review-row"
                    >
                      <button
                        type="button"
                        className="review-toggle w-100 border-0 bg-transparent text-start text-light p-3 p-md-4"
                        onClick={() =>
                          toggleExpandedRow(
                            entry.id
                          )
                        }
                        style={{
                          outline:
                            'none',
                        }}
                      >
                        <div className="d-flex align-items-start justify-content-between gap-3">
                          <div className="flex-grow-1">
                            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                              <Badge className="summary-badge rounded-pill px-3 py-2">
                                {
                                  entry.subjectName
                                }
                              </Badge>

                              <Badge className="summary-badge rounded-pill px-3 py-2">
                                {
                                  entry.category
                                }
                              </Badge>
                            </div>

                            <div
                              className="fw-semibold mb-2"
                              style={{
                                color:
                                  '#f8fafc',
                              }}
                            >
                              Examiner:{' '}
                              {
                                entry.examinerText
                              }
                            </div>

                            <div
                              style={{
                                color:
                                  '#8a94a6',
                              }}
                            >
                              Student:{' '}
                              {
                                entry.studentText
                              }
                            </div>
                          </div>

                          <i
                            className={`bi ${
                              expanded
                                ? 'bi-chevron-up'
                                : 'bi-chevron-down'
                            }`}
                            aria-hidden="true"
                            style={{
                              color:
                                '#8a94a6',
                              fontSize: 18,
                            }}
                          />
                        </div>
                      </button>

                      <Collapse
                        in={
                          expanded
                        }
                      >
                        <div>
                          <div className="px-3 px-md-4 pb-4 pt-0">
                            <hr className="soft-divider my-0 mb-3" />

                            <div
                              style={{
                                color:
                                  '#e2e8f0',
                                lineHeight:
                                  1.6,
                              }}
                            >
                              <div className="mb-2">
                                <span
                                  style={{
                                    color:
                                      '#8a94a6',
                                  }}
                                >
                                  Source:
                                </span>{' '}
                                {
                                  entry.sourceLabel
                                }
                              </div>

                              <div className="mb-2">
                                <span
                                  style={{
                                    color:
                                      '#8a94a6',
                                  }}
                                >
                                  Examiner
                                  prompt:
                                </span>{' '}
                                {
                                  entry.examinerText
                                }
                              </div>

                              <div>
                                <span
                                  style={{
                                    color:
                                      '#8a94a6',
                                  }}
                                >
                                  Student
                                  response:
                                </span>{' '}
                                {
                                  entry.studentText
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      </Collapse>
                    </div>
                  )
                }
              )
            ) : (
              <div
                className="panel-surface p-4 text-center"
                style={{
                  color:
                    '#8a94a6',
                }}
              >
                No transcript exchanges
                were recorded.
              </div>
            )}
          </div>
        </Card>
      </ResultsShell>
    ) : null

  return (
    <div className="test-page-shell">
      <style>
        {pageStyles}
      </style>

      <div className="page-frame">
        {sessionState ===
        'setup' ? (
          <div className="hero-shell p-4 p-xl-5 mb-4 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 gap-lg-4">
            <div>
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing:
                    '0.16em',
                  color:
                    '#8a94a6',
                }}
              >
                Digital Twin Practice
              </div>

              <h1
                className="m-0 fw-semibold"
                style={{
                  fontSize: 34,
                  color:
                    '#f8fafc',
                }}
              >
                Practice Flow
              </h1>
            </div>
          </div>
        ) : null}

        {sessionState ===
        'setup'
          ? setupView
          : null}

        {sessionState ===
        'quiz'
          ? quizView
          : null}

        {sessionState ===
        'viva' ? (
          <VivaRoom
            questions={
              questions
            }
            initialQuestionIndex={
              currentQuestionIndex
            }
            onComplete={
              handleVivaComplete
            }
          />
        ) : null}

        {resultsView}
      </div>
    </div>
  )
}