import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const E164 = /^\+[1-9]\d{7,14}$/

export default function SettingsPage() {
  const [prefs, setPrefs]     = useState(null)
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [notifySms, setNotifySms]     = useState(false)
  const [phone, setPhone]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState(null)  // {text, ok}
  const [phoneErr, setPhoneErr]       = useState('')

  useEffect(() => {
    apiFetch('/settings').then(d => {
      setPrefs(d)
      setNotifyEmail(d.notify_email ?? true)
      setNotifySms(d.notify_sms ?? false)
      setPhone(d.phone || '')
    }).catch(() => {})
  }, [])

  function validatePhone(val) {
    if (!val) return ''
    return E164.test(val) ? '' : 'Must be E.164 format, e.g. +919876543210'
  }

  async function handleSave(e) {
    e.preventDefault()
    const err = notifySms ? validatePhone(phone) : ''
    setPhoneErr(err)
    if (err) return

    setSaving(true)
    setMsg(null)
    try {
      await apiFetch('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          notify_email: notifyEmail,
          notify_sms: notifySms,
          phone: notifySms ? phone : '',
        }),
      })
      setMsg({ text: 'Settings saved.', ok: true })
    } catch (ex) {
      setMsg({ text: ex.message || 'Save failed.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>
        Settings
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 24px' }}>
        Manage notification preferences for liquidity alerts.
      </p>

      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        maxWidth: 480,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Alert Notifications
        </div>

        {!prefs ? (
          <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <form onSubmit={handleSave}>
            {/* Email toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={e => setNotifyEmail(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>Email alerts</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>{prefs.email}</div>
              </div>
            </label>

            {/* SMS toggle */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: notifySms ? 12 : 24, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifySms}
                onChange={e => { setNotifySms(e.target.checked); setPhoneErr('') }}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>SMS alerts</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>Delivered via AWS SNS</div>
              </div>
            </label>

            {/* Phone input — only when SMS is on */}
            {notifySms && (
              <div style={{ marginBottom: 24, paddingLeft: 28 }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setPhoneErr(validatePhone(e.target.value)) }}
                  placeholder="+919876543210"
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: 'var(--surface-2)',
                    border: `1px solid ${phoneErr ? 'var(--danger)' : 'var(--hairline)'}`,
                    borderRadius: 8,
                    color: 'var(--ink)', fontSize: 14,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {phoneErr && (
                  <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{phoneErr}</div>
                )}
              </div>
            )}

            {msg && (
              <div style={{
                fontSize: 13, padding: '8px 12px',
                borderRadius: 8, marginBottom: 16,
                background: msg.ok ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
                color: msg.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${msg.ok ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
              }}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px',
                background: 'var(--accent)',
                border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
