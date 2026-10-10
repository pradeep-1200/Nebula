import { useState, useEffect } from 'react';
import { engine } from '../utils/audioEngine';
import { X, Sliders } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import type { EqPreset } from '../stores/settingsStore';

const PRESETS: Record<EqPreset, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Rock': [4, 3, 2, 0, -1, -1, 0, 2, 3, 4],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Vocal': [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
  'Custom': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Custom is loaded from store dynamically
};

export function Equalizer({ onClose }: { onClose: () => void }) {
  const { eqPreset, setEqPreset, eqCustomBands, setEqCustomBands } = useSettingsStore();
  const [gains, setGains] = useState<number[]>(eqCustomBands || new Array(10).fill(0));
  const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  useEffect(() => {
    setGains(engine.getEqBandGains());
  }, []);

  const handleGainChange = (index: number, value: number) => {
    const newGains = [...gains];
    newGains[index] = value;
    setGains(newGains);
    setEqCustomBands(newGains);
    setEqPreset('Custom'); // Automatically switch to custom when user drags
  };

  const handlePresetChange = (preset: EqPreset) => {
    setEqPreset(preset);
    let newGains = preset === 'Custom' ? eqCustomBands : PRESETS[preset];
    setGains(newGains);
    setEqCustomBands(newGains);
  };

  const resetEq = () => {
    handlePresetChange('Flat');
  };

  return (
    <div className="absolute bottom-24 right-6 w-96 bg-space-900/90 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl p-6 z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sliders size={20} className="text-nebula-cyan" />
          <h3 className="font-heading font-semibold text-lg text-white">Equalizer</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm text-gray-400 font-medium">Preset</span>
        <select 
          value={eqPreset}
          onChange={(e) => handlePresetChange(e.target.value as EqPreset)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-nebula-cyan/50 focus:bg-white/10 transition-colors"
        >
          {Object.keys(PRESETS).map(p => (
            <option key={p} value={p} className="bg-space-900">{p}</option>
          ))}
        </select>
      </div>
      
      <div className="flex justify-between items-end h-48 mb-6 gap-2">
        {frequencies.map((freq, i) => (
          <div key={freq} className="flex flex-col items-center flex-1 h-full">
            <div className="flex-1 w-full relative flex justify-center py-2">
              <input
                type="range"
                min="-12"
                max="12"
                step="0.1"
                value={gains && gains[i] !== undefined ? gains[i] : 0}
                onChange={(e) => handleGainChange(i, parseFloat(e.target.value))}
                className="eq-slider appearance-none bg-transparent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[160px] h-2 rounded-full cursor-pointer"
                style={{
                  transform: 'translate(-50%, -50%) rotate(-90deg)',
                  accentColor: '#00F0FF'
                }}
              />
              {/* Center detent marker */}
              <div className="absolute top-1/2 w-4 h-0.5 bg-white/20 -translate-y-1/2 pointer-events-none" />
            </div>
            <span className="text-[10px] text-gray-400 mt-2 font-variant-numeric tabular-nums">
              {freq >= 1000 ? `${freq/1000}k` : freq}
            </span>
          </div>
        ))}
      </div>
      
      <div className="flex justify-between items-center text-xs">
        <span className="text-nebula-cyan font-medium tabular-nums">
          {gains && gains[0] !== undefined ? (gains[0] > 0 ? '+' : '') + gains[0].toFixed(1) : '0.0'} dB
        </span>
        <button onClick={resetEq} className="px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">
          Reset
        </button>
      </div>
      
      <style>{`
        .eq-slider::-webkit-slider-runnable-track {
          background: rgba(255,255,255,0.1);
          height: 4px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
