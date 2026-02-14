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
  options: PollOption[];
};

const POLLS_KEY = "simple-polls";
const VOTED_KEY = "voted-polls";
const SESSION_VOTED_KEY = "session-voted-polls";

function readPolls(): Record<string, Poll> {
  try {
    const raw = localStorage.getItem(POLLS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Poll>) : {};
  } catch {
    return {};
  }
}

function writePolls(polls: Record<string, Poll>) {
  localStorage.setItem(POLLS_KEY, JSON.stringify(polls));
}

function readVoted(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeVoted(voted: Record<string, string>) {
  localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
}

function readSessionVoted(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(SESSION_VOTED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSessionVoted(voted: Record<string, string>) {
  sessionStorage.setItem(SESSION_VOTED_KEY, JSON.stringify(voted));
}

function pollLink(pollId: string) {
  if (typeof window === "undefined") return `/?poll=${pollId}`;
  return `${window.location.origin}/?poll=${pollId}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
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

  useEffect(() => {
    setPollId(pollIdFromUrl);
  }, [pollIdFromUrl]);

  useEffect(() => {
    const load = () => {
      if (!pollId) {
        setPoll(null);
        return;
      }
      const polls = readPolls();
      setPoll(polls[pollId] ?? null);
    };

    load();

    const channel = new BroadcastChannel("poll-live-updates");
    const onStorage = (event: StorageEvent) => {
      if (event.key === POLLS_KEY) load();
    };
    channel.onmessage = load;
    window.addEventListener("storage", onStorage);

    return () => {
      channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [pollId]);

  const hasVoted = useMemo(() => {
    if (!pollId) return false;
    return Boolean(readVoted()[pollId] || readSessionVoted()[pollId]);
  }, [pollId]);

  const totalVotes = useMemo(() => {
    return poll ? poll.options.reduce((sum, option) => sum + option.votes, 0) : 0;
  }, [poll]);

  const createPoll = (e: React.FormEvent) => {
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

    const newPollId = uid();
    const newPoll: Poll = {
      id: newPollId,
      question: cleanQuestion,
      options: cleanOptions.map((text) => ({ id: uid(), text, votes: 0 })),
    };

    const polls = readPolls();
    polls[newPollId] = newPoll;
    writePolls(polls);

    const channel = new BroadcastChannel("poll-live-updates");
    channel.postMessage({ type: "poll-created", pollId: newPollId });
    channel.close();

    const link = pollLink(newPollId);
    setShareLink(link);
    setMessage("Poll created. Share the link below.");
  };

  const vote = (optionId: string) => {
    if (!pollId || !poll) return;

    const voted = readVoted();
    const sessionVoted = readSessionVoted();
    if (voted[pollId] || sessionVoted[pollId]) {
      setMessage("You already voted on this poll from this device.");
      return;
    }

    const polls = readPolls();
    const target = polls[pollId];
    if (!target) {
      setMessage("Poll not found.");
      return;
    }

    target.options = target.options.map((option) =>
      option.id === optionId ? { ...option, votes: option.votes + 1 } : option,
    );
    polls[pollId] = target;
    writePolls(polls);

    voted[pollId] = optionId;
    writeVoted(voted);
    sessionVoted[pollId] = optionId;
    writeSessionVoted(sessionVoted);

    const channel = new BroadcastChannel("poll-live-updates");
    channel.postMessage({ type: "vote-added", pollId });
    channel.close();

    setPoll(target);
    setMessage("Vote submitted.");
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
              <input
                key={index}
                value={option}
                onChange={(e) => {
                  const next = [...options];
                  next[index] = e.target.value;
                  setOptions(next);
                }}
                placeholder={`Option ${index + 1}`}
              />
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
                    <button disabled={hasVoted} onClick={() => vote(option.id)}>
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
