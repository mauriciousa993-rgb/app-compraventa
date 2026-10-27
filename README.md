<div align="center">

<img src="frontend/public/horizon-logo.png" alt="Horizon Autos" width="110" />

# Horizon Autos

**Sistema de gestión para compraventa de vehículos**

Inventario, documentación, trámites, contratos y reportes de un concesionario,
en una sola aplicación web instalable desde el celular.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React%2018-20232A?logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white)

</div>

---

## Qué resuelve

Un concesionario de vehículos usados maneja, por cada carro, información que
normalmente vive repartida entre cuadernos, grupos de WhatsApp y hojas de
cálculo: cuánto costó, cuánto se ha invertido en arreglarlo, dónde está, qué
papeles le faltan, quién lo está negociando y cuánto se va a ganar con él.

Esta aplicación concentra ese flujo completo —desde que el vehículo entra al
taller hasta que se firma el contrato de venta— y calcula la rentabilidad real
de cada unidad y del inventario entero.

## Funcionalidades

### Inventario y rentabilidad
- Ficha completa del vehículo: identificación, precios, estado y fotografías.
- Estados de ciclo de vida: en proceso, listo para venta, en negociación,
  separado y vendido.
- **Contadores de permanencia**: los días en vitrina se congelan al entrar en
  negociación y arranca un conteo independiente de días negociando.
- **Ubicación en tiempo real** de los vehículos con pendientes (taller,
  pintura, latonería, tapicería, alistamiento, parqueadero, trámites).
- Costo total, utilidad y margen calculados por vehículo y consolidados en el
  dashboard.

### Inversionistas
- Varios inversionistas por vehículo, con su monto y su porcentaje de
  participación.
- Gastos registrados por inversionista y categoría, que suman al costo del
  carro y se descuentan de la utilidad.
- Distribución automática de la utilidad según participación.

### Negociación y venta
- Registro de la forma de pago: efectivo, consignación, transferencia, crédito
  o mixto, con el monto de cada medio y la entidad financiera.
- Separación de vehículos con datos del cliente y valor abonado.
- **Generación de documentos**: contrato de compraventa y formulario de
  traspaso de tránsito, diligenciados con los datos de la operación.

### Lectura de documentos con IA
- **Tarjeta de propiedad**: se fotografía y la ficha del vehículo se llena sola
  (placa, marca, línea, motor, chasis, propietario).
- **Cédula del comprador y del vendedor**: se fotografía y los datos pasan al
  contrato, sin transcribir a mano.

### Documentación y alertas
- Control de vigencia de SOAT y tecnomecánica con semáforo por días restantes.
- **Calendario suscribible** (feed `.ics`) para ver los vencimientos en Google
  Calendar, con aviso dos días antes.
- Checklist de ingreso vehicular con evaluación mecánica y estética, mapa de
  daños por zona, firma digital y exportación a PDF.

### Operación del negocio
- Gastos fijos del concesionario y liquidación de comisiones por vendedor.
- Panel de solicitudes de crédito que recibe el formulario público.
- Marketplace público y consulta de estado de trámite sin necesidad de cuenta.
- Reportes mensuales y exportación a Excel.
- Roles diferenciados: administrador, vendedor e inversionista, cada uno con su
  propia vista de la información.

## Arquitectura

```
frontend/          React 18 + Vite + TypeScript + Tailwind (PWA instalable)
  src/pages/       15 vistas: dashboard, inventario, checklist, reportes…
  src/components/  Modales de venta, separación, negociación y layout
  src/services/    Cliente de API con modo demo sin backend

backend/           Node + Express + TypeScript
  src/models/      Vehicle, User, FixedExpense, Checklist, Comisiones
  src/controllers/ Inventario, OCR con IA, contratos, créditos, calendario
  src/routes/      API REST protegida con JWT y autorización por rol
  src/utils/       Generación de PDF
```

**Datos e integraciones:** MongoDB Atlas (inventario y usuarios), Supabase
(solicitudes de crédito y sus soportes), Cloudinary (imágenes), OpenAI Vision
(lectura de documentos), Resend/SMTP (notificaciones).

**Despliegue:** frontend en Vercel, backend en Render.

## Ejecución local

Requisitos: Node 18+ y una instancia de MongoDB (local o Atlas).

```bash
# Backend
cd backend
npm install
cp .env.example .env        # configura MONGODB_URI y JWT_SECRET
npm run dev                 # http://localhost:5000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

### Variables de entorno

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `MONGODB_URI` | Sí | Conexión a la base de datos |
| `JWT_SECRET` | Sí | Firma de los tokens de sesión |
| `CLOUDINARY_*` | Recomendada | Almacenamiento de fotos; sin ella se guardan en disco y se pierden al redesplegar |
| `OPENAI_API_KEY` | Opcional | Lectura de cédula y tarjeta de propiedad con IA |
| `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Panel de solicitudes de crédito |

El frontend se puede ejecutar sin backend con `VITE_DEMO_FRONTEND=true`, que
activa un modo de demostración con datos de ejemplo.

## Licencia

Proyecto privado desarrollado para Horizon Autos (Cali, Colombia).
