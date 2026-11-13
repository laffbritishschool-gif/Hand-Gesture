import * as THREE from "three";

export function createHologram(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const group = new THREE.Group();
  scene.add(group);

  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x32dff4, transparent: true, opacity: 0.23, wireframe: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.012, 8, 180), ringMaterial);
  ring.rotation.x = -0.42;
  group.add(ring);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.008, 8, 160),
    new THREE.MeshBasicMaterial({ color: 0x64f4ff, transparent: true, opacity: 0.2 })
  );
  innerRing.rotation.x = 0.72;
  innerRing.rotation.y = 0.3;
  group.add(innerRing);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(4.1, 0.006, 6, 180),
    new THREE.MeshBasicMaterial({ color: 0x1b8ba8, transparent: true, opacity: 0.16 })
  );
  orbit.rotation.set(1.1, 0.3, 0.2);
  group.add(orbit);

  const particleCount = 420;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const radius = 2.8 + Math.random() * 2.5;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.45;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: 0x54eaff, size: 0.025, transparent: true, opacity: 0.55, sizeAttenuation: true })
  );
  group.add(particles);

  let width = 1;
  let height = 1;
  const resize = () => {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let active = true;
  const clock = new THREE.Clock();
  const animate = () => {
    if (!active) return;
    const time = clock.getElapsedTime();
    group.rotation.y = Math.sin(time * 0.12) * 0.12;
    ring.rotation.z = time * 0.025;
    innerRing.rotation.z = -time * 0.035;
    particles.rotation.y = -time * 0.012;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();

  return {
    setVisible(visible) { container.style.opacity = visible ? "1" : "0"; },
    destroy() {
      active = false;
      observer.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}