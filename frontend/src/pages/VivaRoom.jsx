import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Col, ProgressBar, Row } from 'react-bootstrap'
import { practiceQuestionBank } from '../data/mockData.js'

export default function VivaRoom({ questions = practiceQuestionBank.slice(0, 5), initialQuestionIndex = 0, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex || 0)
  const [voiceState, setVoiceState] = useState('idle')
  const [transcript, setTranscript] = useState([])
  const [liveAnswer, setLiveAnswer] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [voices, setVoices] = useState([])
  const recognitionRef = useRef(null)

  const currentQuestion = questions[currentIndex] || null

  useEffect(() => {
    if (!('speechSynthesis' in window)) return

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices())
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.onvoiceschanged = null
      window.speechSynthesis.cancel()
    }
  }, [])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.()
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const getVoice = () => {
    const englishVoices = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith('en')
    )

    return (
      englishVoices.find((voice) =>
        /google|natural|microsoft|samantha|zira|david/i.test(voice.name)
      ) || englishVoices[0] || voices[0] || null
    )
  }

  const speakQuestion = () => {
    if (!currentQuestion?.question) return

    if (!('speechSynthesis' in window)) {
      setVoiceError('Voice playback is not supported in this browser.')
      return
    }

    window.speechSynthesis.cancel()
    setVoiceError('')
    setVoiceState('speaking')

    const utterance = new SpeechSynthesisUtterance(currentQuestion.question)
    utterance.lang = 'en-US'
    utterance.rate = 0.92
    utterance.pitch = 1
    utterance.volume = 1

    const voice = getVoice()
    if (voice) utterance.voice = voice

    utterance.onstart = () => {
      console.log('🔊 TTS STARTED')
      setVoiceState('speaking')
    }

    utterance.onend = () => {
      console.log('🔊 TTS ENDED')
      setVoiceState('ready')
    }

    utterance.onerror = (event) => {
      console.error('❌ TTS ERROR:', event)
      setVoiceState('ready')
      setVoiceError('Voice could not be played. Click Hear Question again.')
    }

    window.speechSynthesis.resume()
    window.speechSynthesis.speak(utterance)
  }

  const startAnswer = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceError(
        'Speech recognition is not supported here. Please use Google Chrome on desktop.'
      )
      return
    }

    if (!currentQuestion) return

    setVoiceError('')
    setLiveAnswer('')
    setVoiceState('listening')

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript || ''
        if (event.results[i].isFinal) {
          finalText += text
        } else {
          interimText += text
        }
      }

      setLiveAnswer((previous) => {
        const combined = `${previous} ${finalText}`.trim()
        return `${combined} ${interimText}`.trim()
      })
    }

    recognition.onerror = (event) => {
      console.error('❌ STT ERROR:', event)
      setVoiceState('ready')
      setVoiceError(
        event.error === 'not-allowed'
          ? 'Microphone permission was blocked. Allow microphone access in Chrome.'
          : 'Could not hear the answer. Please try again.'
      )
    }

    recognition.onend = () => {
      setVoiceState((previous) =>
        previous === 'listening' ? 'ready' : previous
      )
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopAnswer = () => {
    recognitionRef.current?.stop?.()
    setVoiceState('ready')
  }

  const saveCurrentAnswer = () => {
    const answer = liveAnswer.trim()

    if (!currentQuestion) return

    const entry = {
      id: `${currentQuestion.id || currentIndex}-${Date.now()}`,
      questionPreview: currentQuestion.question,
      examinerText: currentQuestion.question,
      studentText: answer || 'Student response recorded.',
      subjectName: currentQuestion.subjectName || 'General',
      category: currentQuestion.category || 'General',
      sourceLabel: currentQuestion.sourceLabel || 'Generated',
    }

    setTranscript((previous) => {
      const withoutCurrent = previous.filter(
        (item) => item.questionPreview !== currentQuestion.question
      )
      return [...withoutCurrent, entry]
    })

    setLiveAnswer('')
    setVoiceState('ready')
  }

  const nextQuestion = () => {
    if (!currentQuestion) return

    recognitionRef.current?.stop?.()

    const answer = liveAnswer.trim()
    const existingEntry = transcript.find(
      (item) => item.questionPreview === currentQuestion.question
    )

    if (answer || !existingEntry) {
      const entry = {
        id: `${currentQuestion.id || currentIndex}-${Date.now()}`,
        questionPreview: currentQuestion.question,
        examinerText: currentQuestion.question,
        studentText: answer || 'Student response recorded.',
        subjectName: currentQuestion.subjectName || 'General',
        category: currentQuestion.category || 'General',
        sourceLabel: currentQuestion.sourceLabel || 'Generated',
      }

      setTranscript((previous) => [
        ...previous.filter(
          (item) => item.questionPreview !== currentQuestion.question
        ),
        entry,
      ])
    }

    setLiveAnswer('')
    setCurrentIndex((previous) => Math.min(questions.length - 1, previous + 1))
    setVoiceState('idle')
    setVoiceError('')
  }

  const endViva = () => {
    recognitionRef.current?.stop?.()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()

    const currentAlreadyAnswered = transcript.some(
      (item) => item.questionPreview === currentQuestion?.question
    )

    let finalTranscript = transcript

    if (currentQuestion && (liveAnswer.trim() || !currentAlreadyAnswered)) {
      finalTranscript = [
        ...transcript.filter(
          (item) => item.questionPreview !== currentQuestion.question
        ),
        {
          id: `${currentQuestion.id || currentIndex}-${Date.now()}`,
          questionPreview: currentQuestion.question,
          examinerText: currentQuestion.question,
          studentText: liveAnswer.trim() || 'Student response recorded.',
          subjectName: currentQuestion.subjectName || 'General',
          category: currentQuestion.category || 'General',
          sourceLabel: currentQuestion.sourceLabel || 'Generated',
        },
      ]
    }

    onComplete?.(finalTranscript)
  }

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

  return (
    <div className="d-flex flex-column gap-4">
      <div className="hero-shell p-4 p-xl-5 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <div
            className="text-uppercase small mb-2"
            style={{ letterSpacing: '0.16em', color: '#8a94a6' }}
          >
            Live Viva Room
          </div>
          <h2 className="m-0 fw-semibold" style={{ fontSize: 34, color: '#f8fafc' }}>
            Question {currentIndex + 1} of {questions.length}
          </h2>
        </div>
        <Badge className="summary-badge rounded-pill px-3 py-2">
          <i className="bi bi-mic-fill me-2" />
          LIVE VOICE
        </Badge>
      </div>

      <Card className="panel-surface p-4 p-xl-5">
        <ProgressBar
          now={progress}
          style={{ height: 10, backgroundColor: '#1E293B' }}
          className="mb-4"
        />

        <Row className="g-4 align-items-stretch">
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
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Badge className="summary-badge rounded-pill px-3 py-2">
                  {currentQuestion.subjectName || 'General'}
                </Badge>
                <Badge className="summary-badge rounded-pill px-3 py-2">
                  {currentQuestion.category || 'General'}
                </Badge>
              </div>

              <div
                className="text-uppercase small mb-2"
                style={{ letterSpacing: '0.14em', color: '#8a94a6' }}
              >
                Examiner Question
              </div>

              <h3
                className="mb-4"
                style={{ fontSize: 27, lineHeight: 1.4, color: '#f8fafc' }}
              >
                {currentQuestion.question}
              </h3>

              <div
                className="rounded-4 p-3 mb-4"
                style={{ background: '#1e293b', color: '#94a3b8' }}
              >
                <i className="bi bi-info-circle me-2" />
                {voiceState === 'speaking'
                  ? 'Examiner is speaking...'
                  : voiceState === 'listening'
                    ? 'Listening to your answer...'
                    : 'Hear the question, then start your answer.'}
              </div>

              <div className="d-flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline-info"
                  onClick={speakQuestion}
                  disabled={voiceState === 'speaking'}
                >
                  <i className="bi bi-volume-up-fill me-2" />
                  Hear Question
                </Button>

                {voiceState === 'listening' ? (
                  <Button type="button" variant="danger" onClick={stopAnswer}>
                    <i className="bi bi-stop-fill me-2" />
                    Stop Answer
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={startAnswer}
                    disabled={voiceState === 'speaking'}
                  >
                    <i className="bi bi-mic-fill me-2" />
                    Start Answer
                  </Button>
                )}
              </div>
            </Card>
          </Col>

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
                      voiceState === 'listening'
                        ? 'rgba(56,189,248,0.18)'
                        : 'linear-gradient(180deg, #334155, #1e293b)',
                    border: '1px solid #475569',
                    color: '#7dd3fc',
                    fontSize: 38,
                  }}
                >
                  <i
                    className={
                      voiceState === 'listening'
                        ? 'bi bi-mic-fill'
                        : 'bi bi-person-video3'
                    }
                  />
                </div>

                <h5 style={{ color: '#f8fafc' }}>
                  {voiceState === 'listening'
                    ? 'Listening...'
                    : voiceState === 'speaking'
                      ? 'Speaking...'
                      : 'Ready'}
                </h5>

                <p style={{ color: '#8a94a6', fontSize: 13 }}>
                  Browser voice mode
                </p>
              </div>

              <div
                className="mt-3 rounded-4 p-3"
                style={{
                  minHeight: 130,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                }}
              >
                <div className="small mb-2" style={{ color: '#8a94a6' }}>
                  Your answer
                </div>
                {liveAnswer || 'Your spoken answer will appear here...'}
              </div>
            </Card>
          </Col>
        </Row>

        {voiceError ? (
          <div className="alert alert-warning mt-4 mb-0" role="alert">
            <i className="bi bi-exclamation-triangle me-2" />
            {voiceError}
          </div>
        ) : null}

        <div
          className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center justify-content-between gap-3 mt-4 pt-4"
          style={{ borderTop: '1px solid #262626' }}
        >
          <div style={{ color: '#8a94a6' }}>
            {transcript.length} answer{transcript.length === 1 ? '' : 's'} recorded
          </div>

          <div className="d-flex flex-wrap gap-2">
            {currentIndex < questions.length - 1 ? (
              <Button type="button" variant="primary" onClick={nextQuestion}>
                Next Question
                <i className="bi bi-arrow-right ms-2" />
              </Button>
            ) : null}

            <Button type="button" variant="outline-danger" onClick={endViva}>
              <i className="bi bi-stop-circle me-2" />
              End Viva
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
