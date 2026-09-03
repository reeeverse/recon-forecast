export default function Skeleton({ width = '100%', height = 16, style = {} }) {
  return (
    <div style={{
      width, height,
      background: 'var(--surface-2)',
      borderRadius: 'var(--radius-sm)',
      animation: 'skpulse 1.4s ease-in-out infinite',
      ...style,
    }} />
  )
}
