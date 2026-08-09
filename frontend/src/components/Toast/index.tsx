import { useEffect } from 'react';
import styles from './index.module.less';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export default function Toast({
  message,
  onDismiss,
  duration = 5000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  return (
    <div className={styles.toast} role="alert" aria-live="assertive">
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  );
}
