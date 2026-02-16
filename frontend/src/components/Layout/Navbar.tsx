import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, BarChart3, Menu, X, Store, Receipt } from 'lucide-react';
import autoTechLogo from '../../assets/autotech-logo.png';

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

  const navLinkClass =
    'text-ink-100 hover:text-white hover:bg-[#23252a] transition-colors rounded-lg px-3 py-2';

  return (
    <nav className="sticky top-0 z-40 border-b border-[#2f3238] bg-[#121212]/95 text-white backdrop-blur-md shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)]">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center space-x-3 min-w-0">
            <img src={autoTechLogo} alt="AutoTech logo" className="h-11 w-11 flex-shrink-0 object-contain" />
            <div className="min-w-0">
              <span className="hidden sm:block text-xl leading-none font-bold tracking-wide truncate">
                <span className="text-white">Auto</span>
                <span className="text-primary-400">Tech</span>
              </span>
              <span className="sm:hidden text-base leading-none font-bold truncate">
                <span className="text-white">Auto</span>
                <span className="text-primary-400">Tech</span>
              </span>
              <span className="hidden sm:block text-xs text-ink-300 mt-1">
                Gestion de vehiculos
              </span>
            </div>
          </Link>

          <div className="hidden xl:flex items-center space-x-2">
            <Link to="/" className={navLinkClass}>
              Dashboard
            </Link>
            <Link to="/vehicles" className={navLinkClass}>
              Vehiculos
            </Link>
            <Link to="/marketplace" className={`${navLinkClass} flex items-center space-x-1`}>
              <Store className="h-4 w-4 text-primary-400" />
              <span>Marketplace</span>
            </Link>
            <Link to="/reports" className={`${navLinkClass} flex items-center space-x-1`}>
              <BarChart3 className="h-4 w-4 text-primary-400" />
              <span>Reportes</span>
            </Link>
            <Link to="/fixed-expenses" className={`${navLinkClass} flex items-center space-x-1`}>
              <Receipt className="h-4 w-4 text-primary-400" />
              <span>Gastos Fijos</span>
            </Link>
            {user?.rol === 'admin' && (
              <Link to="/users" className={navLinkClass}>
                Usuarios
              </Link>
            )}

            <div className="flex items-center space-x-4 border-l border-[#343840] pl-6 ml-3">
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-primary-400" />
                <div className="text-sm">
                  <div className="font-medium">{user?.nombre}</div>
                  <div className="text-ink-300 text-xs capitalize">{user?.rol}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center space-x-1 text-ink-100 hover:text-primary-300 transition-colors"
                title="Cerrar sesion"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMobileMenu}
            className="inline-flex items-center gap-2 p-2 bg-[#1f2126] hover:bg-[#292c32] rounded-lg transition-colors flex-shrink-0 border border-[#343840]"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="hidden sm:inline text-sm font-semibold">Menu</span>
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="border-t border-[#343840] py-4">
            <div className="flex flex-col space-y-4">
              <Link
                to="/"
                onClick={closeMobileMenu}
                className="text-ink-100 hover:text-white transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg"
              >
                Dashboard
              </Link>
              <Link
                to="/vehicles"
                onClick={closeMobileMenu}
                className="text-ink-100 hover:text-white transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg"
              >
                Vehiculos
              </Link>
              <Link
                to="/marketplace"
                onClick={closeMobileMenu}
                className="text-ink-100 hover:text-white transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg flex items-center space-x-2"
              >
                <Store className="h-4 w-4 text-primary-400" />
                <span>Marketplace</span>
              </Link>
              <Link
                to="/reports"
                onClick={closeMobileMenu}
                className="text-ink-100 hover:text-white transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg flex items-center space-x-2"
              >
                <BarChart3 className="h-4 w-4 text-primary-400" />
                <span>Reportes</span>
              </Link>
              <Link
                to="/fixed-expenses"
                onClick={closeMobileMenu}
                className="text-ink-100 hover:text-white transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg flex items-center space-x-2"
              >
                <Receipt className="h-4 w-4 text-primary-400" />
                <span>Gastos Fijos</span>
              </Link>
              {user?.rol === 'admin' && (
                <Link
                  to="/users"
                  onClick={closeMobileMenu}
                  className="text-ink-100 hover:text-white transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg"
                >
                  Usuarios
                </Link>
              )}

              <div className="border-t border-[#343840] pt-4 mt-2">
                <div className="flex items-center space-x-2 px-4 py-2">
                  <User className="h-5 w-5 text-primary-400" />
                  <div className="text-sm">
                    <div className="font-medium">{user?.nombre}</div>
                    <div className="text-ink-300 text-xs capitalize">{user?.rol}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    handleLogout();
                  }}
                  className="w-full flex items-center space-x-2 text-ink-100 hover:text-primary-300 transition-colors py-2 px-4 hover:bg-[#23252a] rounded-lg text-left"
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
