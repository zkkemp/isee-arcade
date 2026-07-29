'use client';

export default function ParentSyncStatus({
  refreshing,
  updatedAt,
  error,
  onRefresh,
}: {
  refreshing: boolean;
  updatedAt: number | null;
  error: string;
  onRefresh: () => void;
}) {
  const checkedAt = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs ${
        error
          ? 'bg-amber-300/[0.08] text-amber-100'
          : 'bg-cyan-300/[0.06] text-cyan-100/75'
      }`}
      role="status"
    >
      <span>
        <strong className="text-current">
          {refreshing ? 'Checking for new answers…' : 'Reports update automatically'}
        </strong>
        {!refreshing && checkedAt && !error ? ` · checked at ${checkedAt}` : ''}
        {error ? ` · ${error}` : ''}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="min-h-9 rounded-lg bg-white/[0.07] px-3 font-black text-white transition hover:bg-white/12 disabled:opacity-45"
      >
        {refreshing ? 'Refreshing…' : 'Refresh now'}
      </button>
    </div>
  );
}
