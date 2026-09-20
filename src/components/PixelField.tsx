import { useEffect, useRef } from 'react';

// A native, animated cellular field echoes the computational artwork in the reference.
export function PixelField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let visible = true;
    let lastTime = 0;
    const draw = (time: number) => {
      if (visible && (time - lastTime > 80 || reduced.matches)) {
        lastTime = time;
        const width = element.clientWidth;
        const height = element.clientHeight;
        const ratio = Math.min(devicePixelRatio, 2);
        if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
          element.width = Math.round(width * ratio);
          element.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const phase = reduced.matches ? 0.3 : time * 0.000045;
        const spacing = 5.2;
        for (let y = 12; y < height - 12; y += spacing) {
          for (let x = 8; x < width - 8; x += spacing) {
            const px = (x - width * 0.52) / (height * 0.44);
            const py = (y - height * 0.5) / (height * 0.44);
            const a = Math.atan2(py, px);
            const d = Math.hypot(px * 0.86, py);
            const surface = 0.79 + 0.11 * Math.sin(3 * a + phase) + 0.045 * Math.sin(7 * a - phase);
            const band = Math.exp(-Math.pow((d - surface) / 0.32, 2));
            const light = 0.5 + 0.5 * Math.sin(a * 2 + d * 8 + phase);
            const wave = 0.5 + 0.5 * Math.sin(px * 10 + py * 6 + phase * 2);
            const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
            const strength = band * (0.33 + light * 0.6);
            if (Math.abs(noise) < strength && d < 1.43) {
              const size = 1.3 + strength * 1.65 + wave * 0.35;
              context.fillStyle = `rgba(25,27,23,${0.25 + strength * 0.75})`;
              context.fillRect(Math.round(x), Math.round(y), size, size);
            }
          }
        }
      }
      if (!reduced.matches) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(element);
    const resize = new ResizeObserver(() => { lastTime = 0; if (reduced.matches) draw(1); });
    resize.observe(element);
    draw(100);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); };
  }, []);
  return <canvas ref={canvas} className="pixel-field" aria-hidden="true" />;
}
