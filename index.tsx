
import React, { useState, useRef, useCallback, memo } from 'react';
import ReactDOM from 'react-dom/client';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  FileSpreadsheet, 
  Camera, 
  Upload, 
  AlertCircle,
  Package,
  Info,
  X,
  Smartphone,
  ChevronRight,
  RefreshCcw,
  Share2,
  ExternalLink,
  Globe,
  Layers,
  CheckCircle2
} from 'lucide-react';

// --- CONFIGURAÇÃO E TIPOS ---
interface DeliveryStop {
  id: string;
  stopNumber: string;
  address: string;
  cep: string;
  city: string;
}

interface ExtractionResult {
  stops: DeliveryStop[];
}

enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

// --- FUNÇÃO DE LIMPEZA DE JSON ---
const extractJson = (text: string) => {
  try {
    // Tenta encontrar o conteúdo entre blocos de código markdown ```json ... ```
    const match = text.match(/```json\s?([\s\S]*?)\s?```/) || text.match(/```\s?([\s\S]*?)\s?```/);
    const jsonStr = match ? match[1] : text;
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("Erro ao limpar JSON:", e);
    // Se falhar, tenta limpar caracteres não-JSON comuns no início/fim
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return JSON.parse(text.substring(start, end + 1));
      }
    } catch (e2) {
      throw new Error("Não foi possível processar a resposta do servidor.");
    }
    throw e;
  }
};

