import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Vehicle {
  _id: string;
  marca: string;
  modelo: string;
  año: number;
  placa: string;
  color: string;
  kilometraje: number;
  precioVenta: number;
  fotos: {
    exteriores: string[];
    interiores: string[];
    detalles: string[];
  };
  observaciones: string;
}

const Marketplace: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('Fetching vehicles from marketplace...');
      const response = await api.get('/vehicles/marketplace');
      console.log('Vehicles loaded:', response.data);
      setVehicles(response.data);
    } catch (error: any) {
      console.error('Error fetching vehicles:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      setError(`Error al cargar los vehículos: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };


  const handleAdminLogin = () => {
    navigate('/login');
  };

  const getBackendOrigin = (): string => {
    // Si VITE_API_URL existe (ej. https://backend.com/api), quedarse con el origin
    const viteApiUrl = (import.meta as any).env?.VITE_API_URL;
    if (viteApiUrl) {
      try {
        return new URL(viteApiUrl).origin;
      } catch {
        return viteApiUrl.replace(/\/api\/?$/, '');
      }
    }

    // En producción (Vercel), usar backend desplegado
    const hostname = window.location.hostname;
    if (hostname.includes('vercel.app') || hostname === 'localhost') {
      return 'https://app-compraventa.onrender.com';
    }

    return 'https://app-compraventa.onrender.com';
  };

  const getImageUrl = (path: string): string => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;

    const cleanPath = path.startsWith('/uploads/')
      ? path
      : path.startsWith('uploads/')
      ? `/${path}`
      : `/uploads/${path}`;

    return `${getBackendOrigin()}${cleanPath}`;
  };

  const getPrimaryPhoto = (vehicle: Vehicle): string => {
    return (
      vehicle.fotos?.exteriores?.[0] ||
      vehicle.fotos?.interiores?.[0] ||
      vehicle.fotos?.detalles?.[0] ||
      ''
    );
  };



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando vehículos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchVehicles}
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }


  const hasValidImage = (vehicle: Vehicle): boolean => {
    return (
      !!getPrimaryPhoto(vehicle) &&
      !imageErrors[vehicle._id]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Marketplace de Vehículos</h1>
              <p className="text-gray-600">Encuentra el vehículo perfecto para ti</p>
            </div>
            <button
              onClick={handleAdminLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Iniciar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {vehicles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No hay vehículos disponibles en este momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((vehicle) => (
              <div key={vehicle._id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                {/* Vehicle Image */}
                <div className="h-48 bg-gray-200">
                  {hasValidImage(vehicle) ? (
                    <img
                      src={getImageUrl(getPrimaryPhoto(vehicle))}
                      alt={`${vehicle.marca} ${vehicle.modelo}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        setImageErrors((prev) => ({ ...prev, [vehicle._id]: true }));
                        (e.currentTarget as HTMLImageElement).onerror = null;
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      Sin imagen
                    </div>
                  )}
                </div>

                {/* Vehicle Info */}
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {vehicle.marca} {vehicle.modelo} {vehicle.año}
                  </h3>

                  <div className="space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium">Placa:</span> {vehicle.placa}</p>
                    <p><span className="font-medium">Color:</span> {vehicle.color}</p>
                    <p><span className="font-medium">Kilometraje:</span> {vehicle.kilometraje.toLocaleString('es-CO')} km</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-2xl font-bold text-green-600">
                      ${vehicle.precioVenta.toLocaleString('es-CO')}
                    </p>
                  </div>

                  {vehicle.observaciones && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {vehicle.observaciones}
                      </p>
                    </div>
                  )}

                  <button className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
                    Contactar Vendedor
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500">
            <p>&copy; 2024 Marketplace de Vehículos. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Marketplace;
