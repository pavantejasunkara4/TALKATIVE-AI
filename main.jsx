import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Languages,
  Mic2,
  MessageCircle,
  MicVocal,
  Sparkles,
  Users,
  Volume2,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const moods = [
  {
    id: "interview",
    icon: Mic2,
    title: "Interview",
    description: "Prepare, respond, and stay confident.",
    accent: "violet",
  },
  {
    id: "networking",
    icon: Users,
    title: "Networking",
    description: "Connect naturally and make an impression.",
    accent: "blue",
  },
  {
    id: "public_speaking",
    icon: Volume2,
    title: "Public Speaking",
    description: "Present clearly and keep your audience engaged.",
    accent: "pink",
  },
  {
    id: "language",
    icon: Languages,
    title: "Language Coach",
    description: "Practice conversations and improve fluency.",
    accent: "green",
  },
  {
    id: "professional",
    icon: BriefcaseBusiness,
    title: "Professional",
    description: "Navigate meetings and workplace communication.",
    accent: "orange",
  },
  {
    id: "social",
    icon: MessageCircle,
    title: "Social",
    description: "Keep everyday conversations flowing.",
    accent: "cyan",
  },
];

function App() {
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [starting, setStarting] = useState(false);

  const visibleMoods = showAll ? moods : moods.slice(0, 4);
  const selectedMood = moods.find((mood) => mood.id === selected);

  const startConversation = async () => {
    if (!selected || starting) return;

    setStarting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversation/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: selected,
        }),
      });

      if (!response.ok) {
        let message = `Backend request failed (${response.status})`;

        try {
          const errorData = await response.json();
          if (errorData?.detail) {
            message = errorData.detail;
          }
        } catch {
          // Keep the fallback message when the response is not JSON.
        }

        throw new Error(message);
      }

      const data = await response.json();

      // Keep the session information available for the next conversation screen.
      sessionStorage.setItem("talkative_session_id", data.session_id);
      sessionStorage.setItem("talkative_mode", data.mode);

      alert(data.greeting);
    } catch (error) {
      console.error("Unable to start Talkative AI:", error);

      alert(
        `Unable to connect to Talkative AI backend.\n\n${error.message}\n\nCheck that the backend is running and VITE_API_BASE_URL is correct.`
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="navbar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} strokeWidth={2.5} />
          </div>
          <span>talkative</span>
          <span className="brand-ai">AI</span>
        </div>

        <button className="profile-button" aria-label="Open profile">
          <span className="profile-avatar">P</span>
        </button>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          <span className="live-dot" />
          AI conversation companion
        </div>

        <h1>
          Different moods.
          <br />
          <span>Smarter conversations.</span>
        </h1>

        <p className="hero-copy">
          Choose how you want to communicate. Talkative adapts its guidance
          to your situation and helps you find the right words.
        </p>

        <div className="voice-pill">
          <div className="wave">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <span>Real-time conversation guidance</span>
          <MicVocal size={17} />
        </div>
      </section>

      <section className="mood-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">YOUR CONVERSATION MODE</p>
            <h2>What’s your mood?</h2>
          </div>
          <span className="mood-count">{moods.length} modes</span>
        </div>

        <div className="mood-grid">
          {visibleMoods.map((mood) => {
            const Icon = mood.icon;
            const isSelected = selected === mood.id;

            return (
              <button
                key={mood.id}
                className={`mood-card ${mood.accent} ${
                  isSelected ? "selected" : ""
                }`}
                onClick={() => setSelected(mood.id)}
              >
                <div className="card-top">
                  <div className="mood-icon">
                    <Icon size={22} strokeWidth={2} />
                  </div>
                  {isSelected && (
                    <span className="selected-badge">
                      <Check size={13} />
                    </span>
                  )}
                </div>

                <div className="card-content">
                  <h3>{mood.title}</h3>
                  <p>{mood.description}</p>
                </div>

                <span className="card-arrow">
                  <ArrowRight size={17} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="action-row">
          <button
            className="secondary-button"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show less" : "Explore all moods"}
            <ArrowRight size={16} />
          </button>

          <button
            className={`start-button ${selected ? "ready" : ""}`}
            disabled={!selected || starting}
            onClick={startConversation}
          >
            {starting
              ? "Connecting..."
              : selectedMood
              ? `Start ${selectedMood.title}`
              : "Select a mood to begin"}
            <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <footer>
        <span>Talkative AI</span>
        <span>Private by design · Your conversation, your control.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
