import { SessionAuthProvider, useSessionAuth } from './SessionAuthProvider';
import { AdminDashboard } from './AdminDashboard';
import { SubscriberDashboard } from './SubscriberDashboard';

function DashboardContent() {
  const { user } = useSessionAuth();

  // SessionAuthProvider ensures user is always available here
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  return isAdmin ? <AdminDashboard /> : <SubscriberDashboard />;
}

export function DashboardPageClient() {
  return (
    <SessionAuthProvider redirectTo="/auth/login?error=unauthorized">
      <DashboardContent />
    </SessionAuthProvider>
  );
}
