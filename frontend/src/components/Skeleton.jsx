import { useEffect, useState } from 'react'

const pulse = `
@keyframes skpulse {
  0%,100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
}
`

export default function Skeleton({ width = '100%', height = 16, style = {} }) {
  return (
    <>
      <style>{pulse}</style>
      <div style={{
        width, height,
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-sm)',
        animation: 'skpulse 1.4s ease-in-out infinite',
        ...style,
      }} />
    </>
  )
}
