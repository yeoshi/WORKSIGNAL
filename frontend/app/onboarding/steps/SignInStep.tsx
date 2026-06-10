'use client';

/**
 * Step 1 — Sign in with Google (Req 1.1).
 *
 * Triggers the Google OAuth flow requesting the `gmail.readonly` scope so
 * WORKSIGNAL can later monitor application replies. The actual redirect is
 * handled by the auth route (wired in task 24.1); here the button calls the
 * tolerant {@link beginGoogleSignIn} helper and advances the flow.
 */
import { useState } from 'react';
import { Button } from '../../components/onboarding/controls';
import { beginGoogleSignIn } from '../api';

export function SignInStep({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setNotice(null);
    const result = await beginGoogleSignIn();
    setBusy(false);
    if (!result.ok && !result.pending) {
      setNotice(result.message);
      return;
    }
    // On success (or when the auth route is not yet wired) continue the flow.
    onSignedIn();
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="font-wordmark text-2xl font-semibold text-ws-ink">
          Sign in to get started
        </h2>
        <p className="max-w-md text-sm text-ws-muted">
          WORKSIGNAL connects to your Google account and requests read-only
          inbox access (<span className="font-mono">gmail.readonly</span>) so it
          can track replies from employers. You can decline inbox access and
          still use everything else.
        </p>
      </div>

      <Button onClick={handleSignIn} disabled={busy}>
        <span className="mr-2" aria-hidden>
          G
        </span>
        {busy ? 'Connecting…' : 'Continue with Google'}
      </Button>

      {notice && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {notice}
        </p>
      )}

      <p className="max-w-sm text-xs text-ws-muted">
        We never send email on your behalf without your explicit action, and we
        only read messages to match employer replies to your applications.
      </p>
    </div>
  );
}
