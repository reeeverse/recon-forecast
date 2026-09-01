import AlertsList from '../components/AlertsList'

export default function AlertsPage() {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Active Alerts</h2>
      <AlertsList />
    </div>
  )
}
