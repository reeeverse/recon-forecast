import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

const E164 = /^\+[1-9]\d{7,14}$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

const EMPTY_ACCT_FORM = {
  id: '', name: '', account_type: 'current',
  opening_balance_rs: '0', opening_balance_date: '',
  min_threshold_rs: '0',
  bank_name: '', bank_branch: '', ifsc_code: '',
}

export default function SettingsPage() {
  const [prefs, setPrefs]     = useState(null)
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [notifySms, setNotifySms]     = useState(false)
  const [phone, setPhone]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState(null)
  const [phoneErr, setPhoneErr]       = useState('')

  const [accounts, setAccounts]   = useState([])
  const [showAcctForm, setShowAcctForm] = useState(false)
  const [acctForm, setAcctForm]   = useState(EMPTY_ACCT_FORM)
  const [acctSaving, setAcctSaving] = useState(false)
  const [acctMsg, setAcctMsg]     = useState(null)
  const [acctErr, setAcctErr]     = useState({})

  useEffect(() => {
    apiFetch('/settings').then(d => {
      setPrefs(d)
      setNotifyEmail(d.notify_email ?? true)
      setNotifySms(d.notify_sms ?? false)
      setPhone(d.phone || '')
    }).catch(() => {})

    apiFetch('/accounts').then(setAccounts).catch(() => {})
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

    setSaving(true); setMsg(null)
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

  function validateAcctForm() {
    const errs = {}
    if (!acctForm.id.trim()) errs.id = 'Required'
    if (!acctForm.name.trim()) errs.name = 'Required'
    if (acctForm.ifsc_code && !IFSC_RE.test(acctForm.ifsc_code))
      errs.ifsc_code = '11-char format, e.g. HDFC0001234'
    return errs
  }

  async function handleAcctSave(e) {
    e.preventDefault()
    const errs = validateAcctForm()
    setAcctErr(errs)
    if (Object.keys(errs).length) return

    const ob = Math.round(parseFloat(acctForm.opening_balance_rs || '0') * 100)
    const threshold = Math.round(parseFloat(acctForm.min_threshold_rs || '0') * 100)

    setAcctSaving(true); setAcctMsg(null)
    try {
      await apiFetch('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          id: acctForm.id.trim(),
          name: acctForm.name.trim(),
          account_type: acctForm.account_type,
          opening_balance_paise: ob,
          opening_balance_date: acctForm.opening_balance_date || null,
          min_threshold_paise: threshold,
          bank_name: acctForm.bank_name || null,
          bank_branch: acctForm.bank_branch || null,
          ifsc_code: acctForm.ifsc_code || null,
        }),
      })
      setAcctMsg({ text: 'Account created. Refresh the page to see it in the sidebar.', ok: true })
      setShowAcctForm(false)
      setAcctForm(EMPTY_ACCT_FORM)
      apiFetch('/accounts').then(setAccounts).catch(() => {})
    } catch (ex) {
      setAcctMsg({ text: ex.message || 'Failed to create account.', ok: false })
    } finally {
      setAcctSaving(false)
    }
  }

  const inp = (extra = {}) => ({
    width: '100%', padding: '7px 10px', boxSizing: 'border-box',
    background: 'var(--surface-2)', border: '1px solid var(--hairline)',
    borderRadius: 7, color: 'var(--ink)', fontSize: 13, ...extra,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
          Manage notification preferences and bank accounts.
        </p>
      </div>

      {/* Notification settings */}
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 10,
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>Email alerts</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>{prefs.email}</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: notifySms ? 12 : 24, cursor: 'pointer' }}>
              <input type="checkbox" checked={notifySms} onChange={e => { setNotifySms(e.target.checked); setPhoneErr('') }}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>SMS alerts</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 1 }}>Delivered via AWS SNS</div>
              </div>
            </label>

            {notifySms && (
              <div style={{ marginBottom: 24, paddingLeft: 28 }}>
                <input type="tel" value={phone}
                  onChange={e => { setPhone(e.target.value); setPhoneErr(validatePhone(e.target.value)) }}
                  placeholder="+919876543210"
                  style={{ ...inp(), border: `1px solid ${phoneErr ? 'var(--danger)' : 'var(--hairline)'}` }} />
                {phoneErr && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{phoneErr}</div>}
              </div>
            )}

            {msg && (
              <div style={{
                fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 16,
                background: msg.ok ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
                color: msg.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${msg.ok ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
              }}>
                {msg.text}
              </div>
            )}

            <button type="submit" disabled={saving} style={{
              padding: '9px 20px', background: 'var(--accent)',
              border: 'none', borderRadius: 8, color: '#fff',
              fontSize: 14, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        )}
      </div>

      {/* Bank Accounts section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, flex: 1 }}>
            Bank Accounts
          </h2>
          <button onClick={() => setShowAcctForm(v => !v)} style={{
            padding: '6px 14px', background: 'var(--surface-2)',
            border: '1px solid var(--hairline)', borderRadius: 7,
            color: 'var(--ink)', fontSize: 13, cursor: 'pointer',
          }}>
            {showAcctForm ? 'Cancel' : '+ Add Account'}
          </button>
        </div>

        {/* Existing accounts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: showAcctForm ? 16 : 0 }}>
          {accounts.map(a => (
            <div key={a.id} style={{
              background: 'var(--surface-1)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{a.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>ID: {a.id}</div>
              </div>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 9999, fontWeight: 600,
                background: a.account_type === 'savings' ? 'rgba(63,185,80,0.15)' : 'rgba(56,139,253,0.15)',
                color: a.account_type === 'savings' ? 'var(--success)' : 'var(--accent)',
                textTransform: 'uppercase',
              }}>
                {a.account_type || 'current'}
              </span>
              {a.bank_name && (
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {a.bank_name}{a.bank_branch ? ` · ${a.bank_branch}` : ''}{a.ifsc_code ? ` · ${a.ifsc_code}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add account form */}
        {showAcctForm && (
          <div style={{
            background: 'var(--surface-1)', border: '1px solid var(--hairline)',
            borderRadius: 10, padding: '20px 24px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>
              New Bank Account
            </div>

            {acctMsg && (
              <div style={{
                fontSize: 13, padding: '8px 12px', borderRadius: 7, marginBottom: 14,
                background: acctMsg.ok ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                color: acctMsg.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${acctMsg.ok ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
              }}>
                {acctMsg.text}
              </div>
            )}

            <form onSubmit={handleAcctSave}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { key: 'id', label: 'Account ID *', placeholder: 'e.g. ACC-002' },
                  { key: 'name', label: 'Account Name *', placeholder: 'e.g. Operations Savings' },
                  { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. HDFC Bank' },
                  { key: 'bank_branch', label: 'Branch', placeholder: 'e.g. Koramangala' },
                  { key: 'ifsc_code', label: 'IFSC Code', placeholder: 'e.g. HDFC0001234' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div>
                    <input type="text" placeholder={placeholder} value={acctForm[key]}
                      onChange={e => setAcctForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ ...inp(), border: `1px solid ${acctErr[key] ? 'var(--danger)' : 'var(--hairline)'}` }} />
                    {acctErr[key] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{acctErr[key]}</div>}
                  </div>
                ))}

                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Account Type *</div>
                  <select value={acctForm.account_type}
                    onChange={e => setAcctForm(f => ({ ...f, account_type: e.target.value }))}
                    style={inp()}>
                    <option value="current">Current</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Opening Balance (₹)</div>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={acctForm.opening_balance_rs}
                    onChange={e => setAcctForm(f => ({ ...f, opening_balance_rs: e.target.value }))}
                    style={inp()} />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Opening Balance Date</div>
                  <input type="date" value={acctForm.opening_balance_date}
                    onChange={e => setAcctForm(f => ({ ...f, opening_balance_date: e.target.value }))}
                    style={inp()} />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Min Threshold (₹)</div>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={acctForm.min_threshold_rs}
                    onChange={e => setAcctForm(f => ({ ...f, min_threshold_rs: e.target.value }))}
                    style={inp()} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={acctSaving} style={{
                  padding: '7px 18px', background: 'var(--accent)', border: 'none',
                  borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: acctSaving ? 'not-allowed' : 'pointer', opacity: acctSaving ? 0.6 : 1,
                }}>
                  {acctSaving ? 'Creating…' : 'Create Account'}
                </button>
                <button type="button" onClick={() => { setShowAcctForm(false); setAcctForm(EMPTY_ACCT_FORM); setAcctErr({}) }} style={{
                  padding: '7px 14px', background: 'transparent',
                  border: '1px solid var(--hairline)', borderRadius: 7,
                  color: 'var(--ink-muted)', fontSize: 13, cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
