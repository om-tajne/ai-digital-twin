import { useEffect, useState } from 'react'
import { Badge, Button, Card, ProgressBar, Row, Col } from 'react-bootstrap'

export default function VivaRoom({
  questions = [],
  initialQuestionIndex = 0,
  onComplete,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex || 0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [answers, setAnswers] = useState([])

  const currentQuestion = questions[currentIndex] || null

  // Reset selected answer whenever question changes
  useEffect(() => {
    const existingAnswer = answers.find(
      (item) => item.questionId === currentQuestion?.id
    )

    setSelectedAnswer(existingAnswer?.selectedAnswer ?? null)
  }, [currentIndex, currentQuestion?.id])

  if (!currentQuestion) {
    return (
      <Card className="panel-surface p-5 text-center">
        <h4 style={{ color: '#f8fafc' }}>No Viva questions available</h4>
        <p style={{ color: '#8a94a6' }}>
          Please return to setup and generate the Viva questions again.
        </p>
      </Card>
    )
  }

  const progress = questions.length
    ? ((currentIndex + 1) / questions.length) * 100
    : 0

  /*
   * Different question generators may use different option formats.
   * This handles:
   *   ["A", "B", "C", "D"]
   *   [{text: "A"}, {text: "B"}, ...]
   *   [{option: "A"}, ...]
   */
  const getOptions = () => {
    const rawOptions =
      currentQuestion.options ||
      currentQuestion.choices ||
      currentQuestion.answers ||
      []

    return rawOptions.slice(0, 4).map((option, index) => {
      if (typeof option === 'string') {
        return {
          label: String.fromCharCode(65 + index),
          text: option,
          value: option,
        }
      }

      const text =
        option?.text ||
        option?.option ||
        option?.answer ||
        option?.value ||
        ''

      return {
        label:
          option?.label ||
          option?.key ||
          String.fromCharCode(65 + index),
        text,
        value: option?.value || text,
      }
    })
  }

  const options = getOptions()

  const selectAnswer = (option) => {
    setSelectedAnswer(option.value)

    setAnswers((previous) => {
      const filtered = previous.filter(
        (item) => item.questionId !== currentQuestion.id
      )

      return [
        ...filtered,
        {
          questionId: currentQuestion.id || currentIndex,
          question: currentQuestion.question,
          selectedAnswer: option.value,
          selectedOption: option.text,
          subjectName: currentQuestion.subjectName || 'General',
          category: currentQuestion.category || 'General',
          sourceLabel: currentQuestion.sourceLabel || 'Generated',
        },
      ]
    })
  }

  const nextQuestion = () => {
    if (selectedAnswer === null) return

    setCurrentIndex((previous) =>
      Math.min(questions.length - 1, previous + 1)
    )
  }

  const endViva = () => {
    onComplete?.(answers)
  }

  return (
    <div className="d-flex flex-column gap-4">
      {/* Header */}
      <div className="hero-shell p-4 p-xl-5 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <div
            className="text-uppercase small mb-2"
            style={{
              letterSpacing: '0.16em',
              color: '#8a94a6',
            }}
          >
            Viva Room
          </div>

          <h2
            className="m-0 fw-semibold"
            style={{
              fontSize: 34,
              color: '#f8fafc',
            }}
          >
            Question {currentIndex + 1} of {questions.length}
          </h2>
        </div>

        <Badge className="summary-badge rounded-pill px-3 py-2">
          <i className="bi bi-list-check me-2" />
          MCQ VIVA
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="panel-surface p-4 p-xl-5">
        <ProgressBar
          now={progress}
          style={{
            height: 10,
            backgroundColor: '#1E293B',
          }}
          className="mb-4"
        />

        <Row className="g-4">
          <Col lg={8}>
            <Card
              className="h-100"
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 22,
                padding: 24,
              }}
            >
              {/* Subject / Category */}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Badge className="summary-badge rounded-pill px-3 py-2">
                  {currentQuestion.subjectName || 'General'}
                </Badge>

                <Badge className="summary-badge rounded-pill px-3 py-2">
                  {currentQuestion.category || 'General'}
                </Badge>
              </div>

              {/* Question */}
              <div
                className="text-uppercase small mb-2"
                style={{
                  letterSpacing: '0.14em',
                  color: '#8a94a6',
                }}
              >
                Viva Question
              </div>

              <h3
                className="mb-4"
                style={{
                  fontSize: 27,
                  lineHeight: 1.4,
                  color: '#f8fafc',
                }}
              >
                {currentQuestion.question}
              </h3>

              {/* Options */}
              <div className="d-flex flex-column gap-3">
                {options.map((option, index) => {
                  const isSelected = selectedAnswer === option.value

                  return (
                    <button
                      key={`${option.label}-${index}`}
                      type="button"
                      onClick={() => selectAnswer(option)}
                      className="text-start"
                      style={{
                        width: '100%',
                        padding: '18px 20px',
                        borderRadius: 16,
                        border: isSelected
                          ? '2px solid #38bdf8'
                          : '1px solid #334155',
                        background: isSelected
                          ? 'rgba(56, 189, 248, 0.12)'
                          : '#1e293b',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 15,
                      }}
                    >
                      {/* Option Letter */}
                      <span
                        className="d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: '50%',
                          background: isSelected
                            ? '#38bdf8'
                            : '#334155',
                          color: isSelected ? '#0f172a' : '#f8fafc',
                          fontWeight: 700,
                          fontSize: 16,
                        }}
                      >
                        {option.label}
                      </span>

                      {/* Option Text */}
                      <span
                        style={{
                          fontSize: 16,
                          lineHeight: 1.5,
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {option.text}
                      </span>

                      {/* Selected Icon */}
                      {isSelected && (
                        <i
                          className="bi bi-check-circle-fill ms-auto"
                          style={{
                            color: '#38bdf8',
                            fontSize: 21,
                          }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* If options are missing */}
              {options.length < 4 && (
                <div className="alert alert-warning mt-4 mb-0">
                  <i className="bi bi-exclamation-triangle me-2" />
                  This question does not contain 4 options. Please regenerate
                  the Viva questions.
                </div>
              )}
            </Card>
          </Col>

          {/* Right Side */}
          <Col lg={4}>
            <Card
              className="h-100"
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 22,
                padding: 24,
              }}
            >
              <div className="text-center">
                <div
                  className="mx-auto mb-3 d-flex align-items-center justify-content-center"
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: '50%',
                    background:
                      'linear-gradient(180deg, #334155, #1e293b)',
                    border: '1px solid #475569',
                    color: '#7dd3fc',
                    fontSize: 38,
                  }}
                >
                  <i className="bi bi-person-video3" />
                </div>

                <h5 style={{ color: '#f8fafc' }}>
                  {selectedAnswer !== null ? 'Answer Selected' : 'Select an Answer'}
                </h5>

                <p
                  style={{
                    color: '#8a94a6',
                    fontSize: 13,
                  }}
                >
                  Choose one of the four options
                </p>
              </div>

              {/* Selected Answer Preview */}
              <div
                className="mt-3 rounded-4 p-3"
                style={{
                  minHeight: 130,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                }}
              >
                <div
                  className="small mb-2"
                  style={{ color: '#8a94a6' }}
                >
                  Your answer
                </div>

                {selectedAnswer !== null ? (
                  <div>
                    <div
                      className="mb-2"
                      style={{
                        color: '#38bdf8',
                        fontWeight: 600,
                      }}
                    >
                      Selected Option
                    </div>

                    <div style={{ color: '#f8fafc' }}>
                      {options.find(
                        (option) => option.value === selectedAnswer
                      )?.text || selectedAnswer}
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#64748b' }}>
                    No option selected yet.
                  </span>
                )}
              </div>

              {/* Progress Info */}
              <div className="mt-4">
                <div
                  className="d-flex justify-content-between small mb-2"
                  style={{ color: '#8a94a6' }}
                >
                  <span>Progress</span>
                  <span>
                    {currentIndex + 1}/{questions.length}
                  </span>
                </div>

                <ProgressBar
                  now={progress}
                  style={{
                    height: 7,
                    backgroundColor: '#1e293b',
                  }}
                />
              </div>
            </Card>
          </Col>
        </Row>

        {/* Bottom Controls */}
        <div
          className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center justify-content-between gap-3 mt-4 pt-4"
          style={{
            borderTop: '1px solid #262626',
          }}
        >
          <div style={{ color: '#8a94a6' }}>
            {answers.length} answer{answers.length === 1 ? '' : 's'} recorded
          </div>

          <div className="d-flex flex-wrap gap-2">
            {currentIndex < questions.length - 1 ? (
              <Button
                type="button"
                variant="primary"
                onClick={nextQuestion}
                disabled={selectedAnswer === null}
              >
                Next Question
                <i className="bi bi-arrow-right ms-2" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="success"
                onClick={endViva}
                disabled={selectedAnswer === null}
              >
                <i className="bi bi-check-circle me-2" />
                Finish Viva
              </Button>
            )}

            <Button
              type="button"
              variant="outline-danger"
              onClick={endViva}
            >
              <i className="bi bi-stop-circle me-2" />
              End Viva
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}