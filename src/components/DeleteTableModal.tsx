interface Props {
  open: boolean;
  tableName?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteTableModal({ open, tableName, loading, onCancel, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, maxWidth: 420, width: '90%', boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
        <h3 style={{ marginTop: 0 }}>Confirmar exclusão</h3>
        <p>Tem certeza que deseja excluir a tabela <strong>{tableName}</strong>? Esta ação é permanente e removerá também as hospedagens relacionadas.</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className="btn" onClick={onConfirm} disabled={loading}>{loading ? 'Excluindo...' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}
