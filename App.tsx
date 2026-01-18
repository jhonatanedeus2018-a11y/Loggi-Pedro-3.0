
import React, { useState, useRef, useCallback, memo } from 'react';
import * as XLSX from 'xlsx';
import { extractAddressesFromImage } from './services/geminiService';
import { DeliveryStop, AppStatus } from './types';
import { Button } from './components/Button';
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
  Layers
} from 'lucide-react';

const StopItem = memo(({ stop, onRemove }: { stop: DeliveryStop; onRemove: (id: string) => void }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform duration-200">
    <div className="bg-slate-900 text-white min-w-[48px] h-[48px] rounded-xl flex flex-col items-center justify-center shrink-0">
      <span className="text-[9px] font-bold opacity-40 leading-none mb-0.5">Nº</span>
      <span className="font-bold text-lg leading-none">{stop.stopNumber}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-slate-800 text-sm uppercase truncate tracking-tight">{stop.address}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] font-mono text-blue-600 font-bold">{stop.cep}</span>
        <span className="text-[10px] text-slate-400 font-medium uppercase truncate">{stop.city}</span>
      </div>
    </div>
    <button 
      onClick={() => onRemove(stop.id)}
      className="text-slate-300 hover:text-red-500 p-2 transition-colors"
      aria-label="Remover item"
    >
      <X size={18} />
    </button>
  </div>
));

