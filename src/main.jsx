
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
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
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyBusyId, setHistoryBusyId] = useState(null);
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
  const transcriptRef = useRef("");
  const submittedTranscriptRef = useRef("");
  const conversationActiveRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const speechRestartTimerRef = useRef(null);
  const mouseGlowRef = useRef(null);
  const messagesRef = useRef([]);
  const savedSessionIdsRef = useRef(new Set());

  const selectedMood = moods.find((mood) => mood.id === selected);

  // Authentication: run on every render in the same hook order.
  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        if (mounted) {
          setCurrentUser(data.user ?? null);
        }
      } catch (error) {
        console.error("Supabase user lookup:", error);

        if (mounted) {
          setCurrentUser(null);
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setCurrentUser(session?.user ?? null);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Keep messages and conversation refs synchronized.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  // Mouse-follow glow.
  useEffect(() => {
    const handleMouseMove = (event) => {
      const glow = mouseGlowRef.current;
      if (!glow) return;

      glow.style.left = `${event.clientX}px`;
      glow.style.top = `${event.clientY}px`;
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Browser speech recognition setup.
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

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
      recognitionActiveRef.current = true;
      setListening(true);
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      const finalMessage = finalText.trim();
      const interimMessage = interimText.trim();
      const visibleText = finalMessage || interimMessage;

      if (visibleText) {
        transcriptRef.current = visibleText;
        setTranscript(visibleText);
      }

      if (
        finalMessage &&
        sendMessageRef.current &&
        !sendingRef.current &&
        finalMessage !== submittedTranscriptRef.current
      ) {
        submittedTranscriptRef.current = finalMessage;

        try {
          recognition.stop();
        } catch (error) {
          console.debug("Recognition stop:", error);
        }

        sendMessageRef.current(finalMessage);
      }
    };

    recognition.onerror = (event) => {
      recognitionActiveRef.current = false;
      setListening(false);
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      recognitionActiveRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch (error) {
        console.debug("Recognition cleanup:", error);
      }

      recognitionRef.current = null;
      recognitionActiveRef.current = false;
    };
  }, []);

  // Speak AI responses, then resume listening.
  function speakText(text) {
    if (!text || !("speechSynthesis" in window)) return;

    if (speechRestartTimerRef.current) {
      clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setSpeaking(true);

      if (recognitionActiveRef.current) {
        recognitionRef.current?.stop();
      }

      setListening(false);
    };

    const restartListening = () => {
      setSpeaking(false);

      if (speechRestartTimerRef.current) {
        clearTimeout(speechRestartTimerRef.current);
      }

      speechRestartTimerRef.current = setTimeout(() => {
        speechRestartTimerRef.current = null;

        if (conversationActiveRef.current && !sendingRef.current) {
          startListening();
        }
      }, 350);
    };

    utterance.onend = restartListening;
    utterance.onerror = restartListening;

    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    if (
      !speechSupported ||
      !conversationActiveRef.current ||
      !sessionIdRef.current ||
      !conversationModeRef.current ||
      sendingRef.current ||
      !recognitionRef.current ||
      recognitionActiveRef.current
    ) {
      return;
    }

    transcriptRef.current = "";
    submittedTranscriptRef.current = "";
    setTranscript("");

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.debug("Microphone start error:", error);
      recognitionActiveRef.current = false;
      setListening(false);
    }
  }

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

    if (sendingRef.current) return;

    if (recognitionActiveRef.current || listening) {
      recognitionRef.current?.stop();
      recognitionActiveRef.current = false;
      setListening(false);
      return;
    }

    window.speechSynthesis.cancel();
    setSpeaking(false);
    startListening();
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeaking(false);

    if (conversationActiveRef.current && !sendingRef.current) {
      startListening();
    }
  }

  // Start a new backend conversation.
  async function startConversation() {
    if (!selected || starting) return;

    setStarting(true);
    conversationActiveRef.current = false;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversation/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: selected }),
        }
      );

      if (!response.ok) {
        throw new Error(`Start conversation failed: ${response.status}`);
      }

      const data = await response.json();

      setSessionId(data.session_id);
      setConversationMode(data.mode);
      sessionIdRef.current = data.session_id;
      conversationModeRef.current = data.mode;

      sessionStorage.setItem("talkative_session_id", data.session_id);
      sessionStorage.setItem("talkative_mode", data.mode);

      const greeting = data.greeting || "Hello! Let's start talking.";
      const initialMessages = [
        { role: "assistant", content: greeting },
      ];

      messagesRef.current = initialMessages;
      setMessages(initialMessages);
      setLatestGuidance(null);
      sendingRef.current = false;
      setSending(false);
      transcriptRef.current = "";
      submittedTranscriptRef.current = "";
      setTranscript("");
      setScreen("conversation");
      conversationActiveRef.current = true;

      speakText(greeting);
    } catch (error) {
      console.error("Start conversation error:", error);
      alert(
        "Unable to start the conversation. Please check your backend connection and try again."
      );
    } finally {
      setStarting(false);
    }
  }

  // Send a message to FastAPI.
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
          headers: { "Content-Type": "application/json" },
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

      const nextMessages = [
        ...messagesRef.current,
        { role: "user", content: cleanMessage },
        ...(data.reply
          ? [{ role: "assistant", content: data.reply }]
          : []),
      ];

      messagesRef.current = nextMessages;
      setMessages(nextMessages);

      setLatestGuidance({
        correction: data.correction || null,
        suggestion: data.suggestion || null,
        tip: data.tip || null,
        stage: data.stage || "conversation",
      });

      transcriptRef.current = "";
      setTranscript("");

      if (data.reply) speakText(data.reply);
    } catch (error) {
      console.error("Send message error:", error);

      const errorMessages = [
        ...messagesRef.current,
        {
          role: "assistant",
          content: "I couldn't connect to the AI right now. Please try again.",
        },
      ];

      messagesRef.current = errorMessages;
      setMessages(errorMessages);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  // Give long-lived speech handlers the latest send function.
  sendMessageRef.current = sendMessage;

  // End the session and save its transcript.
  async function endConversation() {
    const activeSessionId = sessionIdRef.current;
    const activeMode = conversationModeRef.current;

    conversationActiveRef.current = false;

    if (speechRestartTimerRef.current) {
      clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }

    window.speechSynthesis.cancel();
    setSpeaking(false);

    try {
      recognitionRef.current?.stop();
    } catch (error) {
      console.debug("Recognition stop on end:", error);
    }

    recognitionActiveRef.current = false;
    setListening(false);

    if (activeSessionId && activeMode) {
      if (!savedSessionIdsRef.current.has(activeSessionId)) {
        try {
          const transcriptMessages = messagesRef.current || [];

          if (transcriptMessages.length > 0 && currentUser) {
            const firstUserMessage = transcriptMessages.find(
              (item) => item.role === "user" && item.content
            );

            const modeTitle =
              moods.find((item) => item.id === activeMode)?.title ||
              activeMode;

            const title = firstUserMessage
              ? `${modeTitle}: ${String(firstUserMessage.content)
                  .trim()
                  .slice(0, 70)}`
              : `${modeTitle} conversation`;

            const { error: saveError } = await supabase
              .from("conversation_history")
              .insert({
                user_id: currentUser.id,
                session_id: activeSessionId,
                mode: activeMode,
                title,
                messages: transcriptMessages,
                ended_at: new Date().toISOString(),
              });

            if (saveError) throw saveError;

            savedSessionIdsRef.current.add(activeSessionId);
          } else if (!currentUser) {
            alert(
              "You need to sign in to save conversation history. This conversation will end without being saved."
            );
          }
        } catch (error) {
          console.error("Save conversation history error:", error);
          alert(
            "Your conversation ended, but its history could not be saved. Please check your connection and Supabase setup."
          );
        }
      }

      try {
        await fetch(`${API_BASE_URL}/api/conversation/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSessionId,
            mode: activeMode,
          }),
        });
      } catch (error) {
        console.error("End conversation error:", error);
      }
    }

    sessionStorage.removeItem("talkative_session_id");
    sessionStorage.removeItem("talkative_mode");

    setSessionId(null);
    setConversationMode(null);
    setMessages([]);
    messagesRef.current = [];
    setTranscript("");
    transcriptRef.current = "";
    submittedTranscriptRef.current = "";
    setLatestGuidance(null);
    setSending(false);
    sendingRef.current = false;
    setScreen("home");

    sessionIdRef.current = null;
    conversationModeRef.current = null;
  }

  // Load only the signed-in user's history.
  async function loadHistory() {
    if (!currentUser) {
      setHistoryError("Please sign in to view your saved conversations.");
      setHistoryItems([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");
    setSelectedHistory(null);

    try {
      const { data, error } = await supabase
        .from("conversation_history")
        .select(
          "id, session_id, mode, title, messages, created_at, ended_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      setHistoryItems(data || []);
    } catch (error) {
      console.error("Load conversation history error:", error);
      setHistoryError(
        "Couldn't load your history. Check the Supabase table and Row Level Security policies, then try again."
      );
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteHistoryItem(item) {
    const confirmed = window.confirm(
      `Delete "${item.title || "this conversation"}" from your history? This cannot be undone.`
    );

    if (!confirmed) return;

    setHistoryBusyId(item.id);

    try {
      const { error } = await supabase
        .from("conversation_history")
        .delete()
        .eq("id", item.id);

      if (error) throw error;

      setHistoryItems((items) =>
        items.filter((entry) => entry.id !== item.id)
      );

      if (selectedHistory?.id === item.id) {
        setSelectedHistory(null);
      }
    } catch (error) {
      console.error("Delete conversation history error:", error);
      alert("Couldn't delete this conversation. Please try again.");
    } finally {
      setHistoryBusyId(null);
    }
  }

  function openHistory() {
    setScreen("history");
    loadHistory();
  }

  function returnHome() {
    setSelectedHistory(null);
    setScreen("home");
  }

  // Clean up speech playback and timers when the component unmounts.
  useEffect(() => {
    return () => {
      if (speechRestartTimerRef.current) {
        clearTimeout(speechRestartTimerRef.current);
      }

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // These render guards are after every hook.
  if (authLoading) {
    return <div className="auth-loading">Loading Talkative AI...</div>;
  }

  if (!currentUser) {
    return (
      <Auth
        onAuthenticated={(session) => {
          setCurrentUser(session?.user ?? null);
        }}
      />
    );
  }

  // Saved conversation history screen.
  if (screen === "history") {
    return (
      <div className="app-shell">
        <div ref={mouseGlowRef} className="mouse-glow" />

        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">T</span>
            <span>Talkative AI</span>
          </div>

          <div className="history-actions">
            <button className="history-button" onClick={returnHome}>
              ← Back to home
            </button>
            <button
              className="history-button"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              ↻ Refresh
            </button>
            <button
              className="history-button"
              onClick={async () => {
                await supabase.auth.signOut();
                setCurrentUser(null);
                setHistoryItems([]);
                setScreen("home");
              }}
            >
              Log out
            </button>
          </div>
        </header>

        <main className="home-page history-section">
          <div className="history-heading">
            <div>
              <p className="eyebrow">YOUR PROGRESS</p>
              <h1>
                Conversation <span className="gradient-text">history.</span>
              </h1>
              <p>
                Review previous practice sessions and the conversations you
                completed.
              </p>
            </div>
          </div>

          {historyLoading && (
            <div className="history-empty">
              Loading your saved conversations…
            </div>
          )}

          {!historyLoading && historyError && (
            <div className="history-error">{historyError}</div>
          )}

          {!historyLoading &&
            !historyError &&
            historyItems.length === 0 && (
              <div className="history-empty">
                <h3>No saved conversations yet</h3>
                <p>
                  Complete a practice conversation and press End to save its
                  transcript here.
                </p>
              </div>
            )}

          {!historyLoading &&
            !historyError &&
            historyItems.length > 0 && (
              <div className="history-list">
                {historyItems.map((item) => {
                  const modeTitle =
                    moods.find((mood) => mood.id === item.mode)?.title ||
                    item.mode;

                  const itemMessages = Array.isArray(item.messages)
                    ? item.messages
                    : [];

                  const preview =
                    itemMessages.find((message) => message.role === "user")
                      ?.content || "No user messages in this session.";

                  return (
                    <article className="history-card" key={item.id}>
                      <h3>{item.title || `${modeTitle} conversation`}</h3>

                      <div className="history-meta">
                        <div>Mode: {modeTitle}</div>
                        <div>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : "Date unavailable"}
                        </div>
                        <div>{itemMessages.length} messages</div>
                      </div>

                      <p className="history-preview">
                        {String(preview).slice(0, 180)}
                        {String(preview).length > 180 ? "…" : ""}
                      </p>

                      <div className="history-card-actions">
                        <button
                          className="history-button"
                          onClick={() => setSelectedHistory(item)}
                        >
                          View transcript
                        </button>

                        <button
                          className="history-button"
                          onClick={() => deleteHistoryItem(item)}
                          disabled={historyBusyId === item.id}
                        >
                          {historyBusyId === item.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

          {selectedHistory && (
            <section className="history-detail">
              <div className="history-heading">
                <div>
                  <p className="eyebrow">SAVED TRANSCRIPT</p>
                  <h2>
                    {selectedHistory.title || "Conversation transcript"}
                  </h2>
                  <p className="history-meta">
                    Read-only transcript ·{" "}
                    {selectedHistory.created_at
                      ? new Date(selectedHistory.created_at).toLocaleString()
                      : "Date unavailable"}
                  </p>
                </div>

                <button
                  className="history-button"
                  onClick={() => setSelectedHistory(null)}
                >
                  Close transcript
                </button>
              </div>

              <div className="chat-window">
                {(Array.isArray(selectedHistory.messages)
                  ? selectedHistory.messages
                  : []
                ).map((message, index) => (
                  <div
                    className={`message-row ${
                      message.role === "user" ? "user" : "assistant"
                    }`}
                    key={`${selectedHistory.id}-${index}`}
                  >
                    <div className="message-avatar">
                      {message.role === "assistant" ? "✦" : "You"}
                    </div>
                    <div className="message-bubble">
                      {message.content || ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    );
  }

  // Live conversation screen.
  if (screen === "conversation") {
    return (
      <div className="app-shell conversation-shell">
        <div ref={mouseGlowRef} className="mouse-glow" />

        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">T</span>
            <span>Talkative AI</span>
          </div>

          <div className="conversation-mode">
            {selectedMood?.icon} {selectedMood?.title}
          </div>

          <button className="end-button" onClick={endConversation}>
            End
          </button>
        </header>

        <main className="conversation-page">
          <section className="conversation-main">
            <div className="conversation-header">
              <div>
                <p className="eyebrow">LIVE CONVERSATION</p>
                <h1>
                  Let's <span className="gradient-text">talk.</span>
                </h1>
                <p className="conversation-subtitle">
                  Speak naturally. I'll listen, respond, correct you and help
                  you improve.
                </p>
              </div>

              {speaking && (
                <button className="stop-speaking" onClick={stopSpeaking}>
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
                    {message.role === "assistant" ? "✦" : "You"}
                  </div>
                  <div className="message-bubble">{message.content}</div>
                </div>
              ))}

              {sending && (
                <div className="message-row assistant">
                  <div className="message-avatar">✦</div>
                  <div className="message-bubble typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>

            <div className="voice-area">
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
                aria-label={listening ? "Stop listening" : "Start listening"}
              >
                <span className="mic-icon">{listening ? "■" : "🎙️"}</span>
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
                  Your communication feedback will appear here while you talk.
                </p>
              </div>
            )}

            {latestGuidance?.correction && (
              <div className="guidance-card correction">
                <span className="guidance-label">CORRECTION</span>
                <p>{latestGuidance.correction}</p>
              </div>
            )}

            {latestGuidance?.suggestion && (
              <div className="guidance-card suggestion">
                <span className="guidance-label">SUGGESTION</span>
                <p>{latestGuidance.suggestion}</p>
              </div>
            )}

            {latestGuidance?.tip && (
              <div className="guidance-card tip">
                <span className="guidance-label">QUICK TIP</span>
                <p>{latestGuidance.tip}</p>
              </div>
            )}
          </aside>
        </main>
      </div>
    );
  }

  // Home and mood selection screen.
  const visibleMoods = showAll ? moods : moods.slice(0, 3);

  return (
    <div className="app-shell">
      <div ref={mouseGlowRef} className="mouse-glow" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>Talkative AI</span>
        </div>

        <div className="history-actions">
          <div className="topbar-status">
            <span className="status-dot" />
            AI conversation coach
          </div>

          <button className="history-button" onClick={openHistory}>
            History
          </button>

          <button
            className="history-button"
            onClick={async () => {
              await supabase.auth.signOut();
              setCurrentUser(null);
              setHistoryItems([]);
              setScreen("home");
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="home-page">
        <section className="hero">
          <p className="eyebrow">YOUR AI CONVERSATION COACH</p>
          <h1>
            Speak with <span className="gradient-text">confidence.</span>
          </h1>
          <p className="hero-description">
            Practice real conversations with an AI that listens, responds and
            helps you communicate better in real time.
          </p>
        </section>

        <section className="mood-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CHOOSE YOUR SPACE</p>
              <h2>What would you like to practice?</h2>
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
                <span className="mood-icon">{mood.icon}</span>
                <span className="mood-title">{mood.title}</span>
                <span className="mood-description">{mood.description}</span>

                {selected === mood.id && (
                  <span className="selected-indicator">✓</span>
                )}
              </button>
            ))}
          </div>

          <button className="show-more" onClick={() => setShowAll(!showAll)}>
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
            🎙️ Voice-first conversation · AI-powered feedback
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
