import { useEffect, useRef } from 'react';

export default function UnicornBackground() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    // Evitar cargar múltiples veces
    if (sceneRef.current) return;

    const initScene = async () => {
      // Cargar el script de Unicorn Studio si no existe
      if (!window.UnicornStudio) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.36/dist/unicornStudio.umd.js';
        script.async = true;
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }

      // Inicializar la escena
      if (window.UnicornStudio && containerRef.current && !sceneRef.current) {
        try {
          sceneRef.current = await window.UnicornStudio.addScene({
            elementId: 'unicorn-bg',
            projectId: 'nCH8hV32kY1k5mNnn2QR',
            scale: 1,
            dpi: 1.5,
            fps: 60,
            lazyLoad: false,
            altText: 'DYOR Scanner Background',
          });
        } catch (err) {
          console.warn('Unicorn Studio failed to load:', err);
        }
      }
    };

    initScene();

    return () => {
      if (sceneRef.current && sceneRef.current.destroy) {
        sceneRef.current.destroy();
        sceneRef.current = null;
      }
    };
  }, []);

  return (
    <div
      id="unicorn-bg"
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}
