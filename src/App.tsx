  import { useState, useEffect } from 'react';
  import { supabase } from './supabaseClient';
  import './index.css';

  // --- TIPAGENS ---
  interface TripEvent {
    id: string;
    name: string;
    created_at?: string;
  }

  interface Accommodation {
    id: string;
    event_id: string;
    title: string | null;
    url: string;
    price: number | null;
    bedrooms: number | null;
    beds: number | null;
    bathrooms: number | null;
    wifi: boolean | null;
    tv: boolean | null;
    air_conditioning: boolean | null;
    kitchen: boolean | null;
    parking: number | null;
    petfriendly: boolean | null;
    address: string | null;
    link_maps: string | null;
    additional_information: string | null;
  }

  type SortConfig = { key: keyof Accommodation; direction: 'asc' | 'desc' } | null;

  function App() {
    const [events, setEvents] = useState<TripEvent[]>([]);
    const [currentEventId, setCurrentEventId] = useState<string>('');
    const [newEventName, setNewEventName] = useState<string>('');
    const [urlInput, setUrlInput] = useState('');
    const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);
    const [filters, setFilters] = useState<Record<string, boolean | null>>({
      wifi: null, tv: null, air_conditioning: null, kitchen: null, petfriendly: null
    });

    // --- 1. BUSCA INICIAL ---
    useEffect(() => {
      fetchEventsAndAccommodations();
    }, []);

    const fetchEventsAndAccommodations = async () => {
      const { data: eventsData } = await supabase.from('events').select('*').order('created_at', { ascending: true });
      if (eventsData) {
        setEvents(eventsData);
        if (eventsData.length > 0) setCurrentEventId(eventsData[0].id);
      }
      const { data: accData } = await supabase.from('accommodations').select('*').order('created_at', { ascending: true });
      if (accData) setAccommodations(accData);
    };

    // --- 2. ESCUTA EM TEMPO REAL (O SEGREDO DO "FIM DO F5") ---
    useEffect(() => {
      // Cria um canal de comunicação com o Supabase
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'accommodations' },
          (payload) => {
            console.log('Mensagem do Realtime recebida!', payload);

            // Se for um INSERT (Seu amigo adicionou um link)
            if (payload.eventType === 'INSERT') {
              setAccommodations(prev => [...prev, payload.new as Accommodation]);
            }
            
            // Se for um UPDATE (O Robô terminou de raspar os dados)
            else if (payload.eventType === 'UPDATE') {
              setAccommodations(prev => prev.map(acc => 
                acc.id === payload.new.id ? (payload.new as Accommodation) : acc
              ));
            }
            
            // Se for um DELETE (Seu amigo deletou uma linha)
            else if (payload.eventType === 'DELETE') {
              setAccommodations(prev => prev.filter(acc => acc.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      // Limpa a escuta se você sair da página
      return () => {
        supabase.removeChannel(channel);
      };
    }, []);

    // --- RESTANTE DA LÓGICA (Mantida idêntica) ---
    const handleCreateEvent = async () => {
      if (!newEventName.trim()) return;
      const { data, error } = await supabase.from('events').insert([{ name: newEventName }]).select();
      if (!error && data) {
        setEvents([...events, data[0]]);
        setCurrentEventId(data[0].id);
        setNewEventName('');
      }
    };

    const handleAddLink = async () => {
      if (!urlInput.trim() || !currentEventId) return;
      const { error } = await supabase.from('accommodations').insert([{ url: urlInput, event_id: currentEventId }]);
      if (error) alert("Erro ao salvar hospedagem.");
      else setUrlInput(''); 
      // Repare que NÃO damos mais um push no state aqui. Deixamos o Realtime (useEffect) fazer isso sozinho!
    };

    const handleDeleteLink = async (id: string) => {
      if (!window.confirm("Excluir hospedagem?")) return;
      await supabase.from('accommodations').delete().eq('id', id);
      // Novamente, o React atualizará a tela sozinho via Realtime
    };

    const handleCellChange = (id: string, field: keyof Accommodation, value: string) => {
      setAccommodations(prev => prev.map(acc => (acc.id === id ? { ...acc, [field]: value } : acc)));
    };

    const handleCellBlur = async (id: string, field: keyof Accommodation, value: string) => {
      await supabase.from('accommodations').update({ [field]: value === '' ? null : value }).eq('id', id);
    };

    const handleSort = (columnKey: keyof Accommodation) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === columnKey && sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig && sortConfig.key === columnKey && sortConfig.direction === 'desc') {
        setSortConfig(null);
        return;
      }
      setSortConfig({ key: columnKey, direction });
    };

    const handleToggleFilter = (columnKey: string) => {
      setFilters(prev => ({ ...prev, [columnKey]: prev[columnKey] === null ? true : null }));
    };

    let displayedItems = accommodations.filter(acc => acc.event_id === currentEventId);

    Object.keys(filters).forEach(key => {
      if (filters[key] === true) displayedItems = displayedItems.filter(item => (item as any)[key] === true);
    });

    if (sortConfig !== null) {
      displayedItems.sort((a, b) => {
        const valA = Number(a[sortConfig.key]) || 0;
        const valB = Number(b[sortConfig.key]) || 0;
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    const renderBoolean = (value: boolean | null) => {
      if (value === true) return 'Sim';
      if (value === false) return 'Não';
      return '';
    };

    return (
      <div className="app-container">
        <h1>Planejador de Viagens</h1>

        <div className="trip-management" style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
          <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Selecionar Viagem:</label>
          <select value={currentEventId} onChange={(e) => setCurrentEventId(e.target.value)}>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <span style={{ margin: '0 15px' }}>ou</span>
          <input type="text" placeholder="Nome da nova tabela" value={newEventName} onChange={(e) => setNewEventName(e.target.value)} style={{ padding: '8px', marginRight: '5px' }} />
          <button onClick={handleCreateEvent}>Criar Nova Tabela</button>
        </div>

        <div className="top-bar">
          <input type="text" placeholder="Cole o link da hospedagem..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
          <button onClick={handleAddLink}>Adicionar Link</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th onClick={() => handleSort('price')} style={{ cursor: 'pointer', userSelect: 'none' }}>Preço {sortConfig?.key === 'price' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onClick={() => handleSort('bedrooms')} style={{ cursor: 'pointer', userSelect: 'none' }}>Quartos {sortConfig?.key === 'bedrooms' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onClick={() => handleSort('beds')} style={{ cursor: 'pointer', userSelect: 'none' }}>Camas {sortConfig?.key === 'beds' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onClick={() => handleSort('bathrooms')} style={{ cursor: 'pointer', userSelect: 'none' }}>Banheiros {sortConfig?.key === 'bathrooms' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onClick={() => handleSort('parking')} style={{ cursor: 'pointer', userSelect: 'none' }}>Vagas {sortConfig?.key === 'parking' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}</th>
                <th onClick={() => handleToggleFilter('wifi')} style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: filters.wifi ? '#e0f0ff' : '' }}>Wi-Fi {filters.wifi ? '🔍' : '⏳'}</th>
                <th onClick={() => handleToggleFilter('tv')} style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: filters.tv ? '#e0f0ff' : '' }}>TV {filters.tv ? '🔍' : '⏳'}</th>
                <th onClick={() => handleToggleFilter('air_conditioning')} style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: filters.air_conditioning ? '#e0f0ff' : '' }}>Ar Cond. {filters.air_conditioning ? '🔍' : '⏳'}</th>
                <th onClick={() => handleToggleFilter('kitchen')} style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: filters.kitchen ? '#e0f0ff' : '' }}>Cozinha {filters.kitchen ? '🔍' : '⏳'}</th>
                <th onClick={() => handleToggleFilter('petfriendly')} style={{ cursor: 'pointer', userSelect: 'none', backgroundColor: filters.petfriendly ? '#e0f0ff' : '' }}>Pet {filters.petfriendly ? '🔍' : '⏳'}</th>
                <th>Endereço</th>
                <th>Info. Adicional</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((acc) => (
                <tr key={acc.id}>
                  <td><a href={acc.url} target="_blank" rel="noreferrer">{acc.title || 'Carregando...'}</a></td>
                  <td><input type="number" className="editable-cell" value={acc.price || ''} onChange={(e) => handleCellChange(acc.id, 'price', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'price', e.target.value)} /></td>
                  <td><input type="number" className="editable-cell" value={acc.bedrooms || ''} onChange={(e) => handleCellChange(acc.id, 'bedrooms', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'bedrooms', e.target.value)} /></td>
                  <td><input type="number" className="editable-cell" value={acc.beds || ''} onChange={(e) => handleCellChange(acc.id, 'beds', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'beds', e.target.value)} /></td>
                  <td><input type="number" className="editable-cell" value={acc.bathrooms || ''} onChange={(e) => handleCellChange(acc.id, 'bathrooms', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'bathrooms', e.target.value)} /></td>
                  <td><input type="number" className="editable-cell" value={acc.parking || ''} onChange={(e) => handleCellChange(acc.id, 'parking', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'parking', e.target.value)} /></td>
                  <td>{renderBoolean(acc.wifi)}</td>
                  <td>{renderBoolean(acc.tv)}</td>
                  <td>{renderBoolean(acc.air_conditioning)}</td>
                  <td>{renderBoolean(acc.kitchen)}</td>
                  <td>{renderBoolean(acc.petfriendly)}</td>
                  <td><input type="text" className="editable-cell" value={acc.address || ''} onChange={(e) => handleCellChange(acc.id, 'address', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'address', e.target.value)} /></td>
                  <td><input type="text" className="editable-cell" value={acc.additional_information || ''} onChange={(e) => handleCellChange(acc.id, 'additional_information', e.target.value)} onBlur={(e) => handleCellBlur(acc.id, 'additional_information', e.target.value)} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => handleDeleteLink(acc.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }} title="Excluir link">🗑️</button>
                  </td>
                </tr>
              ))}
              {displayedItems.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Nenhuma hospedagem adicionada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  export default App;