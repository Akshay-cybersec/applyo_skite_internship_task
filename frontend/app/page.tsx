"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PollOption = {
  id: string;
  text: string;
  votes: number;
};

type Poll = {
  id: string;
  question: string;
  total_votes: number;
  version: number;
  options: PollOption[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function pollLink(pollId: string) {
  if (typeof window === "undefined") return `/?poll=${pollId}`;
  return `${window.location.origin}/?poll=${pollId}`;
}

export default function Home() {
  const searchParams = useSearchParams();
  const pollIdFromUrl = searchParams.get("poll") ?? "";

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [pollId, setPollId] = useState(pollIdFromUrl);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [message, setMessage] = useState("");
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    setPollId(pollIdFromUrl);
  }, [pollIdFromUrl]);

  useEffect(() => {
    const load = async () => {
      if (!pollId) {
        setPoll(null);
        setHasVoted(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/polls/${pollId}`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          setPoll(null);
          return;
        }

        const data = (await response.json()) as Poll;
        setPoll(data);
      } catch {
        setPoll(null);
      }
    };

    void load();

    if (!pollId) return;
    const events = new EventSource(`${API_BASE}/polls/${pollId}/events`, {
      withCredentials: true,
    });
    events.onmessage = () => {
      void load();
    };

    return () => {
      events.close();
    };
  }, [pollId]);

  const totalVotes = useMemo(() => {
    return poll ? poll.total_votes : 0;
  }, [poll]);

  const createPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuestion = question.trim();
    const cleanOptions = options.map((opt) => opt.trim()).filter(Boolean);

    if (!cleanQuestion) {
      setMessage("Question is required.");
      return;
    }
    if (cleanOptions.length < 2) {
      setMessage("At least 2 options are required.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: cleanQuestion, options: cleanOptions }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { detail?: string };
        setMessage(err.detail ?? "Failed to create poll.");
        return;
      }

      const data = (await response.json()) as Poll;
      setPoll(data);
      setPollId(data.id);
      setHasVoted(false);
      const link = pollLink(data.id);
      setShareLink(link);
      window.history.replaceState({}, "", `/?poll=${data.id}`);
      setMessage("Poll created. Share the link below.");
    } catch {
      setMessage("Backend not reachable. Start API and try again.");
    }
  };

  const vote = async (optionId: string) => {
    if (!pollId || !poll) return;

    try {
      const response = await fetch(`${API_BASE}/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ option_id: optionId }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { detail?: string };
        if (response.status === 409) {
          setHasVoted(true);
        }
        setMessage(err.detail ?? "Vote failed.");
        return;
      }

      const data = (await response.json()) as Poll;
      setPoll(data);
      setHasVoted(true);
      setMessage("Vote submitted.");
    } catch {
      setMessage("Backend not reachable. Start API and try again.");
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Simple Live Poll</h1>
        <p>Create a poll or open one by share link.</p>

        <form onSubmit={createPoll} className="form">
          <label>
            Question
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should we eat for lunch?"
            />
          </label>

          <div>
            <span>Options</span>
            {options.map((option, index) => (
              <div key={index} className="option-row">
                <input
                  value={option}
                  onChange={(e) => {
                    const next = [...options];
                    next[index] = e.target.value;
                    setOptions(next);
                  }}
                  placeholder={`Option ${index + 1}`}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={options.length <= 2}
                  onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, ""])}
              className="secondary"
            >
              + Add option
            </button>
          </div>

          <button type="submit">Create Poll</button>
        </form>

        {shareLink && (
          <div className="share">
            <strong>Share Link:</strong>
            <a href={shareLink}>{shareLink}</a>
          </div>
        )}

        {message && <p className="message">{message}</p>}
      </section>

      <section className="card">
        <h2>Joined Poll</h2>
        {!pollId && <p>Open a link like /?poll=abc123 to join a poll.</p>}
        {pollId && !poll && <p>Poll not found for id: {pollId}</p>}

        {poll && (
          <div className="poll">
            <h3>{poll.question}</h3>
            <p>Total votes: {totalVotes}</p>
            <ul>
              {poll.options.map((option) => {
                const percent = totalVotes === 0 ? 0 : Math.round((option.votes / totalVotes) * 100);
                return (
                  <li key={option.id}>
                    <button type="button" disabled={hasVoted} onClick={() => void vote(option.id)}>
                      Vote
                    </button>
                    <span>{option.text}</span>
                    <span>
                      {option.votes} votes ({percent}%)
                    </span>
                  </li>
                );
              })}
            </ul>
            {hasVoted && <p className="note">You already voted from this browser.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
