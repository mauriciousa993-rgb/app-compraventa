import axios from 'axios';
import { AuthResponse, User, Vehicle, Statistics, DatosVenta } from '../types';

// Detectar IP local para móviles o URL de producción
const getAPIURL = (): string => {
  // Si está configurado VITE_API_URL, usarlo (producción)
  const viteApiUrl = (import.meta as any).env?.VITE_API_URL;
  if (viteApiUrl) {
    console.log('🌍 URL de API (producción):', viteApiUrl);
    return viteApiUrl;
  }
  
  // Detectar IP local para desarrollo
  const hostname = window.location.hostname;
  const apiURL = `http://${hostname}:5000/api`;
  console.log('📱 URL de API (desarrollo):', apiURL);
  return apiURL;
};

const API_URL = getAPIURL();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token a las peticiones
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    // Registrar errores de conexión para debugging en móviles
    if (!error.response) {
      console.error('❌ Error de conexión:', error.message);
      console.log('API URL intentada:', API_URL);
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: async (data: { nombre: string; email: string; password: string; rol?: string }) => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get<User>('/auth/profile');
    return response.data;
  },

  getAllUsers: async () => {
    const response = await api.get<User[]>('/auth/users');
    return response.data;
  },

  updateUser: async (id: string, data: Partial<User>) => {
    const response = await api.put(`/auth/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id: string) => {
    const response = await api.delete(`/auth/users/${id}`);
    return response.data;
  },
};

// Vehicles API
export const vehiclesAPI = {
  getAll: async (filters?: { estado?: string; marca?: string; modelo?: string; año?: number }) => {
    const response = await api.get<Vehicle[]>('/vehicles', { params: filters });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<Vehicle>(`/vehicles/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post<{ message: string; vehicle: Vehicle }>('/vehicles', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put<{ message: string; vehicle: Vehicle }>(`/vehicles/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/vehicles/${id}`);
    return response.data;
  },

  getStatistics: async () => {
    const response = await api.get<Statistics>('/vehicles/statistics');
    return response.data;
  },

  exportToExcel: async (estado?: string) => {
    const response = await api.get('/vehicles/export', {
      params: { estado },
      responseType: 'blob',
    });
    
    // Crear un enlace de descarga
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventario-vehiculos-${Date.now()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  uploadPhotos: async (id: string, tipo: string, files: File[]) => {
    const formData = new FormData();
    formData.append('tipo', tipo);
    files.forEach((file) => {
      formData.append('fotos', file);
    });

    const response = await api.post(`/vehicles/${id}/photos`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getExpiringDocuments: async () => {
    const response = await api.get<Vehicle[]>('/vehicles/expiring-documents');
    return response.data;
  },

  saveSaleData: async (id: string, data: DatosVenta) => {
    const response = await api.post(`/vehicles/${id}/sale-data`, data);
    return response.data;
  },

  generateContract: async (id: string) => {
    const response = await api.get(`/vehicles/${id}/contract`, {
      responseType: 'blob',
    });
    
    // Crear un enlace de descarga
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `contrato-${id}-${Date.now()}.docx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};

export default api;