// --- SERVIÇO DE IA (GEMINI) ---
const extractAddressesFromImage = async (base64DataUrl: string): Promise<ExtractionResult> => {
  // Conforme as diretrizes, a chave deve vir de process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error("Formato de imagem inválido.");
  
  const mimeType = matches[1];
  const base64Data = matches[2];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Você é um assistente de logística. Extraia rigorosamente todos os dados de pacotes/entregas deste print. Retorne EXCLUSIVAMENTE um objeto JSON com a chave 'stops', contendo 'stopNumber', 'address', 'cep' e 'city' para cada item." }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stops: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stopNumber: { type: Type.STRING },
                  address: { type: Type.STRING },
                  cep: { type: Type.STRING },
                  city: { type: Type.STRING },
                },
                required: ["stopNumber", "address", "cep", "city"],
              },
            },
          },
          required: ["stops"],
        },
      },
    });

    if (!response.text) throw new Error("A IA retornou uma resposta vazia.");
    
    const parsed = extractJson(response.text) as ExtractionResult;
    return {
      stops: (parsed.stops || []).map((s, i) => ({
        ...s,
        id: `s-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
        // Formatação básica de CEP
        cep: s.cep ? s.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') : ""
      }))
    };
  } catch (err) {
    console.error("Erro na extração:", err);
    throw err;
  }
};

// --- COMPONENTES DE INTERFACE ---
const Button = ({ variant = 'primary', loading = false, className = '', children, ...props }: any) => {
  const variants: any = {
    primary: "bg-blue-600 text-white shadow-lg shadow-blue-100",
    secondary: "bg-slate-100 text-slate-700",
    success: "bg-emerald-500 text-white shadow-lg shadow-emerald-100",
    outline: "bg-transparent border-2 border-slate-200 text-slate-500"
  };
  return (
    <button 
      className={`px-4 py-3.5 rounded-2xl font-black transition-all active:scale-[0.96] flex items-center justify-center gap-2 disabled:opacity-50 text-sm ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : children}
    </button>
  );
};

const StopItem = memo(({ stop, onRemove }: { stop: DeliveryStop; onRemove: (id: string) => void }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
    <div className="bg-slate-900 text-white min-w-[44px] h-[44px] rounded-xl flex flex-col items-center justify-center shrink-0">
      <span className="text-[8px] font-bold opacity-40 leading-none">ID</span>
      <span className="font-bold text-base leading-none">{stop.stopNumber}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-slate-800 text-xs uppercase truncate leading-tight">{stop.address}</p>
      <p className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">{stop.cep} • {stop.city}</p>
    </div>
    <button onClick={() => onRemove(stop.id)} className="text-slate-200 hover:text-red-500 p-2 transition-colors">
      <X size={18} />
    </button>
  </div>
));

// --- APLICATIVO PRINCIPAL ---
const App = () => {
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showInfo, setShowInfo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStatus(AppStatus.PROCESSING);
    setProgress({ current: 0, total: files.length });
    const batch: DeliveryStop[] = [];

    for (let i = 0; i < files.length; i++) {
      setProgress(p => ({ ...p, current: i + 1 }));
      try {
        const base64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(files[i]);
        });
        const result = await extractAddressesFromImage(base64);
        batch.push(...result.stops);
      } catch (err) { 
        console.error("Erro no arquivo:", files[i].name, err); 
      }
    }

    setStops(prev => {
      const all = [...prev, ...batch];
      // Deduplicação por número e endereço
      return all.filter((v, i, a) => 
        a.findIndex(t => t.stopNumber === v.stopNumber && t.address.toLowerCase().trim() === v.address.toLowerCase().trim()) === i
      ).sort((a,b) => (parseInt(a.stopNumber) || 0) - (parseInt(b.stopNumber) || 0));
    });

    setStatus(AppStatus.SUCCESS);
    if (fileRef.current) fileRef.current.value = '';
    if (window.navigator.vibrate) window.navigator.vibrate([50, 30, 50]);
  };

  const exportExcel = () => {
    if (stops.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(stops.map(s => ({ 
      "ORDEM": s.stopNumber, 
      "ENDEREÇO": s.address, 
      "CEP": s.cep, 
      "CIDADE": s.city 
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lista de Entregas");
    XLSX.writeFile(wb, `RouteScan_Export_${new Date().getTime()}.xlsx`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'RouteScan AI', url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copiado!");
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-36 flex flex-col">
      <header className="bg-white/90 backdrop-blur-xl sticky top-0 z-50 px-5 py-6 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-100">
            <Package size={20} />
          </div>
          <span className="font-black tracking-tight text-xl text-slate-900">RouteScan</span>
        </div>
        <div className="flex gap-1">
          <button onClick={handleShare} className="p-2 text-slate-400 hover:text-blue-600"><Share2 size={20} /></button>
          <button onClick={() => setShowInfo(true)} className="p-2 text-slate-400 hover:text-blue-600"><Info size={20} /></button>
          <button onClick={() => setStops([])} className="p-2 text-slate-400 hover:text-slate-600"><RefreshCcw size={20} /></button>
        </div>
      </header>

      <main className="p-5 flex-1">
        {stops.length === 0 && status !== AppStatus.PROCESSING ? (
          <div className="text-center py-16 animate-in fade-in zoom-in-95 duration-700">
            <div className="bg-blue-50 w-24 h-24 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 text-blue-600 shadow-inner">
              <Layers size={40} />
            </div>
            <h2 className="font-black text-2xl mb-3 text-slate-800">Scanner de Lote</h2>
            <p className="text-slate-400 text-sm px-10 mb-10 leading-relaxed">
              Tire print de todas as telas da sua rota e selecione-as de uma vez. A inteligência artificial une tudo sem duplicatas.
            </p>
            <div className="grid gap-3 mb-10 text-left">
              <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                <div className="bg-blue-50 p-2 rounded-lg"><CheckCircle2 size={16} className="text-blue-500" /></div>
                <span className="text-xs font-bold text-slate-600 uppercase">Processamento múltiplo</span>
              </div>
              <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                <div className="bg-blue-50 p-2 rounded-lg"><CheckCircle2 size={16} className="text-blue-500" /></div>
                <span className="text-xs font-bold text-slate-600 uppercase">Deduplicação automática</span>
              </div>
            </div>
            <Button onClick={() => fileRef.current?.click()} className="w-full py-5 text-lg shadow-xl shadow-blue-100">
              <Upload size={22} /> Importar Todos os Prints
            </Button>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex justify-between items-end px-1 pb-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Status do Scanner</span>
                <span className="text-lg font-black text-slate-800">
                  {status === AppStatus.PROCESSING 
                    ? `Lendo ${progress.current} de ${progress.total}` 
                    : `${stops.length} Paradas Identificadas`
                  }
                </span>
              </div>
            </div>

            {stops.map(s => <StopItem key={s.id} stop={s} onRemove={id => setStops(prev => prev.filter(x => x.id !== id))} />)}
            
            {status === AppStatus.PROCESSING && (
              <div className="bg-white p-10 rounded-3xl border-2 border-dashed border-blue-100 flex flex-col items-center justify-center animate-pulse">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Analisando Imagem {progress.current}...</span>
                <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase">Não feche o aplicativo</p>
              </div>
            )}
          </div>
        )}
      </main>

      {stops.length > 0 && (
        <div className="fixed bottom-8 left-6 right-6 flex gap-3 z-50">
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="flex-1 bg-white" loading={status === AppStatus.PROCESSING}>
            <Camera size={20} /> + Prints
          </Button>
          <Button onClick={exportExcel} variant="success" className="flex-[1.5] shadow-emerald-200">
            <FileSpreadsheet size={20} /> Gerar Planilha
          </Button>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end">
          <div className="bg-white w-full rounded-t-[3rem] p-10 animate-in slide-in-from-bottom duration-500 shadow-2xl">
            <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>
            <h3 className="font-black text-2xl mb-6 text-slate-800">Manual de Uso</h3>
            <div className="space-y-6 mb-10">
              <div className="flex gap-4">
                <div className="bg-blue-50 p-3 rounded-2xl text-blue-600 h-fit"><Smartphone size={24} /></div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Tire os Prints</h4>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">Capture todas as páginas da sua lista de pacotes no app de logística.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="bg-blue-50 p-3 rounded-2xl text-blue-600 h-fit"><Layers size={24} /></div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Seleção em Massa</h4>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">Segure o dedo sobre o primeiro print e selecione todos os outros de uma vez ao importar.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600 h-fit"><FileSpreadsheet size={24} /></div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Deduplicação</h4>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">O app remove pacotes que apareceram em mais de um print automaticamente.</p>
                </div>
              </div>
            </div>
            <Button onClick={() => setShowInfo(false)} className="w-full py-4.5 rounded-2xl">Entendido, vamos lá!</Button>
          </div>
        </div>
      )}

      <input type="file" multiple accept="image/*" className="hidden" ref={fileRef} onChange={processFiles} />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
