import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://talkative-ai-backend-11.onrender.com";

const moods = [
  {
    id: "interview",
    title: "Interview",
    description: "Practice answering interview questions with confidence.",
    icon: "💼",
  },
  {
    id: "networking",
    title: "Networking",
    description: "Build natural conversations and professional connections.",
    icon: "🤝",
  },
  {
    id: "public_speaking",
    title: "Public Speaking",
    description: "Improve clarity, confidence and presentation skills.",
    icon: "🎤",
  },
  {
    id: "language",
    title: "Language",
    description: "Practice everyday English conversations naturally.",
    icon: "🌎",
  },
  {
    id: "professional",
    title: "Professional",
    description: "Practice workplace conversations and communication.",
    icon: "🧑‍💻",
  },
  {
    id: "social",
    title: "Social",
    description: "Practice casual conversations and social situations.",
    icon: "💬",
  },
];

function App() {
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const [screen, setScreen] = useState("home");

  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const [sessionId, setSessionId] = useState(null);
  const [conversationMode, setConversationMode] = useState(null);

  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState("");

  const [latestGuidance, setLatestGuidance] = useState(null);

  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef(null);
  const sendMessageRef = useRef(null);
  const sendingRef = useRef(false);

  const sessionIdRef = useRef(null);
  const conversationModeRef = useRef(null);

  /*
   * This ref stores the latest speech transcript.
   * It prevents React state timing from causing the
   * microphone result to be lost before onend().
   */
  const transcriptRef = useRef("");

  /*
   * Prevents the same sentence from being submitted twice.
   */
  const submittedTranscriptRef = useRef("");

  const selectedMood = moods.find((mood) => mood.id === selected);

  /*
   * Keep refs synchronized with the current conversation.
   */
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  /*
   * Speech recognition setup.
   */
useEffect(() => {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setSpeechSupported(false);
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    setListening(true);
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      const result = event.results[i];

      if (result.isFinal) {
        finalText += result[0].transcript;
      } else {
        interimText += result[0].transcript;
      }
    }

    const finalMessage = finalText.trim();
    const interimMessage = interimText.trim();

    /*
     * Show speech immediately while the user is talking.
     */
    const visibleText =
      finalMessage || interimMessage;

    if (visibleText) {
      transcriptRef.current = visibleText;
      setTranscript(visibleText);
    }

    /*
     * Send the finalized sentence immediately.
     */
    if (
      finalMessage &&
      sendMessageRef.current &&
      !sendingRef.current &&
      finalMessage !== submittedTranscriptRef.current
    ) {
      submittedTranscriptRef.current = finalMessage;

      /*
       * Stop listening while the AI processes and speaks.
       */
      try {
        recognition.stop();
      } catch (error) {
        console.debug(
          "Recognition stop after final result:",
          error
        );
      }

      sendMessageRef.current(finalMessage);
    }
  };

  recognition.onerror = (event) => {
    console.error(
      "Speech recognition error:",
      event.error
    );

    setListening(false);
  };

  recognition.onend = () => {
    setListening(false);
  };

  recognitionRef.current = recognition;

  return () => {
    try {
      recognition.stop();
    } catch (error) {
      console.debug(
        "Recognition cleanup:",
        error
      );
    }

    recognitionRef.current = null;
  };
}, []);
  /*
   * Start a new AI conversation.
   */
  async function startConversation() {
    if (!selected || starting) {
      return;
    }

    setStarting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversation/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: selected,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Start conversation failed: ${response.status}`
        );
      }

      const data = await response.json();

      setSessionId(data.session_id);
      setConversationMode(data.mode);

      sessionIdRef.current = data.session_id;
      conversationModeRef.current = data.mode;

      sessionStorage.setItem(
        "talkative_session_id",
        data.session_id
      );

      sessionStorage.setItem(
        "talkative_mode",
        data.mode
      );

      const greeting = data.greeting || "Hello! Let's start talking.";

      setMessages([
        {
          role: "assistant",
          content: greeting,
        },
      ]);

      setLatestGuidance(null);
      sendingRef.current = false;
      setSending(false);
      setTranscript("");
      transcriptRef.current = "";
      submittedTranscriptRef.current = "";

      setScreen("conversation");

      speakText(greeting);
    } catch (error) {
      console.error("Start conversation error:", error);

      alert(
        "Unable to start the conversation. Please check that the backend is running."
      );
    } finally {
      setStarting(false);
    }
  }

  /*
   * Send user's message to FastAPI.
   */
  async function sendMessage(message) {
    const cleanMessage = String(message || "").trim();
    const activeSessionId = sessionIdRef.current;
    const activeMode = conversationModeRef.current;

    if (
      !cleanMessage ||
      sendingRef.current ||
      !activeSessionId ||
      !activeMode
    ) {
      return;
    }

    sendingRef.current = true;
    setSending(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversation/message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: activeSessionId,
            mode: activeMode,
            message: cleanMessage,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Message request failed: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();

      /*
       * Add user's message.
       */
      setMessages((previous) => [
        ...previous,
        {
          role: "user",
          content: cleanMessage,
        },
      ]);

      /*
       * Add AI response.
       */
      if (data.reply) {
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: data.reply,
          },
        ]);
      }

      /*
       * Store correction / suggestion / tip.
       */
      setLatestGuidance({
        correction: data.correction || null,
        suggestion: data.suggestion || null,
        tip: data.tip || null,
        stage: data.stage || "conversation",
      });

      /*
       * Clear current transcript.
       */
      setTranscript("");
      transcriptRef.current = "";

      /*
       * Speak the AI response.
       */
      if (data.reply) {
        speakText(data.reply);
      }
    } catch (error) {
      console.error("Send message error:", error);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            "I couldn't connect to the AI right now. Please try again.",
        },
      ]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  // Always expose the newest sendMessage implementation to the
  // long-lived speech-recognition event handlers.
  sendMessageRef.current = sendMessage;

  /*
   * Start microphone listening.
   */
  function toggleListening() {
    if (!speechSupported) {
      alert(
        "Speech recognition is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    if (!sessionIdRef.current || !conversationModeRef.current) {
      alert("Please start a conversation first.");
      return;
    }

    if (sendingRef.current) {
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    /*
     * Stop any current AI speech before listening.
     */
    window.speechSynthesis.cancel();
    setSpeaking(false);

    transcriptRef.current = "";
    submittedTranscriptRef.current = "";
    setTranscript("");

    try {
      recognitionRef.current?.start();
    } catch (error) {
      console.error("Microphone start error:", error);

      /*
       * Chrome can throw if recognition.start()
       * is called while recognition is already active.
       */
      setListening(false);
    }
  }

  /*
   * Browser text-to-speech.
   */
  function speakText(text) {
    if (!text || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setSpeaking(true);
    };

    utterance.onend = () => {
      setSpeaking(false);
    };

    utterance.onerror = () => {
      setSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  /*
   * Stop AI voice.
   */
  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  /*
   * End the current conversation.
   */
  async function endConversation() {
    if (!sessionIdRef.current || !conversationModeRef.current) {
      setScreen("home");
      return;
    }

    stopSpeaking();

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversation/end`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            mode: conversationModeRef.current,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();

        setLatestGuidance({
          summary: data.summary,
          strengths: data.strengths,
          improvements: data.improvements,
        });
      }
    } catch (error) {
      console.error("End conversation error:", error);
    }

    sessionStorage.removeItem("talkative_session_id");
    sessionStorage.removeItem("talkative_mode");

    setSessionId(null);
    setConversationMode(null);

    sessionIdRef.current = null;
    conversationModeRef.current = null;

    transcriptRef.current = "";
    submittedTranscriptRef.current = "";

    sendingRef.current = false;
    setSending(false);
    setTranscript("");
    setListening(false);
    setSpeaking(false);

    setScreen("home");
  }

  /*
   * Mouse-following background effect.
   */
  useEffect(() => {
    const handleMouseMove = (event) => {
      document.documentElement.style.setProperty(
        "--mouse-x",
        `${event.clientX}px`
      );

      document.documentElement.style.setProperty(
        "--mouse-y",
        `${event.clientY}px`
      );
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );
    };
  }, []);

  /*
   * CONVERSATION SCREEN
   */
  if (screen === "conversation") {
    return (
      <div className="app-shell conversation-shell">
        <div className="mouse-glow" />

        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">T</span>
            <span>Talkative AI</span>
          </div>

          <div className="conversation-mode">
            {selectedMood?.icon} {selectedMood?.title}
          </div>

          <button
            className="end-button"
            onClick={endConversation}
          >
            End
          </button>
        </header>

        <main className="conversation-page">
          <section className="conversation-main">
            <div className="conversation-header">
              <div>
                <p className="eyebrow">LIVE CONVERSATION</p>

                <h1>
                  Let's{" "}
                  <span className="gradient-text">
                    talk.
                  </span>
                </h1>

                <p className="conversation-subtitle">
                  Speak naturally. I'll listen, respond,
                  correct you and help you improve.
                </p>
              </div>

              {speaking && (
                <button
                  className="stop-speaking"
                  onClick={stopSpeaking}
                >
                  🔊 Stop AI voice
                </button>
              )}
            </div>

            <div className="chat-window">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`message-row ${message.role}`}
                >
                  <div className="message-avatar">
                    {message.role === "assistant"
                      ? "✦"
                      : "You"}
                  </div>

                  <div className="message-bubble">
                    {message.content}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="message-row assistant">
                  <div className="message-avatar">
                    ✦
                  </div>

                  <div className="message-bubble typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>

            <div className="voice-area">
            <button
  onClick={() => {
    alert("BUTTON CLICKED");
    sendMessage("Tell me about yourself.");
  }}
  disabled={sending}
  style={{
    marginTop: "12px",
    padding: "10px 18px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
  }}
>
  TEST AI RESPONSE
</button>
              {transcript && (
                <div className="live-transcript">
                  <span>You're saying:</span>
                  <strong>{transcript}</strong>
                </div>
              )}

              <button
                className={`microphone-button ${
                  listening ? "listening" : ""
                }`}
                onClick={toggleListening}
                disabled={sending}
                aria-label={
                  listening
                    ? "Stop listening"
                    : "Start listening"
                }
              >
                <span className="mic-icon">
                  {listening ? "■" : "🎙️"}
                </span>
              </button>

              <p className="voice-status">
                {sending
                  ? "Thinking..."
                  : listening
                  ? "Listening..."
                  : speaking
                  ? "AI is speaking..."
                  : "Tap the microphone and speak"}
              </p>
            </div>
          </section>

          <aside className="guidance-panel">
            <div className="panel-heading">
              <span className="panel-icon">✦</span>

              <div>
                <p className="eyebrow">AI COACH</p>
                <h2>Live guidance</h2>
              </div>
            </div>

            {!latestGuidance && (
              <div className="empty-guidance">
                <div className="empty-icon">◎</div>

                <p>
                  Your communication feedback will
                  appear here while you talk.
                </p>
              </div>
            )}

            {latestGuidance?.correction && (
              <div className="guidance-card correction">
                <span className="guidance-label">
                  CORRECTION
                </span>

                <p>
                  {latestGuidance.correction}
                </p>
              </div>
            )}

            {latestGuidance?.suggestion && (
              <div className="guidance-card suggestion">
                <span className="guidance-label">
                  SUGGESTION
                </span>

                <p>
                  {latestGuidance.suggestion}
                </p>
              </div>
            )}

            {latestGuidance?.tip && (
              <div className="guidance-card tip">
                <span className="guidance-label">
                  QUICK TIP
                </span>

                <p>{latestGuidance.tip}</p>
              </div>
            )}
          </aside>
        </main>
      </div>
    );
  }

  /*
   * HOME / MOOD SELECTION SCREEN
   */
  const visibleMoods = showAll
    ? moods
    : moods.slice(0, 3);

  return (
    <div className="app-shell">
      <div className="mouse-glow" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>Talkative AI</span>
        </div>

        <div className="topbar-status">
          <span className="status-dot" />
          AI conversation coach
        </div>
      </header>

      <main className="home-page">
        <section className="hero">
          <p className="eyebrow">
            YOUR AI CONVERSATION COACH
          </p>

          <h1>
            Speak with{" "}
            <span className="gradient-text">
              confidence.
            </span>
          </h1>

          <p className="hero-description">
            Practice real conversations with an AI that
            listens, responds and helps you communicate
            better in real time.
          </p>
        </section>

        <section className="mood-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CHOOSE YOUR SPACE</p>

              <h2>
                What would you like to practice?
              </h2>
            </div>
          </div>

          <div className="mood-grid">
            {visibleMoods.map((mood) => (
              <button
                key={mood.id}
                className={`mood-card ${
                  selected === mood.id ? "selected" : ""
                }`}
                onClick={() => setSelected(mood.id)}
              >
                <span className="mood-icon">
                  {mood.icon}
                </span>

                <span className="mood-title">
                  {mood.title}
                </span>

                <span className="mood-description">
                  {mood.description}
                </span>

                {selected === mood.id && (
                  <span className="selected-indicator">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            className="show-more"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show less" : "Explore all modes"}
            <span>{showAll ? "↑" : "→"}</span>
          </button>
        </section>

        <section className="start-section">
          <button
            className="start-button"
            onClick={startConversation}
            disabled={!selected || starting}
          >
            {starting
              ? "Starting..."
              : selectedMood
              ? `Start ${selectedMood.title}`
              : "Choose a conversation"}
            <span className="start-arrow">→</span>
          </button>

          <p className="start-hint">
            🎙️ Voice-first conversation · AI-powered
            feedback
          </p>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
