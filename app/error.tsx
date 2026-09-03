"use client";

import { useEffect } from "react";

// A thrown error used to white-screen the whole room mid-song. Now it degrades
// to something a host can read across a dark bar, and retries on its own.
export default function RoomError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[snax]", error);
    const timer = window.setTimeout(reset, 4000);
    return () => window.clearTimeout(timer);
  }, [error, reset]);

  return (
    <main className="snax-shell view-error">
      <section className="error-stage">
        <p className="eyebrow">Hang on</p>
        <h1>The bunny tripped over a cable.</h1>
        <p className="lede">Picking itself up automatically. Nothing in the lineup was lost.</p>
        <button type="button" onClick={reset}>Try now <span>↻</span></button>
      </section>
    </main>
  );
}
