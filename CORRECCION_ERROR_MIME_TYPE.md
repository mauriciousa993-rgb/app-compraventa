# Corrección del Error MIME Type en Vercel

## Errores corregidos:

### 1. Error Principal: "Failed to load module script"
- **Causa**: La configuración de `vercel.json` usaba `rewrites` que enviaba TODAS las solicitudes a `index.html`, incluyendo los archivos JavaScript con hash como `index-CctOtfyY.js`
- **Solución**: Cambié la configuración a `routes` con el handle "filesystem" para que primero busque archivos estáticos y solo redirija a index.html si no encuentra el archivo

### 2. Meta tag obsoleto
- **Causa**: `<meta name="apple-mobile-web-app-capable" content="yes">` está deprecated
- **Solución**: Agregué `<meta name="mobile-web-app-capable" content="yes">`

### 3. Conflicto de archivos
- **Causa**: Existían dos archivos `vercel.json` (raíz y frontend/)
- **Solución**: Eliminé el de la raíz, quedó solo el de `frontend/`

## Archivos modificados:
1. `frontend/vercel.json` - Nueva configuración de routes
2. `frontend/index.html` - Agregado meta tag correcto
3. `vercel.json` (raíz) - Eliminado

## Acción requerida:
Debes hacer un **redeploy** en Vercel para que los cambios surtan efecto.

Ejecuta en tu terminal:
```bash
cd c:/Users/mauri/OneDrive/Escritorio/app compraventa
subir-cambios-vercel.bat
```

O manualmente en Vercel:
1. Ve a https://vercel.com/dashboard
2. Selecciona tu proyecto
3. Click en "Deployments"
4. Click en "Redeploy" en el último deployment
