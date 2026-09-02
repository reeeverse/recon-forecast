import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function GridFloor() {
  const ref = useRef();
  const lineCount = 40;
  const spread = 60;

  const positions = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= lineCount; i++) {
      const x = (i / lineCount) * spread - spread / 2;
      pts.push(x, 0, -spread / 2, x, 0, spread / 2);
      pts.push(-spread / 2, 0, x, spread / 2, 0, x);
    }
    return new Float32Array(pts);
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.z = (clock.elapsedTime * 4) % (spread / lineCount);
    }
  });

  return (
    <group ref={ref} rotation={[-Math.PI * 0.3, 0, 0]} position={[0, -5, 0]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#00ff88" transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
}

function HorizonGlow() {
  return (
    <mesh position={[0, -3, -20]}>
      <planeGeometry args={[120, 4]} />
      <meshBasicMaterial color="#00cfff" transparent opacity={0.07} />
    </mesh>
  );
}

function FloatingData() {
  const group = useRef();
  const cubes = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      x: (Math.random() - 0.5) * 30,
      y: Math.random() * 10 - 2,
      z: -Math.random() * 20 - 5,
      speed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    })), []);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const c = cubes[i];
      child.position.y = c.y + Math.sin(clock.elapsedTime * c.speed + c.phase) * 0.5;
      child.rotation.y = clock.elapsedTime * c.speed * 0.5;
    });
  });

  return (
    <group ref={group}>
      {cubes.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshBasicMaterial color={i % 2 === 0 ? "#00ff88" : "#00cfff"} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export default function CyberpunkGrid() {
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    return <div style={{ position: "fixed", inset: 0, background: "#000000", zIndex: 0 }} />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000", zIndex: 0 }}>
      <Canvas camera={{ position: [0, 5, 15], fov: 65 }}>
        <GridFloor />
        <HorizonGlow />
        <FloatingData />
        <fog attach="fog" args={["#000000", 20, 60]} />
      </Canvas>
    </div>
  );
}
