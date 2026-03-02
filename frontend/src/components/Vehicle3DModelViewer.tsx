import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VehicleDamageZone } from '../types';

const MODEL_URL = '/models/ren-car-v3.fbx';
const FALLBACK_TEXTURE_URL = '/models/kia-nq5-22my-wheel-small-17inch.png';

interface Vehicle3DModelViewerProps {
  damageZones: VehicleDamageZone[];
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

const Vehicle3DModelViewer: React.FC<Vehicle3DModelViewerProps> = ({ damageZones }) => {
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
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = targetRef.current.clone();
    const dir = direction.clone().normalize();
    camera.position.copy(target.add(dir.multiplyScalar(orbitDistanceRef.current)));
    camera.lookAt(targetRef.current);
    controls.target.copy(targetRef.current);
    controls.update();
  };

  const ZONE_MARKER_PROFILE: Record<string, ZoneMarkerProfile> = {
    frente: {
      direction: [0, 0.05, -1],
      seed: [0, 0.36, -0.98],
    },
    capo: {
      direction: [0, 0.38, -1],
      seed: [0, 0.66, -0.56],
    },
    techo: {
      direction: [0, 1, 0],
      seed: [0, 0.93, 0.04],
    },
    trasera: {
      direction: [0, 0.07, 1],
      seed: [0, 0.38, 0.98],
    },
    lateral_izq: {
      direction: [-1, 0.08, 0],
      seed: [-0.98, 0.52, 0.04],
    },
    lateral_der: {
      direction: [1, 0.08, 0],
      seed: [0.98, 0.52, 0.04],
    },
    puerta_izq: {
      direction: [-1, 0.02, 0.02],
      seed: [-0.9, 0.48, 0.24],
    },
    puerta_der: {
      direction: [1, 0.02, 0.02],
      seed: [0.9, 0.48, 0.24],
    },
  };

