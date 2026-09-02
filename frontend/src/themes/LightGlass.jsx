import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function GradientSphere({ position, color1, color2, speed, scale }) {
  const mesh = useRef();
  const origin = [...position];

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime * speed;
    mesh.current.position.x = origin[0] + Math.sin(t) * 3;
    mesh.current.position.y = origin[1] + Math.cos(t * 0.7) * 2;
    mesh.current.rotation.z = t * 0.1;
  });

  return (
    <mesh ref={mesh} position={position} scale={scale}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial
        color={color1}
        transparent
        opacity={0.55}
        roughness={0}
        metalness={0.1}
      />
    </mesh>
  );
}

export default function LightGlass() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#eef2ff", zIndex: 0 }}>
      <Canvas camera={{ position: [0, 0, 20], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <GradientSphere position={[-6, 3, -5]} color1="#818cf8" speed={0.3} scale={8} />
        <GradientSphere position={[5, -2, -8]} color1="#a78bfa" speed={0.2} scale={10} />
        <GradientSphere position={[2, 5, -3]} color1="#60a5fa" speed={0.4} scale={6} />
      </Canvas>
    </div>
  );
}
