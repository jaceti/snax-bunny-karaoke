import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use | Snax the Bunny Karaoke",
  description: "The terms that apply when you join a room or run a host or TV display.",
};

const UPDATED = "September 3, 2026";

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link href="/" className="legal-wordmark">SNAX</Link>
        <Link href="/">Back to karaoke</Link>
      </header>

      <section className="legal-page">
        <p className="eyebrow">Last updated {UPDATED}</p>
        <h1>Terms of Use</h1>
        <p className="legal-intro">
          These terms apply when you use Snax the Bunny Karaoke. By joining a room or operating a
          host or TV display, you agree to use the service responsibly.
        </p>

        <article>
          <h2>The service</h2>
          <p>
            Snax the Bunny Karaoke is a free event tool that helps guests search for public karaoke
            videos, add selections to a shared queue, and control playback. The service may change,
            pause, or end without notice.
          </p>
        </article>

        <article>
          <h2>Guest and host responsibilities</h2>
          <ul>
            <li>Use a respectful stage name and do not impersonate another person.</li>
            <li>Do not submit unlawful, abusive, harassing, or inappropriate content.</li>
            <li>Do not interfere with the service, bypass room controls, scrape data, or misuse access tokens.</li>
            <li>Hosts may reorder, skip, or remove any song and are responsible for managing their event and audience.</li>
          </ul>
        </article>

        <article>
          <h2>YouTube content</h2>
          <p>
            By using this app, you agree to be bound by the{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.
            The app uses YouTube API Services and the official YouTube embedded player. YouTube
            videos are provided by third parties. We do not own, control, endorse, or guarantee the
            availability, accuracy, licensing, or suitability of any video. YouTube may show ads or
            restrict playback.
          </p>
        </article>

        <article>
          <h2>Event and music rights</h2>
          <p>
            Hosts are responsible for the venue, internet connection, equipment, public-performance
            permissions, and any licenses their event may require. The service does not grant music,
            performance, synchronization, or public-display rights.
          </p>
        </article>

        <article>
          <h2>Availability and disclaimers</h2>
          <p>
            The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis.
            Search results, video playback, room access, and queue synchronization may be delayed or
            unavailable. To the extent permitted by law, we disclaim implied warranties and are not
            responsible for indirect, incidental, or consequential losses arising from use of the
            service.
          </p>
        </article>

        <article>
          <h2>Privacy</h2>
          <p>
            Our <Link href="/privacy">Privacy Policy</Link> explains what information the app
            processes, how YouTube API Services are used, and how to request deletion.
          </p>
        </article>

        <article>
          <h2>Changes</h2>
          <p>
            We may update these terms as the service changes. The &ldquo;last updated&rdquo; date
            will show when a revision becomes effective. Continued use after an update means you
            accept the revised terms.
          </p>
        </article>

        <article>
          <h2>Contact</h2>
          <p>Questions about these terms can be sent to jaceti@gmail.com.</p>
        </article>
      </section>
    </main>
  );
}
