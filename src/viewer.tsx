import { Suspense, useMemo, Component, ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  useGLTF,
  Center,
} from "@react-three/drei";
import * as THREE from "three";
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty-page">
        <p>
          O visualizador 3D não está disponível neste dispositivo. Podes
          continuar com a fotografia.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Imported({
  url,
  color,
  texture,
}: {
  url: string;
  color: string;
  texture: string;
}) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = obj.material.clone();
        if (obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.color.set(color);
          obj.material.roughness = texture === "mesh" ? 0.9 : 0.35;
        }
      }
    });
    return root;
  }, [scene, color, texture]);
  return (
    <Center>
      <primitive object={clone} />
    </Center>
  );
}
function ConceptShoe({ color, texture }: { color: string; texture: string }) {
  const meshTexture = useMemo(() => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        const v = x % 6 < 2 && y % 6 < 2 ? 80 : 210;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    const tex = new THREE.DataTexture(data, 64, 64);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 3);
    tex.needsUpdate = true;
    return tex;
  }, []);
  return (
    <group rotation={[0, -0.35, -0.07]}>
      <mesh position={[0, -0.15, 0]} scale={[2.1, 0.22, 0.78]}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshStandardMaterial color="#ddd9ce" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.07, 0]} scale={[1.95, 0.45, 0.73]}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshStandardMaterial
          color={color}
          roughness={texture === "mesh" ? 0.9 : 0.35}
          bumpMap={texture === "mesh" ? meshTexture : null}
          bumpScale={0.06}
        />
      </mesh>
      <mesh position={[0.7, 0.31, 0]} scale={[0.8, 0.63, 0.61]}>
        <sphereGeometry args={[1, 40, 20]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0.8, 0.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.33, 0.09, 16, 40]} />
        <meshStandardMaterial color="#171719" />
      </mesh>
      {[-0.6, -0.35, -0.1, 0.15, 0.4].map((x, i) => (
        <mesh
          key={x}
          position={[x, 0.43 + i * 0.045, 0]}
          rotation={[0, 0, 0.06]}
        >
          <boxGeometry args={[0.075, 0.055, 0.85 - i * 0.05]} />
          <meshStandardMaterial color="#eeeae0" />
        </mesh>
      ))}
      <mesh position={[-0.25, 0.03, 0.7]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.95, 0.12, 0.05]} />
        <meshStandardMaterial color="#09090b" />
      </mesh>
    </group>
  );
}
export default function Viewer({
  modelUrl,
  color,
  texture,
}: {
  modelUrl?: string;
  color: string;
  texture: string;
}) {
  return (
    <Boundary>
      <div
        className="viewer-canvas"
        role="img"
        aria-label="Modelo 3D interativo, arrasta para rodar"
      >
        <Canvas
          camera={{ position: [3, 2.4, 5], fov: 45 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={1.7} />
          <directionalLight position={[4, 5, 3]} intensity={3} />
          <directionalLight position={[-3, 2, -2]} intensity={2} />
          <Suspense fallback={null}>
            {modelUrl ? (
              <Imported url={modelUrl} color={color} texture={texture} />
            ) : (
              <ConceptShoe color={color} texture={texture} />
            )}
            <ContactShadows
              position={[0, -0.4, 0]}
              opacity={0.5}
              scale={10}
              blur={2}
            />
          </Suspense>
          <OrbitControls
            enablePan={false}
            minDistance={3}
            maxDistance={9}
            autoRotate={false}
          />
        </Canvas>
      </div>
    </Boundary>
  );
}
