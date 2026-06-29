import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';

export function SectionCard(props: { title: string; description?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card className="admin-section-card" title={<div><div>{props.title}</div>{props.description ? <Typography.Text type="secondary" className="section-desc">{props.description}</Typography.Text> : null}</div>} extra={props.extra}>
      {props.children}
    </Card>
  );
}
