export function BackButton({ onClick, label = 'Back to main menu' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} onClick={onClick}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
