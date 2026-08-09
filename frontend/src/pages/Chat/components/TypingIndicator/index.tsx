import CatBotIcon from '@/components/CatBotIcon';
import styles from './index.module.less';

export default function TypingIndicator() {
  return (
    <div className={styles.row} aria-label="AI is thinking">
      <div className={styles.avatar}>
        <CatBotIcon size={26} />
      </div>
      <div className={styles.indicator}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
