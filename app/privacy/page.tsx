import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Snax the Bunny Karaoke",
  description: "What Snax the Bunny Karaoke collects, how YouTube API Services are used, and how to request deletion.",
};

const UPDATED = "September 3, 2026";

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link href="/" className="legal-wordmark">SNAX</Link>
        <Link href="/">Back to karaoke</Link>
      </header>

      <section className="legal-page">
        <p className="eyebrow">Last updated {UPDATED}</p>
        <h1>Privacy Policy</h1>
        <p className="legal-intro">
          Snax the Bunny Karaoke is a free event tool for creating a room, choosing a stage name,
          finding karaoke videos, and managing a shared song queue. No account is required.
        </p>

        <article>
          <h2>Information we collect</h2>
          <p>We collect only the information needed to operate a karaoke room:</p>
          <ul>
            <li>The stage name a guest enters.</li>
            <li>Room codes, private room-access tokens, a random guest-device identifier, queue position, event settings, and playback status.</li>
            <li>Song titles, YouTube video IDs, and thumbnail links selected for the queue.</li>
            <li>Limited technical logs that the hosting service may process for security, reliability, and troubleshooting.</li>
          </ul>
          <p>We do not ask guests for passwords, payment information, or a Google login.</p>
        </article>

        <article>
          <h2>How we use information</h2>
          <p>
            We use this information to let guests join the correct room, show the queue, play the
            selected video on the TV display, give hosts playback controls, prevent unauthorized
            room access, and keep the service working.
          </p>
        </article>

        <article>
          <h2>YouTube API Services</h2>
          <p>
            Song search uses the YouTube Data API and selected videos play through the YouTube
            embedded player. The app requests public search-result information and does not request
            access to a guest&rsquo;s YouTube account. Use of YouTube features is also subject to the{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>{" "}
            and the{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
          </p>
          <p>
            Google and YouTube may collect or receive information from the embedded player,
            including IP address, browser and device information, identifiers, player interactions,
            and settings. They may use cookies or similar technologies for video delivery, security,
            analytics, advertising, and personalization as described in Google&rsquo;s Privacy Policy.
          </p>
          <p>
            We do not sell YouTube API data, use it to build advertising profiles, or combine it
            with information from a guest&rsquo;s Google account.
          </p>
        </article>

        <article>
          <h2>Cookies, local storage, and similar technologies</h2>
          <p>
            The app stores and accesses private room, host, invitation, TV, consent, and random
            guest-device identifiers in your browser&rsquo;s local storage so the same device can
            remain connected to the correct room without a sign-in. These values are used only to
            operate and protect the karaoke room and to remember your policy choice.
          </p>
          <p>
            Our hosting provider may process standard request information, including IP address,
            browser and device details, and security or reliability logs, and may use cookies or
            similar technologies to provide and protect the site. The YouTube embedded player and
            Google may also place or access cookies and similar technologies as described above.
          </p>
          <p>
            You can remove this local data and cookies through your browser settings. Clearing them
            may disconnect that browser from its room or host controls.
          </p>
        </article>

        <article>
          <h2>Retention, refresh, and deletion</h2>
          <p>
            YouTube search results are requested live for each search, are not cached by the app,
            and remain only in the open page&rsquo;s memory unless a guest selects a result.
            Reloading or leaving the page clears unselected results.
          </p>
          <p>
            When a result is selected, its title, YouTube video ID, and thumbnail link are stored
            only to operate the queue. A played or skipped selection is deleted immediately. Any
            other queue selection is automatically deleted before it reaches 30 days through
            cleanup that runs whenever the app is used.
          </p>
          <p>
            The room code and hashed access credentials are not YouTube API data and remain
            available so a host&rsquo;s printed QR code continues to work. Starting a fresh event
            deletes the room&rsquo;s queue selections.
          </p>
          <p>
            You may request earlier deletion by emailing jaceti@gmail.com with the room code. We
            will delete data in our possession within seven calendar days. Deleting data from this
            app does not delete the original video or other data held by YouTube; YouTube data can
            be managed through YouTube or your Google account.
          </p>
        </article>

        <article>
          <h2>Sharing and service providers</h2>
          <p>
            We share information only as needed to operate the service with our website-hosting
            provider (Cloudflare) and Google/YouTube. The optional &ldquo;Hot Tips&rdquo; button opens
            Venmo in a new window or app; we do not process, see, or store any payment information. We may also disclose information when required by law or
            to protect the service and its users. We do not sell personal information.
          </p>
        </article>

        <article>
          <h2>Your choices</h2>
          <p>
            You can avoid entering a real name by using a stage name. You can ask the host to remove
            a queued song, and you can request access, correction, or deletion by emailing
            jaceti@gmail.com.
          </p>
        </article>

        <article>
          <h2>Children</h2>
          <p>
            The service is intended for event guests and is not directed to children under 13. Event
            hosts are responsible for supervising minors who use the service.
          </p>
        </article>

        <article>
          <h2>Contact</h2>
          <p>Questions about this policy or data requests can be sent to jaceti@gmail.com.</p>
        </article>
      </section>
    </main>
  );
}
