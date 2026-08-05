import { useEffect } from 'react';

interface Props {
  message?: string;
  type?: 'success' | 'error';
  duration?: number;
  onClose?: () => void;
}

export default function Toast({ message, type = 'success', duration = 3000, onClose }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onClose && onClose(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;
  return (
    <div className="toast-container">
      <div className={`toast ${type === 'success' ? 'toast-success' : 'toast-error'}`}>
        {message}
      </div>
    </div>
  );
}