  const clearZoneMarkers = () => {
    const markerGroup = zoneMarkerGroupRef.current;
    if (!markerGroup) return;
    while (markerGroup.children.length > 0) {
      const child = markerGroup.children.pop() as THREE.Mesh | undefined;
      if (!child) continue;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  };

  const renderZoneMarkers = (zones: VehicleDamageZone[]) => {
    const model = modelRef.current;
    const markerGroup = zoneMarkerGroupRef.current;
    if (!model || !markerGroup) return;

    clearZoneMarkers();

    const meshes: THREE.Mesh[] = [];
    model.traverse((child: any) => {
      if (child.isMesh) meshes.push(child as THREE.Mesh);
    });
    if (meshes.length === 0) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const halfX = Math.max(size.x / 2, 0.1);
    const halfZ = Math.max(size.z / 2, 0.1);
    const markerRadius = Math.max(Math.min(size.x, size.y, size.z) * 0.03, 0.08);
    const outsideDistance = Math.max(size.x, size.y, size.z) * 1.1;
    const raycaster = new THREE.Raycaster();

    zones.forEach((zone) => {
      const profile = ZONE_MARKER_PROFILE[zone.key];
      if (!profile) return;
      const rayOutDirection = new THREE.Vector3(...profile.direction).normalize();

      const isDamaged = zone.status === 'mal';
      const [nx, ny, nz] = profile.seed;
      const seed = new THREE.Vector3(
        center.x + nx * halfX * 0.95,
        box.min.y + ny * size.y,
        center.z + nz * halfZ * 0.95
      );

      const rayStart = seed.clone().addScaledVector(rayOutDirection, outsideDistance);
      raycaster.set(rayStart, rayOutDirection.clone().multiplyScalar(-1));
      const intersections = raycaster.intersectObjects(meshes, false);

      let markerPosition = seed.clone();
      if (intersections.length > 0) {
        const hit = intersections[0];
        const hitNormal = hit.face?.normal
          ? hit.face.normal.clone().transformDirection((hit.object as THREE.Mesh).matrixWorld)
          : rayOutDirection;
        markerPosition = hit.point.clone().addScaledVector(hitNormal.normalize(), markerRadius * 0.55);
      }

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(isDamaged ? markerRadius * 1.15 : markerRadius * 0.9, 18, 18),
        new THREE.MeshStandardMaterial({
          color: isDamaged ? '#ef4444' : '#22c55e',
          emissive: isDamaged ? '#7f1d1d' : '#052e16',
          emissiveIntensity: isDamaged ? 0.64 : 0.26,
          roughness: 0.3,
          metalness: 0.15,
          transparent: true,
          opacity: isDamaged ? 0.99 : 0.62,
        })
      );
      marker.position.copy(markerPosition);
      marker.castShadow = false;
      marker.receiveShadow = false;
      markerGroup.add(marker);
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth, 280);
    const height = Math.max(container.clientHeight, 280);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f1720');
    scene.fog = new THREE.Fog('#0f1720', 40, 140);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(12, 6, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight('#dbeafe', '#111827', 1.1);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.0);
    keyLight.position.set(10, 14, 8);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#93c5fd', 0.6);
    fillLight.position.set(-8, 5, -6);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 0.95, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    floor.receiveShadow = true;
    scene.add(floor);

    const markerGroup = new THREE.Group();
    zoneMarkerGroupRef.current = markerGroup;
    scene.add(markerGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = orbitDistanceRef.current;
    controls.maxDistance = orbitDistanceRef.current;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.copy(targetRef.current);
    controlsRef.current = controls;

    const loadingManager = new THREE.LoadingManager();
    loadingManager.setURLModifier((url: string) => {
      const normalized = url.replace(/\\/g, '/');
      const fileName = normalized.split('/').pop() || '';
      if (!fileName) return url;
      if (fileName.toLowerCase().includes('wheel-small-17inch')) return FALLBACK_TEXTURE_URL;
      return `/models/${fileName}`;
    });

    const loader = new FBXLoader(loadingManager);
    loader.load(
      MODEL_URL,
      (fbx) => {
        // Normalizar orientacion: altura en eje Y y largo en eje Z
        const preBox = new THREE.Box3().setFromObject(fbx);
        const preSize = preBox.getSize(new THREE.Vector3());
        const minAxis =
          preSize.x <= preSize.y && preSize.x <= preSize.z
            ? 'x'
            : preSize.y <= preSize.x && preSize.y <= preSize.z
              ? 'y'
              : 'z';
        if (minAxis === 'x') {
          fbx.rotateZ(Math.PI / 2);
        } else if (minAxis === 'z') {
          fbx.rotateX(-Math.PI / 2);
        }

        const alignedBox = new THREE.Box3().setFromObject(fbx);
        const alignedSize = alignedBox.getSize(new THREE.Vector3());
        if (alignedSize.x > alignedSize.z) {
          fbx.rotateY(Math.PI / 2);
        }

        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Centrar la geometria en el origen antes de escalar
        fbx.position.set(-center.x, -center.y, -center.z);

        const maxAxis = Math.max(size.x, size.y, size.z) || 1;
        const scale = 8 / maxAxis;
        fbx.scale.setScalar(scale);
        // Sin rotacion adicional para mantener ejes de zonas consistentes
        fbx.rotation.y = 0;

        fbx.traverse((obj: any) => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (!obj.material) return;
          forEachMeshMaterial(obj.material, (mat) => {
            const standardMat = mat as THREE.MeshStandardMaterial;
            if (typeof standardMat.metalness === 'number') {
              standardMat.metalness = standardMat.metalness;
            }
            if (typeof standardMat.roughness === 'number') {
              standardMat.roughness = standardMat.roughness;
            }
            if (mat.color instanceof THREE.Color) {
              mat.userData = { ...(mat.userData || {}), baseColor: mat.color.clone() };
            }
            mat.needsUpdate = true;
          });
        });

        // Ajustar la base del modelo al piso y encuadrar camara automaticamente
        const fittedBox = new THREE.Box3().setFromObject(fbx);
        const fittedSphere = fittedBox.getBoundingSphere(new THREE.Sphere());
        const yShift = -1.8 - fittedBox.min.y;
        fbx.position.y += yShift;

        const finalBox = new THREE.Box3().setFromObject(fbx);
        const finalSize = finalBox.getSize(new THREE.Vector3());
        const target = finalBox.getCenter(new THREE.Vector3());
        target.y = finalBox.min.y + finalSize.y * 0.45;
        targetRef.current.copy(target);

        const radius = Math.max(fittedSphere.radius, 2.2);
        orbitDistanceRef.current = Math.max(radius * 2.35, 8.5);
        controls.minDistance = orbitDistanceRef.current;
        controls.maxDistance = orbitDistanceRef.current;
        setCameraByDirection(new THREE.Vector3(1, 0.5, 1));
        controls.update();

        scene.add(fbx);
        modelRef.current = fbx;
        renderZoneMarkers(damageZones);
        setIsLoading(false);
      },
      undefined,
      (error) => {
        console.error('Error al cargar modelo 3D:', error);
        setLoadError('No se pudo cargar el modelo 3D del vehiculo');
        setIsLoading(false);
      }
    );

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = Math.max(container.clientWidth, 280);
      const nextHeight = Math.max(container.clientHeight, 280);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      controls.dispose();
      clearZoneMarkers();
      scene.traverse((obj: any) => {
        if (!obj.isMesh) return;
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: any) => mat.dispose && mat.dispose());
          } else {
            obj.material.dispose && obj.material.dispose();
          }
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;

    model.traverse((obj: any) => {
      if (!obj.isMesh || !obj.material) return;
      forEachMeshMaterial(obj.material, (mat) => {
        try {
          const baseColor = mat.userData?.baseColor as THREE.Color | undefined;
          if (baseColor && mat.color instanceof THREE.Color) {
            mat.color.copy(baseColor);
          }

          // Restaurar emisión base para no teñir todo el carro
          if (mat.emissive instanceof THREE.Color) {
            mat.emissive.set('#000000');
            mat.emissiveIntensity = 0;
          }

          mat.needsUpdate = true;
        } catch (error) {
          // Evitar que una variación de material rompa toda la app
          console.error('Error aplicando estado visual al material 3D:', error);
        }
      });
    });

    renderZoneMarkers(damageZones);
  }, [damageZones]);

  const setPresetView = (preset: 'front' | 'side' | 'top' | 'iso') => {
    if (preset === 'front') setCameraByDirection(new THREE.Vector3(0, 0.15, 1));
    if (preset === 'side') setCameraByDirection(new THREE.Vector3(1, 0.2, 0));
    if (preset === 'top') setCameraByDirection(new THREE.Vector3(0.01, 1, 0.01));
    if (preset === 'iso') setCameraByDirection(new THREE.Vector3(1, 0.5, 1));
  };

  const FallbackVehicle = () => (
    <div className="h-72 w-full rounded-lg border border-[#2f3238] bg-[#111827] flex items-center justify-center">
      <svg viewBox="0 0 420 220" className="w-[320px] h-[170px]">
        <rect x="86" y="96" width="248" height="70" rx="26" fill="#1f2937" stroke="#4b5563" />
        <rect x="140" y="68" width="142" height="44" rx="18" fill="#334155" stroke="#64748b" />
        <circle cx="145" cy="170" r="24" fill="#0f172a" stroke="#6b7280" />
        <circle cx="274" cy="170" r="24" fill="#0f172a" stroke="#6b7280" />
      </svg>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setPresetView('iso')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Isometrica
        </button>
        <button
          type="button"
          onClick={() => setPresetView('front')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Frente
        </button>
        <button
          type="button"
          onClick={() => setPresetView('side')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Lateral
        </button>
        <button
          type="button"
          onClick={() => setPresetView('top')}
          className="px-3 py-1 text-xs rounded-md border border-[#3b404a] text-ink-200 hover:text-white hover:border-primary-500"
        >
          Superior
        </button>
      </div>

      <div className="rounded-xl border border-[#2f3238] bg-[#0b1220] p-2 relative">
        <div ref={containerRef} className="h-72 w-full rounded-lg overflow-hidden" />
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
};

export default Vehicle3DModelViewer;
