export function ProfileAvatar({
  src,
  alt = 'Haruka S.',
  className = '',
  size = 120,
}: {
  src?: string
  alt?: string
  className?: string
  size?: number
}) {
  const imageSrc = src || '/haruka-avatar.png'

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-[#eae4de] ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={imageSrc}
        alt={alt}
        className="size-full object-cover"
        onError={(e) => {
          // Fallback to stylized SVG placeholder if image fails to load
          e.currentTarget.style.display = 'none'
          e.currentTarget.parentElement?.classList.add('avatar-fallback')
        }}
      />
    </div>
  )
}
