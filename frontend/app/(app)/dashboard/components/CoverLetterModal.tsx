'use client';

import { useState, useEffect, useRef } from 'react';

export interface CoverLetterModalProps {
    open: boolean;
    jobId: string | null;
    jobTitle: string;
    company: string;
    hasEmployerEmail: boolean;
    sourceUrl: string | null;
    onClose: () => void;
    /** Called with the jobId after a successful send (or mailto open) so the
     *  dashboard can move the card to the Sent column. */
    onSent: (jobId: string) => void;
}

type ModalState =
    | { phase: 'idle' }
    | { phase: 'drafting' }
    | { phase: 'ready'; coverLetter: string; employerEmail: string | null }
    | { phase: 'sending'; coverLetter: string; employerEmail: string | null }
    | { phase: 'sent'; recipient: string }
    | { phase: 'mailto'; mailto: string; fallback: string }
    | { phase: 'error'; message: string };

export function CoverLetterModal({
    open,
    jobId,
    jobTitle,
    company,
    hasEmployerEmail,
    sourceUrl,
    onClose,
    onSent,
}: CoverLetterModalProps) {
    const [modalState, setModalState] = useState<ModalState>({ phase: 'idle' });
    const [editedLetter, setEditedLetter] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Draft cover letter whenever the modal opens with a new job.
    useEffect(() => {
        if (!open || !jobId) return;
        setModalState({ phase: 'drafting' });
        setEditedLetter('');

        fetch('/api/apply/draft', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ job_id: jobId }),
        })
            .then((r) => r.json())
            .then((data: { cover_letter?: string; job?: { employer_email?: string | null }; error?: string }) => {
                if (data.error) {
                    setModalState({ phase: 'error', message: data.error });
                    return;
                }
                const letter = data.cover_letter ?? '';
                setEditedLetter(letter);
                setModalState({
                    phase: 'ready',
                    coverLetter: letter,
                    employerEmail: data.job?.employer_email ?? null,
                });
            })
            .catch((err: unknown) => {
                setModalState({ phase: 'error', message: err instanceof Error ? err.message : 'Draft failed' });
            });
    }, [open, jobId]);

    // Auto-resize textarea.
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
    }, [editedLetter]);

    // Reset when closed.
    useEffect(() => {
        if (!open) {
            setModalState({ phase: 'idle' });
            setEditedLetter('');
        }
    }, [open]);

    if (!open) return null;

    async function handleSend() {
        if (!jobId) return;
        const letter = editedLetter.trim();
        if (!letter) return;

        const prevState = modalState;
        setModalState({
            phase: 'sending',
            coverLetter: letter,
            employerEmail: (prevState as { employerEmail?: string | null }).employerEmail ?? null,
        });

        try {
            const res = await fetch('/api/apply/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ job_id: jobId, cover_letter: letter }),
            });
            const data = await res.json() as {
                sent?: boolean;
                recipient?: string;
                fallback?: string;
                mailto?: string;
                source_url?: string;
                error?: string;
            };

            if (data.sent) {
                setModalState({ phase: 'sent', recipient: data.recipient ?? 'employer' });
                onSent(jobId);
                return;
            }

            if (data.fallback === 'no_email') {
                // Open source URL so user can apply manually.
                if (data.source_url) window.open(data.source_url, '_blank');
                onSent(jobId);
                onClose();
                return;
            }

            if (data.mailto) {
                setModalState({ phase: 'mailto', mailto: data.mailto, fallback: data.fallback ?? '' });
                return;
            }

            setModalState({ phase: 'error', message: data.error ?? 'Send failed' });
        } catch (err) {
            setModalState({ phase: 'error', message: err instanceof Error ? err.message : 'Send failed' });
        }
    }

    function handleMailtoOpen(mailto: string) {
        window.open(mailto, '_blank');
        if (jobId) onSent(jobId);
        onClose();
    }

    const isReady = modalState.phase === 'ready' || modalState.phase === 'sending';
    const isSending = modalState.phase === 'sending';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Apply to ${jobTitle} at ${company}`}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Draft application</p>
                        <h2 className="mt-0.5 text-base font-semibold text-gray-900">{jobTitle}</h2>
                        <p className="text-sm text-gray-500">{company}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="mt-0.5 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {modalState.phase === 'drafting' && (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
                            <p className="text-sm text-gray-500">
                                Analysing agent debate and drafting your cover letter…
                            </p>
                            <p className="text-xs text-gray-400">Powered by Bedrock Claude</p>
                        </div>
                    )}

                    {modalState.phase === 'error' && (
                        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                            {modalState.message}
                        </div>
                    )}

                    {modalState.phase === 'sent' && (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                                ✓
                            </div>
                            <p className="font-semibold text-gray-900">Application sent!</p>
                            <p className="text-sm text-gray-500">
                                Your cover letter was emailed to <span className="font-medium">{modalState.recipient}</span>.
                            </p>
                        </div>
                    )}

                    {modalState.phase === 'mailto' && (
                        <div className="flex flex-col gap-4 py-4">
                            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                {modalState.fallback === 'needs_auth'
                                    ? 'Sign out and sign in again to grant email-send permission, or use the button below to open your mail client.'
                                    : 'Gmail access token needs refresh — click below to open your mail client with the cover letter pre-filled.'}
                            </div>
                            <button
                                type="button"
                                onClick={() => handleMailtoOpen(modalState.mailto)}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                Open mail client
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {isReady && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                    Cover letter
                                </label>
                                <span className="text-xs text-gray-400">Edit before sending</span>
                            </div>
                            <textarea
                                ref={textareaRef}
                                value={editedLetter}
                                onChange={(e) => setEditedLetter(e.target.value)}
                                disabled={isSending}
                                className="min-h-[280px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                                spellCheck
                            />
                            {/* Resume note */}
                            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                                <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>Attach your resume manually to the email, or reply with it if the hiring team responds.</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(isReady || modalState.phase === 'error') && (
                    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSending}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>

                        <div className="flex items-center gap-2">
                            {!hasEmployerEmail && sourceUrl && (
                                <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Apply on site
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            )}

                            {hasEmployerEmail && (
                                <button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={isSending || !editedLetter.trim()}
                                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {isSending ? (
                                        <>
                                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                            Sending…
                                        </>
                                    ) : (
                                        <>
                                            Reach out
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {modalState.phase === 'sent' && (
                    <div className="border-t border-gray-100 px-6 py-4 text-right">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
