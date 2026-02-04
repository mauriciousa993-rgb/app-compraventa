import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, Car, BarChart3 } from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-primary-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Car className="h-8 w-8" />
            <span className="text-xl font-bold">Compraventa Vehículos</span>
          </Link>

          <div className="flex items-center space-x-6">
            <Link to="/" className="hover:text-primary-200 transition-colors">
              Dashboard
            </Link>
            <Link to="/vehicles" className="hover:text-primary-200 transition-colors">
              Vehículos
            </Link>
            <Link to="/reports" className="hover:text-primary-200 transition-colors flex items-center space-x-1">
              <BarChart3 className="h-4 w-4" />
              <span>Reportes</span>
            </Link>
            {user?.rol === 'admin' && (
              <Link to="/users" className="hover:text-primary-200 transition-colors">
                Usuarios
              </Link>
            )}

            <div className="flex items-center space-x-4 border-l border-primary-500 pl-6">
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <div className="text-sm">
                  <div className="font-medium">{user?.nombre}</div>
                  <div className="text-primary-200 text-xs capitalize">{user?.rol}</div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 hover:text-primary-200 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
