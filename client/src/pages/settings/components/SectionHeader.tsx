interface SectionHeaderProps {
  title: string;
  description?: string;
  inline?: boolean;
}

export function SectionHeader({ title, description, inline = false }: SectionHeaderProps) {
  if (inline) return null;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-[var(--color-text)] m-0">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {description}
        </p>
      )}
    </div>
  );
}
