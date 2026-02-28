import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useNotifications } from './hooks/useNotifications';
import { PWAInstallButton } from './components/PWAInstallButton';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VehicleList from './pages/VehicleList';
import VehicleForm from './pages/VehicleForm';
import Reports from './pages/Reports';
import UserManagement from './pages/UserManagement';
import Marketplace from './pages/Marketplace';
import FixedExpenses from './pages/FixedExpenses';
import Notifications from './pages/Notifications';
import ConsultaTramite from './pages/ConsultaTramite';
import CommissionLiquidation from './pages/CommissionLiquidation';

// Componente para proteger rutas
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/consulta-tramite" element={<ConsultaTramite />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />


      <Route
        path="/vehicles"
        element={
          <PrivateRoute>
            <VehicleList />
          </PrivateRoute>
        }
      />
      <Route
        path="/vehicles/new"
        element={
          <PrivateRoute>
            <VehicleForm />
          </PrivateRoute>
        }
      />
      <Route
        path="/vehicles/:id/edit"
        element={
          <PrivateRoute>
            <VehicleForm />
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <Reports />
          </PrivateRoute>
        }
      />
      <Route
        path="/fixed-expenses"
        element={
          <PrivateRoute>
            <FixedExpenses />
          </PrivateRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <PrivateRoute>
            <Notifications />
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PrivateRoute>
            <UserManagement />
          </PrivateRoute>
        }
      />
      <Route
        path="/commissions"
        element={
          <PrivateRoute>
            <CommissionLiquidation />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/marketplace" />} />
    </Routes>
  );
}

function App() {
  const { showInstallButton, permission, installPWA, requestPermission } = useNotifications();

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <PWAInstallButton
          showInstall={showInstallButton}
          permission={permission}
          onInstall={installPWA}
          onRequestPermission={requestPermission}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
