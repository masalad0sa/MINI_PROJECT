import { useState, useEffect } from "react";
import { Loader } from "lucide-react";

interface LiveStatCardProps {
  icon: any;
  label: string;
  fetchValue: () => Promise<number | string>;
  pollingInterval?: number;
  color: string;
  tooltip?: string;
  initialValue?: number | string;
}

export function LiveStatCard({ 
  icon: Icon, 
  label, 
  fetchValue, 
  pollingInterval = 5000, 
  color,
  tooltip,
  initialValue = 0 
}: LiveStatCardProps) {
  const [value, setValue] = useState<number | string>(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let checkInterval: NodeJS.Timeout;

    const updateValue = async () => {
      try {
        const newValue = await fetchValue();
        setValue(newValue);
        setError(false);
      } catch (err) {
        console.error(`Failed to fetch live stat for ${label}`, err);
        setError(true);
      }
    };

    // Initial fetch if no initial value provided or just to be sure
    if (initialValue === 0) updateValue();

    // Set up polling
    checkInterval = setInterval(updateValue, pollingInterval);

    return () => clearInterval(checkInterval);
  }, [fetchValue, pollingInterval, label, initialValue]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 relative group cursor-help transition-all hover:shadow-md">
      <div className={`p-3 rounded-lg ${color} relative`}>
        <Icon className="w-6 h-6" />
        <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold text-slate-800">
                {error ? '!' : value}
            </h3>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-medium">LIVE</span>
        </div>
      </div>
      
      {tooltip && (
          <div className="absolute top-full text-center mt-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {tooltip}
          </div>
      )}
    </div>
  );
}
