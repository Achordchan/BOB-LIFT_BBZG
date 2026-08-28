import { Card } from 'antd';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  /** 已按需求全后台隐藏标题下的解释性小字；保留该属性仅为兼容现有调用点 */
  description?: string;
  extra?: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'plain';
}

export function SectionCard({ title, extra, children, variant = 'default' }: SectionCardProps) {
  return (
    <Card
      className={variant === 'plain' ? 'admin-section-card admin-section-card-plain' : 'admin-section-card'}
      title={
        <div className="section-head">
          <span className="section-title">{title}</span>
        </div>
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
