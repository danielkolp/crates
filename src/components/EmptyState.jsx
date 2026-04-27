function EmptyState({ title, description, compact = false }) {
  return (
    <div
      className={[
        'grid place-items-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-center',
        compact ? 'p-4' : 'p-8',
      ].join(' ')}
    >
      <div className="max-w-sm">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>
    </div>
  )
}

export default EmptyState
