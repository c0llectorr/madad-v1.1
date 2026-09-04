import React from 'react';
import type { LoginResponse } from '../types';
import AdminNavigator from '../screens/admin/AdminNavigator';
import CoordinatorNavigator from '../screens/coordinator/CoordinatorNavigator';

/** The only place that knows about both roles. Page access per role is a UX
 *  boundary — real authorization stays backend-enforced (require_role). */
export default function RoleRouter({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  return session.role === 'administrator'
    ? <AdminNavigator session={session} onLogout={onLogout} />
    : <CoordinatorNavigator session={session} onLogout={onLogout} />;
}
