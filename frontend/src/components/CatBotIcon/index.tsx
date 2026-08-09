import aiChatDarkSvg from '@/assets/ai-chat-dark.svg?raw';
import styles from './index.module.less';

interface CatBotIconProps {
  size?: number;
}

export default function CatBotIcon({ size = 20 }: CatBotIconProps) {
  return (
    <span
      className={styles.icon}
      style={{ width: size, height: size }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: aiChatDarkSvg }}
    />
  );
}
