import type { ReactNode } from 'react';
import styles from './index.module.less';

interface MainProps {
  children: ReactNode;
}

export default function Main({ children }: MainProps) {
  return <main className={styles.main}>{children}</main>;
}
