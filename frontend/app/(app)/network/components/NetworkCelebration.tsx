export interface NetworkCelebrationProps {
  company: string;
}

export function NetworkCelebration({ company }: NetworkCelebrationProps) {
  return (
    <div
      data-testid="network-celebration"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-sm rounded-2xl border border-emerald-200 bg-white px-8 py-10 text-center shadow-xl">
        <p className="text-2xl" aria-hidden>
          🎉
        </p>
        <h2 className="mt-3 text-lg font-semibold text-gray-900">
          Yay — you reached out to everyone!
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Hopefully this helps your applications land. Archiving{' '}
          <span className="font-medium text-gray-700">{company}</span>…
        </p>
      </div>
    </div>
  );
}
