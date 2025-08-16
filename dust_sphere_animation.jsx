import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/*
 Dust-sphere-animation — standalone Three.js implementation (no react-three-fiber)

 Why this rewrite?
 - Previous errors came from refs/JSX buffer attribute lifecycle when using react-three-fiber.
 - This version uses a plain Three.js scene created/managed inside useEffect so we control creation order and avoid "source"/ref timing issues.
 - Includes quick-tests (UI buttons) that verify geometry attribute counts and existence of the Points object.
 - Clean disposal on unmount to avoid GPU memory leaks.

 How to use:
 - Install three: `npm i three`
 - Drop this file into your React app and render <DustSphereApp />.

 Notes:
 - Defaults: particleCount=2000, baseRadius=5, pulseAmplitude=0.6, pulseSpeed=1.05 (5% faster), rotationSpeed=0.65 (30% faster relative baseline used earlier).
 - Animation updates particle positions every frame (moves particles along precomputed normals). This gives an "in-and-out" dust pulse.
*/

export default function DustSphereApp({
  particleCount = 2000,
  baseRadius = 5,
  pulseAmplitude = 0.6,
  pulseSpeed = 1.05,
  rotationSpeed = 0.65,
}) {
  const mountRef = useRef(null);
  const pointsRef = useRef(null); // stores Points object
  const rendererRef = useRef(null);
  const animationRef = useRef(null);
  const runningRef = useRef(true);

  const [running, setRunning] = useState(true);
  const [readyInfo, setReadyInfo] = useState(null);

  // sync state -> ref
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene + Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02020a);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 200);
    camera.position.set(0, 0, baseRadius * 3);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;

    // Lighting (subtle)
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // Build particle buffers (Fibonacci sphere for uniform distribution)
    const positions = new Float32Array(particleCount * 3);
    const normals = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const phi = Math.acos(1 - 2 * (i + 0.5) / particleCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      normals[i3] = x;
      normals[i3 + 1] = y;
      normals[i3 + 2] = z;

      // initial position on the base radius with tiny jitter
      const jitter = (Math.random() - 0.5) * 0.02;
      positions[i3] = x * (baseRadius + jitter);
      positions[i3 + 1] = y * (baseRadius + jitter);
      positions[i3 + 2] = z * (baseRadius + jitter);

      randoms[i] = Math.random();
    }

    // Geometry and material
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // store normals so we can move particles along them in JS
    geometry.setAttribute("normalVec", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0xffffff),
      opacity: 0.9,
    });

    const points = new THREE.Points(geometry, material);
    pointsRef.current = points;
    scene.add(points);

    // expose ready info slightly after mount so everything is attached
    setTimeout(() => {
      setReadyInfo({ particleCount, geometry, points });
      // Also log for debugging
      console.log("DustSphere mounted:", {
        particleCount,
        positionCount: geometry.attributes.position.count,
        hasPoints: !!pointsRef.current,
      });
    }, 0);

    // Animation loop
    const startTime = performance.now();
    function animate() {
      animationRef.current = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) / 1000; // seconds

      if (runningRef.current) {
        // pulse value between -pulseAmplitude and +pulseAmplitude
        const pulse = Math.sin(elapsed * pulseSpeed) * pulseAmplitude;

        // update positions along normals with per-particle randomness
        const pos = geometry.attributes.position.array;
        const nrm = geometry.attributes.normalVec.array;
        const rnd = geometry.attributes.aRandom.array;
        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;
          const r = rnd[i] * 0.8 + 0.2; // scale factor 0.2..1.0
          const localPulse = pulse * r;
          const noise = Math.sin(elapsed * (0.7 + r * 2.0) + i) * 0.005;
          const radius = baseRadius + localPulse;
          pos[i3] = nrm[i3] * (radius + noise);
          pos[i3 + 1] = nrm[i3 + 1] * (radius + noise);
          pos[i3 + 2] = nrm[i3 + 2] * (radius + noise);
        }
        geometry.attributes.position.needsUpdate = true;
      }

      // rotate the cloud (based on elapsed time to keep speed consistent)
      if (pointsRef.current) {
        pointsRef.current.rotation.y = elapsed * rotationSpeed;
        pointsRef.current.rotation.x = elapsed * (rotationSpeed * 0.18);
      }

      controls.update();
      renderer.render(scene, camera);
    }

    animate();

    // Resize handler
    function handleResize() {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", handleResize);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      if (pointsRef.current) scene.remove(pointsRef.current);
      try {
        geometry.dispose();
      } catch (e) {}
      try {
        material.dispose();
      } catch (e) {}
      try {
        renderer.dispose();
      } catch (e) {}
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      pointsRef.current = null;
      rendererRef.current = null;
    };
  }, [particleCount, baseRadius, pulseAmplitude, pulseSpeed, rotationSpeed]);

  // UI helpers / quick-tests
  function toggleRunning() {
    setRunning((r) => {
      runningRef.current = !r;
      return !r;
    });
  }

  function quickCheck() {
    if (!readyInfo) {
      alert("Not ready yet — wait a moment after mount");
      return;
    }
    const geom = readyInfo.geometry;
    const posAttr = geom && geom.attributes && geom.attributes.position;
    const posCount = posAttr ? posAttr.count : null;
    const okCount = posCount === readyInfo.particleCount;
    const message = `Particles: ${readyInfo.particleCount}\nposition attribute count: ${posCount}\ncount matches: ${okCount}\npoints object present: ${!!readyInfo.points}`;
    console.log("Quick check:", message);
    alert(message);
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative", overflow: "hidden" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Overlay UI */}
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ marginBottom: 8 }}>
          <button onClick={toggleRunning} style={{ padding: "8px 10px", marginRight: 8 }}>
            {running ? "Pause" : "Play"}
          </button>
          <button onClick={quickCheck} style={{ padding: "8px 10px" }}>
            Quick check
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.95 }}>
          <div>Particles: {readyInfo ? readyInfo.particleCount : "loading..."}</div>
          <div>Running: {running ? "yes" : "no"}</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>Tip: drag to rotate, scroll to zoom</div>
        </div>
      </div>
    </div>
  );
}
