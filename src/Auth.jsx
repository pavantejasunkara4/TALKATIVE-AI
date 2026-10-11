
import { useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

export default function Auth({ onAuthenticated }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (data.session) {
          onAuthenticated?.(data.session);
        } else {
          setMessage(
            "A verification email was sent to your email address. Please check your inbox and spam folder, then click the verification link to activate your account."
          );
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) throw error;

        onAuthenticated?.(data.session);
      }
    } catch (err) {
      setError(
        err?.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setIsSignup((previous) => !previous);
    setPassword("");
    setShowPassword(false);
    setMessage("");
    setError("");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          TALKATIVE <span>AI</span>
        </div>

        <p className="auth-subtitle">
          Your personal AI partner for better communication.
        </p>

        <h1>
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>

        <p className="auth-description">
          {isSignup
            ? "Start building confidence, one conversation at a time."
            : "Log in to continue your communication journey."}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="auth-email">Email address</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            autoComplete={
              isSignup ? "new-password" : "current-password"
            }
            placeholder={
              isSignup ? "At least 8 characters" : "Enter your password"
            }
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <label className="auth-show-password">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) =>
                setShowPassword(event.target.checked)
              }
            />
            Show password
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isSignup
                ? "Create account"
                : "Log in"}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup
            ? "Already have an account?"
            : "New to Talkative AI?"}{" "}
          <button type="button" onClick={switchMode}>
            {isSignup ? "Sign in" : "Sign up"}
          </button>
        </p>
      </section>
    </main>
  );
}
