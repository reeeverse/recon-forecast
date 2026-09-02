import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function Particles() {
  const mesh = useRef();

  const count = 3000;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 80;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 80;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return arr;
  }, []);

  const velocities = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      arr[i] = (Math.random() - 0.5) * 0.01;
    }
    return arr;
  }, []);

  useFrame(() => {
    if (!mesh.current) return;
    const pos = mesh.current.geometry.attributes.position.array;
    for (let i = 0; i < count * 3; i++) {
      pos[i] += velocities[i];
      if (Math.abs(pos[i]) > 40) velocities[i] *= -1;
    }
    mesh.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#60a5fa"
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

function ConnectingLines() {
  const ref = useRef();

  const linePositions = useMemo(() => {
    const pts = [];
    const spread = 30;
    for (let i = 0; i < 80; i++) {
      const x1 = (Math.random() - 0.5) * spread;
      const y1 = (Math.random() - 0.5) * spread;
      const z1 = (Math.random() - 0.5) * spread;
      pts.push(x1, y1, z1, x1 + (Math.random() - 0.5) * 8, y1 + (Math.random() - 0.5) * 8, z1 + (Math.random() - 0.5) * 8);
    }
    return new Float32Array(pts);
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.02;
    }
  });

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={linePositions.length / 3}
          array={linePositions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#3b82f6" transparent opacity={0.15} />
    </lineSegments>
  );
}

export default function DarkParticle() {
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    return <div style={{ position: "fixed", inset: 0, background: "#080810", zIndex: 0 }} />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080810", zIndex: 0 }}>
      <Canvas camera={{ position: [0, 0, 30], fov: 60 }}>
        <Particles />
        <ConnectingLines />
      </Canvas>
    </div>
  );
}