const App: React.FC = () => {
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [processingStats, setProcessingStats] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const restartApp = useCallback(() => {
    if (stops.length > 0 && !confirm("Deseja limpar todos os dados?")) return;
    setStops([]);
    setStatus(AppStatus.IDLE);
    setErrorMessage(null);
    setProcessingStats({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (window.navigator.vibrate) window.navigator.vibrate(20);
  }, [stops.length]);

  const removeStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  }, []);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'RouteScan AI',
          text: 'Use este app para transformar prints de entrega em planilhas Excel!',
          url: window.location.href,
        });
      } catch (err) {
        console.log('Erro ao compartilhar', err);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copiado para a área de transferência!");
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setStatus(AppStatus.PROCESSING);
    setErrorMessage(null);
    setProcessingStats({ current: 0, total: files.length });

    const newStopsList: DeliveryStop[] = [];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      setProcessingStats(prev => ({ ...prev, current: i + 1 }));
      try {
        const base64 = await readFileAsBase64(files[i]);
        const result = await extractAddressesFromImage(base64);
        
        if (result.stops && result.stops.length > 0) {
          newStopsList.push(...result.stops);
        }
      } catch (err: any) {
        console.error(`Erro ao processar imagem ${i + 1}:`, err);
        hasError = true;
      }
    }

    if (newStopsList.length > 0) {
      setStops(prev => {
        const existingKeys = new Set(prev.map(s => `${s.stopNumber}-${s.address.toLowerCase()}`));
        const filteredNewStops = newStopsList.filter(s => !existingKeys.has(`${s.stopNumber}-${s.address.toLowerCase()}`));
        
        // Deduplicar também dentro da nova lista (caso prints sobreponham)
        const uniqueInNew = filteredNewStops.filter((v, i, a) => 
          a.findIndex(t => (t.stopNumber === v.stopNumber && t.address.toLowerCase() === v.address.toLowerCase())) === i
        );

        return [...prev, ...uniqueInNew];
      });
      setStatus(AppStatus.SUCCESS);
      if (window.navigator.vibrate) window.navigator.vibrate([50, 30, 50]);
    } else if (hasError) {
      setStatus(AppStatus.ERROR);
      setErrorMessage("Erro ao processar imagens. Tente novamente com prints mais nítidos.");
    } else {
      setStatus(AppStatus.IDLE);
      setErrorMessage("Nenhum dado encontrado nos prints selecionados.");
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportToExcel = () => {
    if (stops.length === 0) return;
    const sortedStops = [...stops].sort((a, b) => {
      const numA = parseInt(a.stopNumber) || 0;
      const numB = parseInt(b.stopNumber) || 0;
      return numA - numB;
    });

    const ws = XLSX.utils.json_to_sheet(sortedStops.map(s => ({
      "ORDEM": s.stopNumber,
      "ENDEREÇO": s.address,
      "CEP": s.cep,
      "CIDADE": s.city
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Roteiro");
    XLSX.writeFile(wb, `Roteiro_Entregas_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32 selection:bg-blue-100">
      <header className="bg-white px-4 pt-8 pb-6 sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
            <Package size={20} className="text-white" />
          </div>
          <h1 className="font-black text-lg tracking-tight">RouteScan</h1>
        </div>
        
        <div className="flex gap-1">
          <button onClick={handleShare} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
            <Share2 size={20} />
          </button>
          <button onClick={restartApp} className="p-2 text-slate-400 hover:text-slate-600 transition-transform active:rotate-180 duration-500">
            <RefreshCcw size={20} />
          </button>
          <button onClick={() => setShowInfoModal(true)} className="p-2 text-slate-400 hover:text-blue-600">
            <Info size={20} />
          </button>
        </div>
      </header>

      <main className="px-4 mt-6 max-w-md mx-auto">
        {status === AppStatus.ERROR && (
          <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} className="text-red-500 shrink-0" />
            <p className="text-xs font-bold text-red-700">{errorMessage}</p>
          </div>
        )}

        {stops.length === 0 && status !== AppStatus.PROCESSING ? (
          <div className="mt-6 text-center animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Camera size={36} />
            </div>
            <h2 className="text-xl font-black mb-2 tracking-tight">Scanner em Lote</h2>
            <p className="text-slate-400 text-sm mb-8 px-6 leading-relaxed">Selecione <span className="text-blue-600 font-bold">vários prints</span> de uma vez para processar todo o seu roteiro.</p>
            
            <div className="grid gap-2 mb-10 text-left">
              {[
                { label: "Tire prints de todas as páginas", icon: <Layers size={14}/> },
                { label: "Selecione todos os arquivos", icon: <Upload size={14}/> },
                { label: "O app une tudo em uma lista", icon: <Smartphone size={14}/> }
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
                  <div className="bg-blue-50 p-2 rounded-lg text-blue-500">{step.icon}</div>
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">{step.label}</span>
                  <ChevronRight size={14} className="ml-auto text-slate-200" />
                </div>
              ))}
            </div>

            <Button onClick={() => fileInputRef.current?.click()} className="w-full py-4.5 rounded-2xl text-lg font-black shadow-xl shadow-blue-100">
              <Upload size={20} /> Importar Prints
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pb-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${status === AppStatus.PROCESSING ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></div>
                {status === AppStatus.PROCESSING 
                  ? `Lendo print ${processingStats.current} de ${processingStats.total}...` 
                  : `${stops.length} Pacotes Carregados`
                }
              </h3>
            </div>

            <div className="grid gap-2">
              {stops.map((stop) => (
                <StopItem key={stop.id} stop={stop} onRemove={removeStop} />
              ))}
              
              {status === AppStatus.PROCESSING && (
                <div className="bg-white p-8 rounded-2xl border border-slate-100 flex flex-col items-center justify-center gap-4 animate-pulse">
                  <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Processando Lote</p>
                    <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">Arquivo {processingStats.current} de {processingStats.total}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {stops.length > 0 && (
        <div className="fixed bottom-6 left-4 right-4 flex gap-3 z-40">
          <Button 
            onClick={() => fileInputRef.current?.click()} 
            className="flex-1 py-4.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl"
            loading={status === AppStatus.PROCESSING}
          >
            <Camera size={18} /> + Adicionar
          </Button>
          <Button 
            variant="success" 
            onClick={exportToExcel}
            className="flex-1 py-4.5 rounded-2xl shadow-2xl shadow-emerald-100"
          >
            <FileSpreadsheet size={18} /> Planilha
          </Button>
        </div>
      )}

      {showInfoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end justify-center px-4 pb-4">
          <div className="bg-white w-full rounded-[2rem] p-8 animate-in slide-in-from-bottom duration-300 max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>
            
            <div className="text-center">
              <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                <Globe size={32} />
              </div>
              <h3 className="text-xl font-black mb-2 text-slate-800 tracking-tight">Tornar Público</h3>
              <p className="text-xs text-slate-400 font-medium mb-8">Dicas para usar seu RouteScan como um Profissional:</p>
              
              <div className="space-y-4 mb-8 text-left">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-blue-600 text-white w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black">1</div>
                    <p className="text-sm font-black text-slate-700">Seleção Múltipla</p>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Você pode selecionar <span className="font-bold">todos os prints</span> de uma vez na galeria. O app irá processar um por um e juntar tudo na mesma planilha, removendo endereços repetidos.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-blue-600 text-white w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black">2</div>
                    <p className="text-sm font-black text-slate-700">Instalar no Celular</p>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                    Abra o link no Chrome, toque em <span className="font-bold">"Instalar aplicativo"</span>. Ele aparecerá na sua tela inicial como um app real, sem precisar de navegador.
                  </p>
                  <div className="flex gap-2">
                    <div className="bg-white px-2 py-1 rounded text-[9px] font-bold text-slate-400 border border-slate-100 uppercase">Seguro</div>
                    <div className="bg-white px-2 py-1 rounded text-[9px] font-bold text-slate-400 border border-slate-100 uppercase">PWA</div>
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Share2 size={16} className="text-blue-600" />
                    <p className="text-sm font-black text-blue-800">Enviar Link</p>
                  </div>
                  <button 
                    onClick={handleShare}
                    className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                  >
                    Compartilhar <ExternalLink size={14} />
                  </button>
                </div>
              </div>

              <Button onClick={() => setShowInfoModal(false)} variant="secondary" className="w-full py-4 rounded-2xl text-xs font-black">Entendido!</Button>
            </div>
          </div>
        </div>
      )}

      <input 
        type="file" 
        accept="image/*" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
      />
    </div>
  );
};

export default App;
