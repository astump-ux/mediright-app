'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const UploadModal = dynamic(() => import('./UploadModal'), { ssr: false })

interface Props {
  type: 'arztrechnung' | 'kassenbescheid'
}

const navy  = '#0f172a'
const mint  = '#10b981'

export default function UploadButton({ type }: Props) {
  const [open, setOpen] = useState(false)
  const isArzt = type === 'arztrechnung'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px',
          background: navy,
          color: 'white',
          borderRadius: 10,
          border: 'none',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(15,23,42,0.18)',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <span style={{ fontSize: 16 }}>📤</span>
        {isArzt ? 'Rechnung hochladen' : 'Kassenbescheid hochladen'}
      </button>

      {open && (
        <UploadModal type={type} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
