import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  description?: string;
  extra?: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'plain';
}

export function SectionCard({ title, description, extra, children, variant = 'default' }: SectionCardProps) {
  return (
    <Card
      className={variant === 'plain' ? 'admin-section-card admin-section-card-plain' : 'admin-section-card'}
      title={
        <div className="section-head">
          <span className="section-title">{title}</span>
          {description ? <Typography.Text type="secondary" className="section-desc">{description}</Typography.Text> : null}
        </div>
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
