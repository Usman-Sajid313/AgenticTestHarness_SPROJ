import Link from 'next/link';

const steps = [
  'List the suites that belong to the signed-in workspace.',
  'Surface a delete affordance next to each suite and ask the operator to confirm the destructive action.',
  'Call `DELETE /api/suites` with the selected `suiteId` and optimistically remove the card from the grid.',
  'Log the deletion in the audit trail so other admins can trace who removed which suite.',
];

const safeguards = [
  'Workspaces cannot delete suites that they do not own; the API verifies the workspace membership and suite ownership.',
  'The UI request is blocked behind a confirmation prompt so accidental clicks cannot remove suites without acknowledgement.',
  'All failures return structured JSON that the UI can surface back to the operator.',
];

export default function DeleteTestSuitePage() {
  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-12 space-y-8">

        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Delete Test Suite</p>
          <h1 className="text-4xl font-semibold text-zinc-100">Retire Redundant Suites</h1>
          <p className="max-w-3xl text-sm text-zinc-400">
            Operators can retire outdated suites directly from the suites grid. This page summarizes the UX, the API
            contract, and the guardrails that protect the workspace from accidental loss.
          </p>

          <div className="flex gap-3">
            <Link
              href="/suites"
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition"
            >
              View Suites
            </Link>
            <Link
              href="/"
              className="rounded-lg px-4 py-2 text-sm text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Flow Overview</h2>
          <ol className="list-decimal space-y-3 pl-4 text-sm text-zinc-400">
            {steps.map((step) => (
              <li key={step} className="pl-2">
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-3">
            <h3 className="text-base font-semibold text-zinc-100">API shape</h3>
            <p className="text-xs uppercase tracking-wide text-zinc-500">DELETE /api/suites</p>

            <pre className="rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300 border border-zinc-800">
{`fetch('/api/suites', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ suiteId }),
});`}
            </pre>

            <p className="text-sm text-zinc-400">
              The server validates the session, ensures the suite belongs to the same workspace, deletes it, and writes a
              `SUITE_DELETE` audit event that records the suite name and ID.
            </p>
          </div>

          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-3">
            <h3 className="text-base font-semibold text-zinc-100">Guardrails</h3>
            <ul className="space-y-2 text-sm text-zinc-400 list-disc pl-4">
              {safeguards.map((guardrail) => (
                <li key={guardrail}>{guardrail}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-4">
          <h3 className="text-base font-semibold text-zinc-100">Operator Experience</h3>
          <p className="text-sm text-zinc-400">
            Each suite card exposes a delete action in the top-right corner. Clicking it prompts the operator:
            &ldquo;Are you sure you want to delete the Test Suite?&rdquo; Confirming issues the request above, removes the
            card from the UI, and shows any server-side errors inline if deletion fails.
          </p>
        </section>

      </div>
    </main>
  );
}
