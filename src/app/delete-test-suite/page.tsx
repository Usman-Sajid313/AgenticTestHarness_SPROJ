import Link from 'next/link'; // Next.js client-side navigation
import { Space_Grotesk } from 'next/font/google'; // Google font loader

// Configure Space Grotesk font
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Steps describing how suite deletion works in the product
const steps = [
  'List the suites that belong to the signed-in workspace.',
  'Surface a delete affordance next to each suite and ask the operator to confirm the destructive action.',
  'Call `DELETE /api/suites` with the selected `suiteId` and optimistically remove the card from the grid.',
  'Log the deletion in the audit trail so other admins can trace who removed which suite.',
];

// Safeguards that protect the workspace from accidental or unauthorized suite deletion
const safeguards = [
  'Workspaces cannot delete suites that they do not own; the API verifies the workspace membership and suite ownership.',
  'The UI request is blocked behind a confirmation prompt so accidental clicks cannot remove suites without acknowledgement.',
  'All failures return structured JSON that the UI can surface back to the operator.',
];

// Main page component for documenting the Delete Test Suite flow
export default function DeleteTestSuitePage() {
  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}>
      {/* Background visual elements */}
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-6 py-12 space-y-8">

        {/* Header section explaining the page purpose */}
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-fuchsia-200/70">Delete Test Suite</p>
          <h1 className="text-4xl font-semibold text-white">Retire Redundant Suites</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Operators can retire outdated suites directly from the suites grid. This page summarizes the UX, the API
            contract, and the guardrails that protect the workspace from accidental loss.
          </p>

          {/* Navigation links */}
          <div className="flex gap-3">
            <Link
              href="/suites"
              className="rounded-lg px-4 py-2 text-sm text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
            >
              View Suites
            </Link>
            <Link
              href="/"
              className="rounded-lg px-4 py-2 text-sm text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        {/* Section describing the deletion flow */}
        <section className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-semibold text-white">Flow Overview</h2>
          <ol className="list-decimal space-y-3 pl-4 text-sm text-white/80">
            {steps.map((step) => (
              <li key={step} className="pl-2">
                {step}
              </li>
            ))}
          </ol>
        </section>

        {/* Section showing API format and guardrails */}
        <section className="grid gap-4 lg:grid-cols-2">

          {/* Left panel: API documentation */}
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl space-y-3">
            <h3 className="text-base font-semibold text-white">API shape</h3>
            <p className="text-xs uppercase tracking-wide text-white/50">DELETE /api/suites</p>

            {/* Example API request */}
            <pre className="rounded-xl bg-black/40 p-4 text-xs text-white/80 ring-1 ring-white/10">
{`fetch('/api/suites', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ suiteId }),
});`}
            </pre>

            <p className="text-sm text-white/70">
              The server validates the session, ensures the suite belongs to the same workspace, deletes it, and writes a
              `SUITE_DELETE` audit event that records the suite name and ID.
            </p>
          </div>

          {/* Right panel: safety guardrails */}
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl space-y-3">
            <h3 className="text-base font-semibold text-white">Guardrails</h3>
            <ul className="space-y-2 text-sm text-white/75 list-disc pl-4">
              {safeguards.map((guardrail) => (
                <li key={guardrail}>{guardrail}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Section describing how the operator interacts with the UI */}
        <section className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl space-y-4">
          <h3 className="text-base font-semibold text-white">Operator Experience</h3>
          <p className="text-sm text-white/70">
            Each suite card exposes a delete action in the top-right corner. Clicking it prompts the operator:
            &ldquo;Are you sure you want to delete the Test Suite?&rdquo; Confirming issues the request above, removes the
            card from the UI, and shows any server-side errors inline if deletion fails.
          </p>
        </section>

      </div>
    </main>
  );
}