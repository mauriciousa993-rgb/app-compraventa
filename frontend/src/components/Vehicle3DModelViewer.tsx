import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VehicleDamageZone } from '../types';

// URLs de modelos 3D por tipo de vehículo
const MODEL_URLS: Record<string, string> = {
  sedan: '/models/ren-car-v3.fbx',
  suv: '/models/suv-model.fbx',
  pickup: '/models/pickup-model.fbx',
  hatchback: '/models/hatchback-model.fbx',
};

const FALLBACK_TEXTURE_URL = '/models/kia-nq5-22my-wheel-small-17inch.png';

interface Vehicle3DModelViewerProps {
  damageZones: VehicleDamageZone[];
  onZoneClick?: (zoneKey: string) => void;
  selectedZone?: string;
  tipoVehiculo?: 'suv' | 'pickup' | 'sedan' | 'hatchback';
}

export interface Vehicle3DModelViewerHandle {
  captureDamageViews: () => Promise<{
    izquierda: string;
    derecha: string;
    frente: string;
    trasera: string;
  }>;
}

type ZoneMarkerProfile = {
  direction: [number, number, number];
  seed: [number, number, number];
};

type MaterialWithColor = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
};

const Vehicle3DModelViewer = forwardRef<Vehicle3DModelViewerHandle, Vehicle3DModelViewerProps>(({ 
  damageZones, 
  onZoneClick, 
  selectedZone,
  tipoVehiculo = 'sedan'
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const zoneMarkerGroupRef = useRef<THREE.Group | null>(null);
  const orbitDistanceRef = useRef<number>(12);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.2, 0));
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const damagedZoneLabels = useMemo(
    () => damageZones.filter((zone) => zone.status === 'mal').map((zone) => zone.label),
    [damageZones]
  );

  const forEachMeshMaterial = (
    material: THREE.Material | THREE.Material[],
    callback: (mat: MaterialWithColor) => void
  ) => {
    if (Array.isArray(material)) {
      material.forEach((mat) => callback(mat as MaterialWithColor));
      return;
    }
    callback(material as MaterialWithColor);
  };

  const setCameraByDirection = (direction: THREE.Vector3) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const distance = orbitDistanceRef.current;
    camera.position.copy(direction.clone().multiplyScalar(distance).add(targetRef.current));
    camera.lookAt(targetRef.current);
    controlsRef.current?.update();
  };

  const applyCameraPreset = (preset: 'iso' | 'front' | 'rear' | 'left' | 'right' | 'top') => {
    const presets: Record<typeof preset, THREE.Vector3> = {
      iso: new THREE.Vector3(1, 0.6, 1).normalize(),
      front: new THREE.Vector3(0, 0, 1),
      rear: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0),
    };
    setCameraByDirection(presets[preset]);
  };

  const detectZoneFromPosition = (position: THREE.Vector3): string | null => {
    const x = position.x;
    const y = position.y;
    const z = position.z;
    const absX = Math.abs(x);
    const absZ = Math.abs(z);

    // Configuración original de detección de zonas
    if (z > 0.3 && y > 0.3 && absX < 0.6) return 'capo';
    if (y > 0.5 && absX < 0.7 && z > -0.5 && z < 0.3) return 'techo';
    if (z > 0.8 && absX < 0.6) return 'frente';
    if (z < -0.8 && absX < 0.6) return 'trasera';
    if (x > 0.6 && absZ < 0.7) return 'lateral_der';
    if (x < -0.6 && absZ < 0.7) return 'lateral_izq';

    return null;
  };

  const ZONE_MARKER_PROFILE: Record<string, ZoneMarkerProfile> = {
    frente: { direction: [1, 0, 0], seed: [0.9, 0.35, 0.2] },
    trasera: { direction: [-1, 0, 0], seed: [-0.9, 0.35, 0.2] },
    lateral_der: { direction: [0, 0, 1], seed: [0.2, 0.35, 0.9] },
    lateral_izq: { direction: [0, 0, -1], seed: [0.2, 0.35, -0.9] },
    capo: { direction: [0, 1, 0], seed: [0.2, 0.7, 0.2] },
    techo: { direction: [0, 1, 0.3], seed: [0.2, 0.6, 0.5] },
  };

  const buildZoneMarkers = () => {
    const group = zoneMarkerGroupRef.current;
    const model = modelRef.current;
    if (!group || !model) return;

    // Limpiar marcadores existentes
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      group.remove(child);
    }

    // Calcular tamaño del modelo para escalar marcadores
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const markerRadius = maxDim * 0.08; // AUMENTADO: de 0.05 a 0.08 para puntos más grandes

    damageZones.forEach((zone) => {
      const profile = ZONE_MARKER_PROFILE[zone.key];
      if (!profile) return;

      const isDamaged = zone.status === 'mal';
      const isSelected = selectedZone === zone.key;

      // Crear esfera como marcador
      const geometry = new THREE.SphereGeometry(
        isSelected ? markerRadius * 2.0 : markerRadius * 1.5, // AUMENTADO: de 1.4/0.9 a 2.0/1.5
        32,
        32
      );

      const color = isDamaged ? 0xff4444 : 0x44ff44;
      const emissive = isDamaged ? 0xff0000 : 0x00ff00;
      const emissiveIntensity = isSelected ? 0.8 : 0.4; // AUMENTADO: de 0.6/0.2 a 0.8/0.4

      const material = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.9,
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Posicionar el marcador en la superficie del vehículo
      const [sx, sy, sz] = profile.seed;
      const position = new THREE.Vector3(
        sx * size.x * 0.5,
        sy * size.y * 0.5,
        sz * size.z * 0.5
      );

      mesh.position.copy(position);
      mesh.userData = { zoneKey: zone.key };
      group.add(mesh);

      // Añadir anillo exterior para marcadores seleccionados
      if (isSelected) {
        const ringGeometry = new THREE.RingGeometry(
          markerRadius * 2.2,
          markerRadius * 2.5,
          32
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xffff00,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        group.add(ring);
      }
    });
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const intersects = raycasterRef.current.intersectObjects(
      zoneMarkerGroupRef.current?.children || [],
      false
    );

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const zoneKey = hit.userData?.zoneKey;
      if (zoneKey && onZoneClick) {
        onZoneClick(zoneKey);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    captureDamageViews: async () => {
      const views = {
        izquierda: '',
        derecha: '',
        frente: '',
        trasera: '',
      };

      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      if (!camera || !renderer || !scene) return views;

      const originalPosition = camera.position.clone();
      const originalTarget = targetRef.current.clone();

      const captureView = (direction: THREE.Vector3, distance: number): string => {
        camera.position.copy(direction.clone().multiplyScalar(distance).add(targetRef.current));
        camera.lookAt(targetRef.current);
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      };

      const distance = orbitDistanceRef.current;

      views.izquierda = captureView(new THREE.Vector3(-1, 0, 0), distance);
      views.derecha = captureView(new THREE.Vector3(1, 0, 0), distance);
      views.frente = captureView(new THREE.Vector3(0, 0, 1), distance);
      views.trasera = captureView(new THREE.Vector3(0, 0, -1), distance);

      camera.position.copy(originalPosition);
      camera.lookAt(originalTarget);

      return views;
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    sceneRef.current = scene;

    // Cámara
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(5, 3, 5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controles
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 20;
    controls.target.copy(targetRef.current);
    controlsRef.current = controls;

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.4);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Grupo para marcadores de zonas
    const zoneMarkerGroup = new THREE.Group();
    scene.add(zoneMarkerGroup);
    zoneMarkerGroupRef.current = zoneMarkerGroup;

    // Cargar modelo
    const modelUrl = MODEL_URLS[tipoVehiculo] || MODEL_URLS.sedan;
    const loader = new FBXLoader();
    loader.load(
      modelUrl,
      (object) => {
        object.scale.set(0.01, 0.01, 0.01);
        object.position.set(0, 0, 0);

        object.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.material) {
              forEachMeshMaterial(mesh.material, (mat) => {
                if (mat.color) {
                  mat.color.setHex(0xffffff);
                }
              });
            }
          }
        });

        scene.add(object);
        modelRef.current = object;
        setIsLoading(false);
        buildZoneMarkers();
      },
      undefined,
      (error) => {
        console.error('Error loading 3D model:', error);
        setLoadError('No se pudo cargar el modelo 3D. Usando vista alternativa.');
        setIsLoading(false);
      }
    );

    // Animación
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [tipoVehiculo]);

  // Reconstruir marcadores cuando cambian las zonas o la selección
  useEffect(() => {
    buildZoneMarkers();
  }, [damageZones, selectedZone]);

  const FallbackVehicle = () => (
    <div className="h-full w-full flex items-center justify-center bg-[#0b1220] rounded-lg">
      <div className="text-center">
        <div className="text-6xl mb-4">🚗</div>
        <p className="text-ink-200 text-sm">Vista 3D no disponible</p>
        <p className="text-ink-300 text-xs mt-2">Usa los botones de vista lateral</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyCameraPreset('iso')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Isometrica
        </button>
        <button
          type="button"
          onClick={() => applyCameraPreset('front')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Frente
        </button>
        <button
          type="button"
          onClick={() => applyCameraPreset('right')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Lateral der
        </button>
        <button
          type="button"
          onClick={() => applyCameraPreset('left')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Lateral izq
        </button>
        <button
          type="button"
          onClick={() => applyCameraPreset('rear')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Trasera
        </button>
        <button
          type="button"
          onClick={() => applyCameraPreset('top')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Superior
        </button>
      </div>

      <div className="rounded-xl border border-[#2f3238] bg-[#0b1220] p-2 relative">
        <div ref={containerRef} className="h-72 w-full rounded-lg overflow-hidden" onClick={handleClick} />
        {loadError && (
          <div className="absolute inset-2">
            <FallbackVehicle />
          </div>
        )}
      </div>

      {isLoading && <p className="text-xs text-ink-300 mt-2">Cargando modelo 3D...</p>}
      {loadError && <p className="text-xs text-red-300 mt-2">{loadError}</p>}

      <p className="text-xs text-ink-300 mt-2">
        Arrastra para rotar. La distancia esta fija para mantener escala constante.
      </p>

      {damagedZoneLabels.length > 0 ? (
        <p className="text-xs text-red-300 mt-1">
          Zonas con dano reportado: {damagedZoneLabels.join(', ')}.
        </p>
      ) : (
        <p className="text-xs text-green-300 mt-1">Sin danos visuales marcados.</p>
      )}
    </div>
  );
});

Vehicle3DModelViewer.displayName = 'Vehicle3DModelViewer';

export default Vehicle3DModelViewer;
