import { useEffect, useRef } from 'react';
import { engine } from '../utils/audioEngine';

export function Visualizer({ color = '#00F0FF' }: { color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let analyser = engine.getAnalyser();
    
    const resize = () => {
      if (!canvas || !ctx) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    
    window.addEventListener('resize', resize);
    resize();

    // Check periodically if the engine initialized
    const checkInterval = setInterval(() => {
      if (!analyser) {
        analyser = engine.getAnalyser();
      } else {
        clearInterval(checkInterval);
        startVisualizer(analyser);
      }
    }, 1000);
    
    if (analyser) {
      clearInterval(checkInterval);
      startVisualizer(analyser);
    }
    
    function startVisualizer(analyserNode: AnalyserNode) {
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationRef.current = requestAnimationFrame(draw);
        
        if (!canvas || !ctx) return;
        analyserNode.getByteFrequencyData(dataArray);
        
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        
        ctx.clearRect(0, 0, w, h);
        
        // We don't need all bins, just the first 120 (lower frequencies mostly)
        const bars = 64;
        const barWidth = (w / bars) - 2;
        let x = 0;
        
        for(let i = 0; i < bars; i++) {
          // Average a chunk of frequencies for smoother bars
          const chunk = Math.floor(bufferLength / bars / 4);
          let sum = 0;
          for (let j = 0; j < chunk; j++) {
            sum += dataArray[i * chunk + j];
          }
          const val = sum / chunk;
          
          const percent = val / 255;
          const barHeight = Math.max(percent * h * 0.8, 4); // Min height of 4px
          
          const y = h - barHeight;
          
          // Draw bar
          ctx.fillStyle = `${color}${Math.floor(percent * 255).toString(16).padStart(2, '0')}`;
          // Adding 40 to base opacity
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
          
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 4);
          ctx.fill();
          
          x += barWidth + 2;
        }
      };

      draw();
    }

    return () => {
      window.removeEventListener('resize', resize);
      clearInterval(checkInterval);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [color]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 0 10px rgba(0,240,255,0.2))' }}
    />
  );
}
