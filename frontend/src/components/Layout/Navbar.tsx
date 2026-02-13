import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, Car, BarChart3, Menu, X, Store } from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="bg-primary-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2 min-w-0">
            <Car className="h-8 w-8 flex-shrink-0" />
            <span className="hidden sm:inline text-xl font-bold truncate">Compraventa Vehiculos</span>
            <span className="sm:hidden text-base font-bold truncate">Compraventa</span>
          </Link>

          <div className="hidden 2xl:flex items-center space-x-6">
            <Link to="/" className="hover:text-primary-200 transition-colors">
              Dashboard
            </Link>
            <Link to="/vehicles" className="hover:text-primary-200 transition-colors">
              Vehiculos
            </Link>
            <Link to="/marketplace" className="hover:text-primary-200 transition-colors flex items-center space-x-1">
              <Store className="h-4 w-4" />
              <span>Marketplace</span>
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
                type="button"
                onClick={handleLogout}
                className="flex items-center space-x-1 hover:text-primary-200 transition-colors"
                title="Cerrar sesion"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMobileMenu}
            className="inline-flex items-center gap-2 p-2 bg-primary-700 hover:bg-primary-800 rounded-lg transition-colors flex-shrink-0 border border-primary-400"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="hidden sm:inline text-sm font-semibold">Menu</span>
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="border-t border-primary-500 py-4">
            <div className="flex flex-col space-y-4">
              <Link
                to="/"
                onClick={closeMobileMenu}
                className="hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg"
              >
                Dashboard
              </Link>
              <Link
                to="/vehicles"
                onClick={closeMobileMenu}
                className="hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg"
              >
                Vehiculos
              </Link>
              <Link
                to="/marketplace"
                onClick={closeMobileMenu}
                className="hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg flex items-center space-x-2"
              >
                <Store className="h-4 w-4" />
                <span>Marketplace</span>
              </Link>
              <Link
                to="/reports"
                onClick={closeMobileMenu}
                className="hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg flex items-center space-x-2"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Reportes</span>
              </Link>
              {user?.rol === 'admin' && (
                <Link
                  to="/users"
                  onClick={closeMobileMenu}
                  className="hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg"
                >
                  Usuarios
                </Link>
              )}

              <div className="border-t border-primary-500 pt-4 mt-2">
                <div className="flex items-center space-x-2 px-4 py-2">
                  <User className="h-5 w-5" />
                  <div className="text-sm">
                    <div className="font-medium">{user?.nombre}</div>
                    <div className="text-primary-200 text-xs capitalize">{user?.rol}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    handleLogout();
                  }}
                  className="w-full flex items-center space-x-2 hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg text-left"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Cerrar sesion</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
