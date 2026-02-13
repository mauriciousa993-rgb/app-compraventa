import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, Car, BarChart3, Menu, X } from 'lucide-react';

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
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <Car className="h-8 w-8" />
            <span className="text-xl font-bold">Compraventa Vehículos</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
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

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 hover:bg-primary-700 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-primary-500 py-4">
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
                Vehículos
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
                  onClick={() => {
                    closeMobileMenu();
                    handleLogout();
                  }}
                  className="w-full flex items-center space-x-2 hover:text-primary-200 transition-colors py-2 px-4 hover:bg-primary-700 rounded-lg text-left"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Cerrar sesión</span>
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
