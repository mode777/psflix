import { emulatorService } from '../services';
import { useControllerPorts } from '../hooks/useControllerPorts';
import { CONTROLLER_TYPES } from '../types';
import { cn } from '@/lib/cn';

export function PortManager() {
  const ports = useControllerPorts();

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">videogame_asset</span>
        Port Management
      </h3>
      <div className="space-y-3">
        <PortSelect
          label="Controller Port 1"
          value={ports.port1}
          allowEmpty={false}
          onChange={(type) => emulatorService.setController(1, type)}
        />
        <PortSelect
          label="Controller Port 2"
          value={ports.port2}
          allowEmpty
          onChange={(type) => emulatorService.setController(2, type)}
        />
      </div>
    </section>
  );
}

type PortSelectProps = {
  label: string;
  value: string;
  allowEmpty: boolean;
  onChange: (type: 'none' | 'standard' | 'dualshock' | 'mouse') => void;
};

function PortSelect({ label, value, allowEmpty, onChange }: PortSelectProps) {
  const isEmpty = value === 'none';
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase text-white/30 ml-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as 'none' | 'standard' | 'dualshock' | 'mouse')}
          className={cn(
            'w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs appearance-none cursor-pointer',
            'focus:border-primary/50 focus:ring-0 focus:outline-none',
            isEmpty && 'text-white/40 italic',
          )}
        >
          {allowEmpty && <option value="none">Empty</option>}
          {CONTROLLER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span
          className="material-symbols-outlined text-base text-white/40 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        >
          expand_more
        </span>
      </div>
    </div>
  );
}
